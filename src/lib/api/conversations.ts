import type {
  Activity,
  Channel,
  Contact,
  Conversation,
  ID,
  InboxTab,
  Message,
} from "@/types";
import { db } from "@/lib/mock/db";
import { startDelivery } from "@/lib/mock/delivery";
import { newId } from "@/lib/mock/ids";
import { invalidate } from "./cache";
import { deliveryOptions } from "./delivery";
import { ApiError, notFound, nowIso, simulate } from "./http";

/* -------------------------------------------------------------------------- */
/* Channel rules                                                              */
/* -------------------------------------------------------------------------- */

/** Channels a person can type into. Calls and voicemails are logged, not sent. */
export const COMPOSABLE_CHANNELS = [
  "sms",
  "email",
  "whatsapp",
  "messenger",
  "instagram",
  "livechat",
] as const satisfies readonly Channel[];

export type ComposableChannel = (typeof COMPOSABLE_CHANNELS)[number];

export interface ChannelOption {
  channel: ComposableChannel;
  available: boolean;
  /** Why not, when unavailable — shown next to the disabled option. */
  reason?: string;
}

/** Social and chat channels can only answer a thread the contact started. */
const REPLY_ONLY: readonly Channel[] = ["messenger", "instagram", "livechat"];

function unavailableReason(
  channel: ComposableChannel,
  contact: Pick<Contact, "phone" | "email" | "dnd">,
  threadChannels: readonly Channel[],
): string | undefined {
  if (contact.dnd.all) return "Do Not Disturb is on for every channel";
  switch (channel) {
    case "sms":
      if (!contact.phone) return "No phone number on file";
      if (contact.dnd.sms) return "Contact opted out of SMS";
      return undefined;
    case "whatsapp":
      return contact.phone ? undefined : "No phone number on file";
    case "email":
      if (!contact.email) return "No email address on file";
      if (contact.dnd.email) return "Contact opted out of email";
      return undefined;
    default:
      return REPLY_ONLY.includes(channel) && !threadChannels.includes(channel)
        ? "Only after the contact messages you there"
        : undefined;
  }
}

/**
 * Which channels this contact can be reached on, and why not where they
 * cannot. One rule, used by both the composer (to disable options) and
 * `send()` (to reject), so the UI and the "server" can never disagree.
 */
export function channelOptions(
  contact: Pick<Contact, "phone" | "email" | "dnd">,
  threadChannels: readonly Channel[] = [],
): ChannelOption[] {
  return COMPOSABLE_CHANNELS.map((channel) => {
    const reason = unavailableReason(channel, contact, threadChannels);
    return { channel, available: !reason, reason };
  });
}

/** The thread's last channel if it can still be used, else the first that can. */
export function defaultChannel(
  contact: Pick<Contact, "phone" | "email" | "dnd">,
  conversation?: Pick<Conversation, "channels" | "lastChannel">,
): ComposableChannel | undefined {
  const options = channelOptions(contact, conversation?.channels);
  const usable = options.filter((o) => o.available).map((o) => o.channel);
  const last = conversation?.lastChannel;
  if (last && (usable as Channel[]).includes(last)) {
    return last as ComposableChannel;
  }
  const seen = usable.find((c) => conversation?.channels.includes(c));
  return seen ?? usable[0];
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

export interface InboxQuery {
  tab?: InboxTab;
  channel?: Channel;
  assigneeId?: ID | "unassigned";
  q?: string;
  /**
   * Always include this conversation, whatever the filters say. The open
   * thread is marked read as soon as it is viewed; without this, reading a
   * thread from the Unread tab would make it vanish from under the cursor.
   */
  keepId?: ID;
}

export interface ConversationRow extends Conversation {
  contactName: string;
  contactAvatarUrl?: string;
}

/** Joins the contact in, so the list pane does not N+1 per row. */
export async function listInbox(
  query: InboxQuery = {},
): Promise<ConversationRow[]> {
  return simulate(
    () => {
      const { conversations, contacts } = db.getState();
      const term = query.q?.trim().toLowerCase();

      const matches = (c: Conversation) => {
        // "All" is the only tab that reaches into the archive.
        if (c.isArchived && query.tab !== "all") return false;
        if (query.tab === "unread" && c.unreadCount === 0) return false;
        if (query.tab === "starred" && !c.isStarred) return false;
        if (query.channel && !c.channels.includes(query.channel)) return false;
        if (query.assigneeId === "unassigned" && c.assigneeId) return false;
        if (
          query.assigneeId &&
          query.assigneeId !== "unassigned" &&
          c.assigneeId !== query.assigneeId
        ) {
          return false;
        }
        if (term) {
          const contact = contacts[c.contactId];
          const haystack = [
            c.preview,
            c.subject,
            contact?.firstName,
            contact?.lastName,
            contact?.companyName,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          if (!haystack.includes(term)) return false;
        }
        return true;
      };

      return Object.values(conversations)
        .filter((c) => c.id === query.keepId || matches(c))
        .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
        .map((c) => {
          const contact = contacts[c.contactId];
          return {
            ...c,
            contactName: contact
              ? `${contact.firstName} ${contact.lastName}`
              : "Unknown contact",
            contactAvatarUrl: contact?.avatarUrl,
          };
        });
    },
    { canFail: false },
  );
}

/** Threads with unread messages, for the sidebar badge. */
export async function unreadCount(): Promise<number> {
  return simulate(
    () =>
      Object.values(db.getState().conversations).filter(
        (c) => c.unreadCount > 0 && !c.isArchived,
      ).length,
    { canFail: false, ms: 60 },
  );
}

export async function get(id: ID): Promise<Conversation> {
  return simulate(
    () => db.getState().conversations[id] ?? notFound("Conversation", id),
    { canFail: false },
  );
}

export async function listMessages(conversationId: ID): Promise<Message[]> {
  return simulate(
    () => {
      const state = db.getState();
      const conversation =
        state.conversations[conversationId] ??
        notFound("Conversation", conversationId);
      return conversation.messageIds
        .map((id) => state.messages[id])
        .filter((m): m is Message => Boolean(m));
    },
    { canFail: false },
  );
}

/* -------------------------------------------------------------------------- */
/* Writes                                                                     */
/* -------------------------------------------------------------------------- */

export async function markRead(conversationId: ID): Promise<void> {
  await simulate(
    () => {
      db.setState((s) => {
        const conversation = s.conversations[conversationId];
        if (!conversation || conversation.unreadCount === 0) return {};
        const at = nowIso();
        const messages = { ...s.messages };
        for (const id of conversation.messageIds) {
          const message = messages[id];
          if (message && message.direction === "inbound" && !message.readAt) {
            messages[id] = { ...message, readAt: at, status: "read" };
          }
        }
        return {
          messages,
          conversations: {
            ...s.conversations,
            [conversationId]: { ...conversation, unreadCount: 0 },
          },
        };
      });
    },
    { ms: 90, canFail: false },
  );
  invalidate("conversations");
}

export async function setStarred(id: ID, starred: boolean): Promise<void> {
  await simulate(() => {
    db.setState((s) => {
      const conversation = s.conversations[id];
      if (!conversation) return {};
      return {
        conversations: {
          ...s.conversations,
          [id]: { ...conversation, isStarred: starred },
        },
      };
    });
  });
  invalidate("conversations");
}

export async function setArchived(id: ID, archived: boolean): Promise<void> {
  await simulate(() => {
    db.setState((s) => {
      const conversation = s.conversations[id];
      if (!conversation) return {};
      return {
        conversations: {
          ...s.conversations,
          [id]: { ...conversation, isArchived: archived },
        },
      };
    });
  });
  invalidate("conversations");
}

/**
 * Appends an outbound message in `queued` state and hands it to the delivery
 * "server" (`@/lib/mock/delivery`), which walks it through sending → sent →
 * delivered and may fail the last hop. The caller renders its own optimistic
 * bubble until the returned id shows up in the thread.
 *
 * Throws `ApiError` 422 when the channel cannot reach this contact — the same
 * rule the composer uses to disable options, via `channelOptions()`.
 */
export async function send(input: {
  conversationId: ID;
  channel: Channel;
  body: string;
  subject?: string;
}): Promise<Message> {
  const message = await simulate(
    () => {
      const at = nowIso();
      const state = db.getState();
      const conversation =
        state.conversations[input.conversationId] ??
        notFound("Conversation", input.conversationId);
      const contact =
        state.contacts[conversation.contactId] ??
        notFound("Contact", conversation.contactId);

      const option = channelOptions(contact, conversation.channels).find(
        (o) => o.channel === input.channel,
      );
      if (!option?.available) {
        throw new ApiError(
          option?.reason ?? `Cannot send on ${input.channel}.`,
          422,
          "CHANNEL_UNAVAILABLE",
        );
      }
      const body = input.body.trim();
      if (!body) throw new ApiError("Message is empty.", 422, "EMPTY_MESSAGE");

      const record: Message = {
        id: newId("msg"),
        conversationId: input.conversationId,
        channel: input.channel,
        direction: "outbound",
        status: "queued",
        body,
        subject: input.channel === "email" ? input.subject : undefined,
        attachments: [],
        authorId: state.currentUserId,
        sentAt: at,
        createdAt: at,
        updatedAt: at,
      };

      const activity: Activity = {
        id: newId("act"),
        type: "message.sent",
        at,
        contactId: conversation.contactId,
        conversationId: conversation.id,
        actorId: state.currentUserId,
        summary: `Sent a ${input.channel} message`,
      };

      db.setState((s) => ({
        messages: { ...s.messages, [record.id]: record },
        activities: { ...s.activities, [activity.id]: activity },
        conversations: {
          ...s.conversations,
          [conversation.id]: {
            ...conversation,
            messageIds: [...conversation.messageIds, record.id],
            preview: body,
            lastMessageAt: at,
            lastChannel: input.channel,
            channels: [...new Set([...conversation.channels, input.channel])],
            // Replying is reading, and brings an archived thread back.
            unreadCount: 0,
            isArchived: false,
            updatedAt: at,
          },
        },
      }));

      return record;
    },
    { ms: 160 },
  );

  startDelivery(message.id, deliveryOptions);
  invalidate("conversations", "activities", "analytics");
  return message;
}

/** Re-queues a failed outbound message and hands it back to delivery. */
export async function retry(id: ID): Promise<void> {
  await simulate(
    () => {
      const message = db.getState().messages[id] ?? notFound("Message", id);
      if (message.direction !== "outbound" || message.status !== "failed") {
        throw new ApiError("Only failed messages can be retried.", 409);
      }
      db.setState((s) => ({
        messages: {
          ...s.messages,
          [id]: {
            ...message,
            status: "queued",
            failureReason: undefined,
            updatedAt: nowIso(),
          },
        },
      }));
    },
    { ms: 120 },
  );
  startDelivery(id, deliveryOptions);
  invalidate("conversations");
}

/** Starts (or finds) the thread for a contact, so "Message" works anywhere. */
export async function openForContact(contactId: ID): Promise<Conversation> {
  const conversation = await simulate(() => {
    const state = db.getState();
    const existing = Object.values(state.conversations).find(
      (c) => c.contactId === contactId,
    );
    if (existing) return existing;

    const contact = state.contacts[contactId] ?? notFound("Contact", contactId);
    const channel = defaultChannel(contact) ?? "sms";
    const at = nowIso();
    const record: Conversation = {
      id: newId("conv"),
      contactId,
      channels: [channel],
      lastChannel: channel,
      preview: "",
      lastMessageAt: at,
      unreadCount: 0,
      isStarred: false,
      isArchived: false,
      status: "open",
      assigneeId: state.currentUserId,
      messageIds: [],
      createdAt: at,
      updatedAt: at,
    };
    db.setState((s) => ({
      conversations: { ...s.conversations, [record.id]: record },
    }));
    return record;
  });

  invalidate("conversations");
  return conversation;
}
