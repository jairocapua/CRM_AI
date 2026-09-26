import type { Channel, ID, Message, MessageStatus } from "@/types";
import { nowIso } from "./clock";
import { db } from "./db";

/**
 * The mock's stand-in for a carrier / mail server.
 *
 * A real backend reports delivery on its own schedule (webhooks, push, a
 * poll), so the client never decides that a message was delivered — it only
 * renders whatever status the server holds. This module plays that role:
 * `send()` hands a queued message over and the "server" walks it through the
 * delivery states on timers, failing the final hop at the Demo Data failure
 * rate. Against a real backend this file is simply deleted.
 *
 * Status changes are reported through `onChange` so the mock never imports the
 * API layer's cache.
 */
const HOPS: { status: MessageStatus; afterMs: number }[] = [
  { status: "sending", afterMs: 450 },
  { status: "sent", afterMs: 900 },
  { status: "delivered", afterMs: 1400 },
];

const FAILURE_REASONS: Partial<Record<Channel, string>> = {
  sms: "Carrier rejected the message (error 30007).",
  whatsapp: "Recipient is outside the 24-hour messaging window.",
  email: "Mailbox unavailable (550). The address may be wrong.",
  messenger: "Messenger could not reach this person right now.",
  instagram: "Instagram could not deliver this message.",
  livechat: "The visitor left the chat before it was delivered.",
};

const timers = new Map<ID, ReturnType<typeof setTimeout>>();

export interface DeliveryOptions {
  /** 0–1, read when the final hop runs so the slider applies live. */
  failureRate: () => number;
  onChange: () => void;
}

function write(id: ID, patch: Partial<Message>): Message | undefined {
  let next: Message | undefined;
  db.setState((s) => {
    const message = s.messages[id];
    if (!message) return {};
    next = { ...message, ...patch };
    return { messages: { ...s.messages, [id]: next } };
  });
  return next;
}

function step(id: ID, hop: number, opts: DeliveryOptions) {
  const next = HOPS[hop];
  if (!next) {
    timers.delete(id);
    return;
  }

  timers.set(
    id,
    setTimeout(() => {
      const current = db.getState().messages[id];
      // Deleted mid-flight (its contact was removed): nothing left to deliver.
      if (!current) {
        timers.delete(id);
        return;
      }

      const failed =
        next.status === "delivered" && Math.random() < opts.failureRate();

      write(
        id,
        failed
          ? {
              status: "failed",
              failureReason:
                FAILURE_REASONS[current.channel] ?? "Delivery failed.",
              updatedAt: nowIso(),
            }
          : {
              status: next.status,
              failureReason: undefined,
              updatedAt: nowIso(),
            },
      );
      opts.onChange();

      if (failed) timers.delete(id);
      else step(id, hop + 1, opts);
    }, next.afterMs),
  );
}

/** Hands a queued message to the "server". Restarts it if already in flight. */
export function startDelivery(id: ID, opts: DeliveryOptions) {
  const existing = timers.get(id);
  if (existing) clearTimeout(existing);
  step(id, 0, opts);
}

/** The hop that follows each in-flight status. */
const NEXT_HOP: Partial<Record<MessageStatus, number>> = {
  queued: 0,
  sending: 1,
  sent: 2,
};

/**
 * A refresh kills the timers but the store keeps the message, so without this
 * it would sit on "Sending…" (or "Sent", short of its final hop) forever.
 * Anything the server had not finished is picked up at the hop it stopped at.
 *
 * `sent` is ambiguous: seeded history uses it as a resting state. A message
 * this app sent never rests there — delivery ends at `delivered` or `failed` —
 * so a `sent` message written after the seed anchor is one caught mid-flight,
 * while seeded ones (all stamped at or before the anchor) are left alone.
 */
export function resumeDeliveries(opts: DeliveryOptions) {
  const { messages, seededAt } = db.getState();
  for (const message of Object.values(messages)) {
    const hop = NEXT_HOP[message.status];
    if (
      hop === undefined ||
      message.direction !== "outbound" ||
      timers.has(message.id)
    ) {
      continue;
    }
    // A cleared workspace has no seeded history, so any `sent` is in flight.
    if (
      message.status === "sent" &&
      seededAt &&
      message.updatedAt <= seededAt
    ) {
      continue;
    }
    step(message.id, hop, opts);
  }
}
