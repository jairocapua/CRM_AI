"use client";

import {
  AlertCircleIcon,
  CheckCheckIcon,
  CheckIcon,
  PhoneIncomingIcon,
  PhoneMissedIcon,
  PhoneOutgoingIcon,
  RotateCcwIcon,
  VoicemailIcon,
  XIcon,
} from "lucide-react";

import type { Channel, ISODate, Message, MessageStatus } from "@/types";
import { CHANNEL_LABELS, ChannelIcon } from "@/components/common/channel-icon";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import {
  Message as MessageRow,
  MessageContent,
  MessageFooter,
} from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { Spinner } from "@/components/ui/spinner";
import {
  formatClockTime,
  formatDayLabel,
  formatDuration,
  toDate,
} from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * A send the server has not confirmed yet. It renders like an outbound
 * message until the id `send()` returned appears in the thread, then drops
 * out — matching on id rather than on "the next refetch" means a refetch
 * already in flight when the send landed cannot make the bubble blink.
 */
export interface PendingSend {
  clientId: string;
  channel: Channel;
  body: string;
  subject?: string;
  at: ISODate;
  /** Set once `send()` resolves. */
  serverId?: string;
  /** Set when `send()` itself threw — the message never reached the server. */
  error?: string;
}

export type ThreadEntry =
  | { kind: "message"; message: Message }
  | { kind: "pending"; pending: PendingSend };

function entryKey(entry: ThreadEntry): string {
  return entry.kind === "message" ? entry.message.id : entry.pending.clientId;
}

function entryAt(entry: ThreadEntry): ISODate {
  return entry.kind === "message" ? entry.message.sentAt : entry.pending.at;
}

function dayKey(iso: ISODate): string {
  const d = toDate(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function MessageList({
  entries,
  now,
  authorName,
  onRetry,
  onRetryPending,
  onDiscardPending,
}: {
  entries: ThreadEntry[];
  now: Date;
  authorName: (id: string | undefined) => string | undefined;
  onRetry: (messageId: string) => void;
  onRetryPending: (clientId: string) => void;
  onDiscardPending: (clientId: string) => void;
}) {
  const rows: React.ReactNode[] = [];
  let lastDay: string | null = null;

  for (const entry of entries) {
    const at = entryAt(entry);
    const day = dayKey(at);
    if (day !== lastDay) {
      lastDay = day;
      rows.push(
        <MessageScrollerItem key={`day-${day}`}>
          <Marker variant="separator" className="text-xs">
            <MarkerContent>{formatDayLabel(at, now)}</MarkerContent>
          </Marker>
        </MessageScrollerItem>,
      );
    }

    rows.push(
      <MessageScrollerItem key={entryKey(entry)} messageId={entryKey(entry)}>
        {entry.kind === "message" ? (
          isCall(entry.message.channel) ? (
            <CallRow message={entry.message} />
          ) : (
            <ChatBubble
              channel={entry.message.channel}
              direction={entry.message.direction}
              body={entry.message.body}
              subject={entry.message.subject}
              at={entry.message.sentAt}
              author={
                entry.message.direction === "outbound"
                  ? authorName(entry.message.authorId)
                  : undefined
              }
              status={
                entry.message.direction === "outbound" ? (
                  <DeliveryStatus
                    status={entry.message.status}
                    reason={entry.message.failureReason}
                    onRetry={() => onRetry(entry.message.id)}
                  />
                ) : null
              }
            />
          )
        ) : (
          <ChatBubble
            channel={entry.pending.channel}
            direction="outbound"
            body={entry.pending.body}
            subject={entry.pending.subject}
            at={entry.pending.at}
            author={authorName(undefined)}
            status={
              entry.pending.error ? (
                <NotSent
                  reason={entry.pending.error}
                  onRetry={() => onRetryPending(entry.pending.clientId)}
                  onDiscard={() => onDiscardPending(entry.pending.clientId)}
                />
              ) : (
                <DeliveryStatus status="queued" />
              )
            }
          />
        )}
      </MessageScrollerItem>,
    );
  }

  return (
    <MessageScroller>
      <MessageScrollerViewport aria-label="Messages">
        <MessageScrollerContent className="gap-3 px-4 py-4">
          {rows}
        </MessageScrollerContent>
      </MessageScrollerViewport>
      <MessageScrollerButton />
    </MessageScroller>
  );
}

function isCall(channel: Channel) {
  return channel === "call" || channel === "voicemail";
}

function ChatBubble({
  channel,
  direction,
  body,
  subject,
  at,
  author,
  status,
}: {
  channel: Channel;
  direction: Message["direction"];
  body: string;
  subject?: string;
  at: ISODate;
  author?: string;
  status: React.ReactNode;
}) {
  const outbound = direction === "outbound";
  return (
    <MessageRow align={outbound ? "end" : "start"}>
      <MessageContent className="gap-1">
        <Bubble
          variant={outbound ? "default" : "muted"}
          align={outbound ? "end" : "start"}
        >
          <BubbleContent className="whitespace-pre-wrap">
            {subject ? (
              <span className="mb-1 block font-semibold">{subject}</span>
            ) : null}
            {body}
          </BubbleContent>
        </Bubble>
        <MessageFooter className="gap-1.5 font-normal">
          <ChannelIcon channel={channel} className="size-3" />
          <span className="sr-only">{CHANNEL_LABELS[channel]}</span>
          {author ? <span>{author}</span> : null}
          {author ? <span aria-hidden="true">·</span> : null}
          <time dateTime={at}>{formatClockTime(at)}</time>
          {status}
        </MessageFooter>
      </MessageContent>
    </MessageRow>
  );
}

function CallRow({ message }: { message: Message }) {
  const missed = message.callMeta?.missed ?? false;
  const voicemail = message.channel === "voicemail";
  const Icon = voicemail
    ? VoicemailIcon
    : missed
      ? PhoneMissedIcon
      : message.direction === "inbound"
        ? PhoneIncomingIcon
        : PhoneOutgoingIcon;
  const label = voicemail
    ? "Voicemail"
    : missed
      ? "Missed call"
      : message.direction === "inbound"
        ? "Inbound call"
        : "Outbound call";
  const duration =
    !missed && message.callMeta
      ? formatDuration(message.callMeta.durationSec)
      : null;

  return (
    <Marker className="justify-center text-xs">
      <MarkerIcon className={cn(missed && "text-destructive")}>
        <Icon className="size-3.5" />
      </MarkerIcon>
      <MarkerContent className="text-center">
        <span className="font-medium text-foreground">{label}</span>
        {duration ? ` · ${duration}` : null} · {formatClockTime(message.sentAt)}
        {message.body ? (
          <span className="block text-muted-foreground">{message.body}</span>
        ) : null}
      </MarkerContent>
    </Marker>
  );
}

const STATUS_LABELS: Record<MessageStatus, string> = {
  queued: "Sending",
  sending: "Sending",
  sent: "Sent",
  delivered: "Delivered",
  read: "Read",
  failed: "Failed",
};

function DeliveryStatus({
  status,
  reason,
  onRetry,
}: {
  status: MessageStatus;
  reason?: string;
  onRetry?: () => void;
}) {
  if (status === "failed") {
    return (
      <span className="flex flex-wrap items-center justify-end gap-1.5 text-destructive">
        <AlertCircleIcon className="size-3.5" />
        <span>{reason ?? "Failed"}</span>
        {onRetry ? (
          <Button
            variant="ghost"
            size="xs"
            className="h-5 px-1.5 text-destructive"
            onClick={onRetry}
          >
            <RotateCcwIcon />
            Retry
          </Button>
        ) : null}
      </span>
    );
  }

  const pending = status === "queued" || status === "sending";
  return (
    <span
      className={cn(
        "flex items-center gap-1",
        status === "read" && "text-primary",
      )}
      aria-live="polite"
    >
      <span aria-hidden="true">·</span>
      {pending ? (
        <Spinner className="size-3" aria-hidden="true" />
      ) : status === "sent" ? (
        <CheckIcon className="size-3.5" />
      ) : (
        <CheckCheckIcon className="size-3.5" />
      )}
      {STATUS_LABELS[status]}
    </span>
  );
}

function NotSent({
  reason,
  onRetry,
  onDiscard,
}: {
  reason: string;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  return (
    <span className="flex flex-wrap items-center justify-end gap-1.5 text-destructive">
      <AlertCircleIcon className="size-3.5" />
      <span>Not sent: {reason}</span>
      <Button
        variant="ghost"
        size="xs"
        className="h-5 px-1.5 text-destructive"
        onClick={onRetry}
      >
        <RotateCcwIcon />
        Retry
      </Button>
      <Button
        variant="ghost"
        size="xs"
        className="h-5 px-1.5 text-muted-foreground"
        onClick={onDiscard}
      >
        <XIcon />
        Discard
      </Button>
    </span>
  );
}
