"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ArrowLeftIcon,
  MessagesSquareIcon,
  PanelRightIcon,
  StarIcon,
} from "lucide-react";
import { toast } from "sonner";

import type { Contact, Conversation, Message, User } from "@/types";
import * as api from "@/lib/api";
import { apiNow, useResource } from "@/lib/api";
import { ChannelIcon, CHANNEL_LABELS } from "@/components/common/channel-icon";
import { EmptyState } from "@/components/common/empty-state";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  MessageScrollerProvider,
  useMessageScroller,
} from "@/components/ui/message-scroller";
import { Skeleton } from "@/components/ui/skeleton";
import { fullName, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Composer, type ComposerSend } from "./composer";
import { useInbox } from "./inbox-shell";
import {
  MessageList,
  type PendingSend,
  type ThreadEntry,
} from "./message-list";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof api.ApiError ? error.message : fallback;
}

/** The middle pane: one conversation, read and reply. */
export function ThreadView({ id }: { id: string }) {
  const conversation = useResource(
    "conversations",
    () => api.conversations.get(id),
    id,
  );
  const messages = useResource(
    "conversations",
    () => api.conversations.listMessages(id),
    id,
  );
  const contactId = conversation.data?.contactId;
  const contact = useResource(
    "contacts",
    () =>
      contactId ? api.contacts.get(contactId) : Promise.resolve(undefined),
    contactId ?? "none",
  );
  const users = useResource("users", () => api.users.list());
  const me = useResource("users", () => api.users.me(), "me");

  // Viewing is reading. Keyed on "has unread" rather than the count, so the
  // invalidation markRead itself causes cannot re-trigger it.
  const hasUnread = (conversation.data?.unreadCount ?? 0) > 0;
  useEffect(() => {
    if (hasUnread) void api.conversations.markRead(id);
  }, [id, hasUnread]);

  if (conversation.error?.status === 404) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          icon={MessagesSquareIcon}
          title="Conversation not found"
          description="It may have been deleted along with its contact."
          action={
            <Button
              variant="outline"
              render={<Link href="/conversations" />}
              nativeButton={false}
            >
              Back to inbox
            </Button>
          }
        />
      </div>
    );
  }

  if (
    conversation.isLoading ||
    !conversation.data ||
    contact.isLoading ||
    !contact.data
  ) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex h-14 items-center gap-3 border-b px-4">
          <Skeleton className="size-8 rounded-full" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="flex flex-1 flex-col gap-3 p-4">
          <Skeleton className="h-12 w-2/3" />
          <Skeleton className="ml-auto h-12 w-1/2" />
          <Skeleton className="h-12 w-3/5" />
        </div>
      </div>
    );
  }

  return (
    <MessageScrollerProvider autoScroll defaultScrollPosition="end">
      <Thread
        conversation={conversation.data}
        contact={contact.data}
        messages={messages.data}
        messagesLoading={messages.isLoading}
        users={users.data ?? []}
        meId={me.data?.id}
      />
    </MessageScrollerProvider>
  );
}

function Thread({
  conversation,
  contact,
  messages,
  messagesLoading,
  users,
  meId,
}: {
  conversation: Conversation;
  contact: Contact;
  messages: Message[] | undefined;
  messagesLoading: boolean;
  users: User[];
  meId: string | undefined;
}) {
  const { scrollToEnd } = useMessageScroller();
  const [pending, setPending] = useState<PendingSend[]>([]);
  const nextClientId = useRef(0);

  const serverIds = new Set((messages ?? []).map((m) => m.id));
  const entries: ThreadEntry[] = [
    ...(messages ?? []).map((message): ThreadEntry => ({
      kind: "message",
      message,
    })),
    ...pending
      .filter((p) => !(p.serverId && serverIds.has(p.serverId)))
      .map((p): ThreadEntry => ({ kind: "pending", pending: p })),
  ];

  const usersById = new Map(users.map((u) => [u.id, u]));
  // Your own messages read "You" — including the optimistic ones, which have
  // no author yet — so a bubble does not change name when the server confirms.
  const authorName = (authorId: string | undefined) => {
    if (!authorId || authorId === meId) return "You";
    return usersById.get(authorId)?.firstName;
  };

  const patchPending = (clientId: string, patch: Partial<PendingSend>) =>
    setPending((list) =>
      list.map((p) => (p.clientId === clientId ? { ...p, ...patch } : p)),
    );

  async function deliver(draft: PendingSend) {
    try {
      const message = await api.conversations.send({
        conversationId: conversation.id,
        channel: draft.channel,
        body: draft.body,
        subject: draft.subject,
      });
      patchPending(draft.clientId, { serverId: message.id, error: undefined });
    } catch (error) {
      const reason = errorMessage(error, "Network error");
      patchPending(draft.clientId, { error: reason });
      toast.error("Message not sent", { description: reason });
    }
  }

  function handleSend(input: ComposerSend) {
    nextClientId.current += 1;
    const draft: PendingSend = {
      clientId: `pending-${nextClientId.current}`,
      channel: input.channel,
      body: input.body,
      subject: input.subject,
      at: apiNow().toISOString(),
    };
    // Drop drafts the thread has already absorbed, so the list stays short.
    setPending((list) => [
      ...list.filter((p) => !(p.serverId && serverIds.has(p.serverId))),
      draft,
    ]);
    scrollToEnd({ behavior: "smooth" });
    void deliver(draft);
  }

  function retryPending(clientId: string) {
    const draft = pending.find((p) => p.clientId === clientId);
    if (!draft) return;
    patchPending(clientId, { error: undefined });
    void deliver({ ...draft, error: undefined });
  }

  async function retryMessage(messageId: string) {
    try {
      await api.conversations.retry(messageId);
    } catch (error) {
      toast.error("Retry failed", {
        description: errorMessage(error, "Please try again."),
      });
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ThreadHeader conversation={conversation} contact={contact} />

      <div className="relative min-h-0 flex-1">
        {messagesLoading ? (
          <div className="flex flex-col gap-3 p-4">
            <Skeleton className="h-12 w-2/3" />
            <Skeleton className="ml-auto h-12 w-1/2" />
          </div>
        ) : entries.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6">
            <EmptyState
              icon={MessagesSquareIcon}
              title="No messages yet"
              description={`Start the conversation with ${contact.firstName} below.`}
            />
          </div>
        ) : (
          <MessageList
            entries={entries}
            now={apiNow()}
            authorName={authorName}
            onRetry={(messageId) => void retryMessage(messageId)}
            onRetryPending={retryPending}
            onDiscardPending={(clientId) =>
              setPending((list) => list.filter((p) => p.clientId !== clientId))
            }
          />
        )}
      </div>

      <Composer
        key={conversation.id}
        conversation={conversation}
        contact={contact}
        onSend={handleSend}
      />
    </div>
  );
}

function ThreadHeader({
  conversation,
  contact,
}: {
  conversation: Conversation;
  contact: Contact;
}) {
  const { isMobile, detailsOpen, toggleDetails } = useInbox();

  async function toggleStar() {
    try {
      await api.conversations.setStarred(
        conversation.id,
        !conversation.isStarred,
      );
    } catch (error) {
      toast.error(errorMessage(error, "Could not update the conversation."));
    }
  }

  async function toggleArchive() {
    const archiving = !conversation.isArchived;
    try {
      await api.conversations.setArchived(conversation.id, archiving);
      if (archiving) {
        toast.success("Conversation archived", {
          action: {
            label: "Undo",
            onClick: () =>
              void api.conversations
                .setArchived(conversation.id, false)
                .catch(() => toast.error("Could not restore it.")),
          },
        });
      }
    } catch (error) {
      toast.error(errorMessage(error, "Could not update the conversation."));
    }
  }

  return (
    <div className="flex h-14 shrink-0 items-center gap-3 border-b px-3 md:px-4">
      {isMobile ? (
        <Button
          variant="ghost"
          size="icon-sm"
          render={<Link href="/conversations" />}
          nativeButton={false}
          aria-label="Back to inbox"
        >
          <ArrowLeftIcon />
        </Button>
      ) : null}
      <Avatar>
        <AvatarImage src={contact.avatarUrl} alt="" />
        <AvatarFallback>
          {initials(contact.firstName, contact.lastName)}
        </AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col">
        <Link
          href={`/contacts/${contact.id}`}
          className="truncate text-sm font-semibold hover:underline"
        >
          {fullName(contact)}
        </Link>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {conversation.channels.map((channel) => (
            <span
              key={channel}
              className="flex items-center"
              title={CHANNEL_LABELS[channel]}
            >
              <ChannelIcon channel={channel} label />
            </span>
          ))}
          {contact.companyName ? (
            <span className="truncate">· {contact.companyName}</span>
          ) : null}
        </span>
      </div>
      <div className="flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => void toggleStar()}
          aria-pressed={conversation.isStarred}
          aria-label={conversation.isStarred ? "Unstar" : "Star"}
        >
          <StarIcon
            className={cn(
              conversation.isStarred && "fill-amber-400 text-amber-400",
            )}
          />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => void toggleArchive()}
          aria-label={conversation.isArchived ? "Unarchive" : "Archive"}
        >
          {conversation.isArchived ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggleDetails}
          aria-pressed={detailsOpen}
          aria-label="Contact details"
        >
          <PanelRightIcon />
        </Button>
      </div>
    </div>
  );
}
