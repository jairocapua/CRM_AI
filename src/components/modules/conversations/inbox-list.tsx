"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArchiveIcon,
  InboxIcon,
  PlusIcon,
  SearchIcon,
  StarIcon,
} from "lucide-react";

import type { Channel, InboxTab } from "@/types";
import * as api from "@/lib/api";
import { apiNow, useResource } from "@/lib/api";
import type { ConversationRow } from "@/lib/api";
import { CHANNEL_LABELS, ChannelIcon } from "@/components/common/channel-icon";
import { EmptyState } from "@/components/common/empty-state";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { formatInboxTime, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { NewConversationDialog } from "./new-conversation-dialog";

const TABS: { value: InboxTab; label: string }[] = [
  { value: "unread", label: "Unread" },
  { value: "recents", label: "Recents" },
  { value: "starred", label: "Starred" },
  { value: "all", label: "All" },
];

const FILTER_CHANNELS: Channel[] = [
  "sms",
  "email",
  "whatsapp",
  "messenger",
  "instagram",
  "livechat",
  "call",
];

type ChannelFilter = Channel | "any";

export function InboxList({ selectedId }: { selectedId: string | undefined }) {
  const [tab, setTab] = useState<InboxTab>("recents");
  const [channel, setChannel] = useState<ChannelFilter>("any");
  const [search, setSearch] = useState("");
  const q = useDebouncedValue(search.trim(), 250);
  const [newOpen, setNewOpen] = useState(false);

  // `keepId` is read by the fetcher but deliberately left out of the cache
  // key: switching threads must not refetch (and flash) the list. It takes
  // effect on the next refetch — which opening an unread thread triggers via
  // markRead — so that thread stays listed while it is being read.
  const inbox = useResource(
    "conversations",
    () =>
      api.conversations.listInbox({
        tab,
        channel: channel === "any" ? undefined : channel,
        q: q || undefined,
        keepId: selectedId,
      }),
    `${tab}|${channel}|${q}`,
  );

  const rows = inbox.data ?? [];
  const now = apiNow();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-3 border-b p-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-base font-semibold">Conversations</h1>
          <Button size="sm" variant="outline" onClick={() => setNewOpen(true)}>
            <PlusIcon />
            New
          </Button>
        </div>

        <InputGroup>
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name, company, message"
            aria-label="Search conversations"
          />
        </InputGroup>

        <div className="flex items-center gap-2">
          <Tabs
            value={tab}
            onValueChange={(value) => setTab(value as InboxTab)}
            className="min-w-0 flex-1"
          >
            <TabsList className="w-full">
              {TABS.map((t) => (
                <TabsTrigger key={t.value} value={t.value} className="px-1.5">
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Select
            value={channel}
            onValueChange={(value) => setChannel(value as ChannelFilter)}
          >
            <SelectTrigger
              size="sm"
              className="w-11 shrink-0 justify-center px-2 [&>svg:last-child]:hidden"
              aria-label="Filter by channel"
            >
              <SelectValue>
                {(value: ChannelFilter) =>
                  value === "any" ? (
                    <InboxIcon className="size-4" />
                  ) : (
                    <ChannelIcon channel={value} className="size-4" />
                  )
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent align="end" alignItemWithTrigger={false}>
              <SelectItem value="any">
                <InboxIcon />
                All channels
              </SelectItem>
              {FILTER_CHANNELS.map((c) => (
                <SelectItem key={c} value={c}>
                  <ChannelIcon channel={c} className="size-4" />
                  {CHANNEL_LABELS[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {inbox.isLoading ? (
          <div className="flex flex-col gap-1 p-2">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-3">
            <EmptyState
              icon={tab === "unread" ? InboxIcon : SearchIcon}
              title={
                tab === "unread" && !q ? "All caught up" : "No conversations"
              }
              description={
                q || channel !== "any"
                  ? "Nothing matches these filters."
                  : tab === "unread"
                    ? "Every thread has been read."
                    : "Nothing here yet."
              }
            />
          </div>
        ) : (
          <ul className="flex flex-col p-1.5" aria-label="Conversations">
            {rows.map((row) => (
              <li key={row.id}>
                <InboxRow
                  row={row}
                  selected={row.id === selectedId}
                  now={now}
                />
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>

      <NewConversationDialog open={newOpen} onOpenChange={setNewOpen} />
    </div>
  );
}

function InboxRow({
  row,
  selected,
  now,
}: {
  row: ConversationRow;
  selected: boolean;
  now: Date;
}) {
  const [first = "", ...rest] = row.contactName.split(" ");
  const unread = row.unreadCount > 0;

  return (
    <Link
      href={`/conversations/${row.id}`}
      aria-current={selected ? "page" : undefined}
      className={cn(
        "flex gap-3 rounded-lg px-2.5 py-2.5 outline-hidden transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50",
        selected && "bg-muted hover:bg-muted",
      )}
    >
      <Avatar className="mt-0.5">
        <AvatarImage src={row.contactAvatarUrl} alt="" />
        <AvatarFallback>{initials(first, rest.join(" "))}</AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-baseline justify-between gap-2">
          <span
            className={cn(
              "truncate text-sm",
              unread ? "font-semibold" : "font-medium",
            )}
          >
            {row.contactName}
          </span>
          <span
            className={cn(
              "shrink-0 text-xs tabular-nums",
              unread ? "font-medium text-foreground" : "text-muted-foreground",
            )}
          >
            {row.messageIds.length > 0
              ? formatInboxTime(row.lastMessageAt, now)
              : null}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <ChannelIcon
            channel={row.lastChannel}
            className="text-muted-foreground"
            label
          />
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-sm",
              unread ? "text-foreground" : "text-muted-foreground",
              !row.preview && "italic",
            )}
          >
            {row.preview || "No messages yet"}
          </span>
          {row.isArchived ? (
            <ArchiveIcon
              className="size-3.5 shrink-0 text-muted-foreground"
              aria-label="Archived"
            />
          ) : null}
          {row.isStarred ? (
            <StarIcon
              className="size-3.5 shrink-0 fill-amber-400 text-amber-400"
              aria-label="Starred"
            />
          ) : null}
          {unread ? (
            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground tabular-nums">
              {row.unreadCount}
              <span className="sr-only"> unread</span>
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
