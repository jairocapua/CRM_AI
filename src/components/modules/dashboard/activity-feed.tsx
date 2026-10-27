"use client";

import Link from "next/link";
import {
  CalendarCheckIcon,
  CheckSquareIcon,
  HistoryIcon,
  MessageSquareIcon,
  PhoneIcon,
  StickyNoteIcon,
  TargetIcon,
  TrophyIcon,
  UserPlusIcon,
  type LucideIcon,
} from "lucide-react";

import type { ActivityType } from "@/types";
import * as api from "@/lib/api";
import { apiNow, loadErrorOf, useResource, type ActivityRow } from "@/lib/api";
import { LoadError } from "@/components/common/load-error";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { REGION_FOCUS, useCardRegion } from "./card-region";

const ICONS: Partial<Record<ActivityType, LucideIcon>> = {
  "contact.created": UserPlusIcon,
  "message.sent": MessageSquareIcon,
  "message.received": MessageSquareIcon,
  "call.logged": PhoneIcon,
  "note.added": StickyNoteIcon,
  "task.created": CheckSquareIcon,
  "task.completed": CheckSquareIcon,
  "appointment.booked": CalendarCheckIcon,
  "appointment.status_changed": CalendarCheckIcon,
  "opportunity.created": TargetIcon,
  "opportunity.stage_changed": TargetIcon,
  "opportunity.won": TrophyIcon,
  "opportunity.lost": TargetIcon,
};

/** The most specific page the entry is about. */
function hrefFor(activity: ActivityRow): string | undefined {
  if (activity.opportunityId) return `/opportunities/${activity.opportunityId}`;
  if (activity.conversationId) {
    return `/conversations/${activity.conversationId}`;
  }
  if (activity.contactId) return `/contacts/${activity.contactId}`;
  return undefined;
}

export function ActivityFeed() {
  const feed = useResource("activities", () => api.activities.listRecent(12));
  const loadError = loadErrorOf(feed);
  const region = useCardRegion();
  const now = apiNow();

  return (
    <Card {...region.regionProps} className={cn("lg:col-span-2", REGION_FOCUS)}>
      <CardHeader>
        <CardTitle id={region.titleId}>Recent activity</CardTitle>
        <CardDescription>Across every contact and deal.</CardDescription>
      </CardHeader>
      <CardContent>
        {feed.isLoading ? (
          <Skeleton className="h-72 w-full" />
        ) : loadError ? (
          <LoadError
            title="Could not load recent activity"
            message={loadError.message}
            onRetry={feed.refetch}
            retrying={feed.isRefreshing}
            focusTarget={region.ref}
          />
        ) : (feed.data ?? []).length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nothing has happened yet.
          </p>
        ) : (
          <div className="-mx-3 flex flex-col">
            {(feed.data ?? []).map((activity) => {
              const Icon = ICONS[activity.type] ?? HistoryIcon;
              const href = hrefFor(activity);
              return (
                <Item
                  key={activity.id}
                  size="xs"
                  render={href ? <Link href={href} /> : undefined}
                >
                  <ItemMedia variant="icon">
                    <Icon className="text-muted-foreground" />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle className="line-clamp-1">
                      {activity.summary}
                    </ItemTitle>
                    <ItemDescription>
                      {activity.contactName ? `${activity.contactName} · ` : ""}
                      {formatRelative(activity.at, now)}
                    </ItemDescription>
                  </ItemContent>
                </Item>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
