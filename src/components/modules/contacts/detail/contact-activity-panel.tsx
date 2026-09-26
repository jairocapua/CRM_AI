"use client";

import { formatDistanceToNow } from "date-fns";
import { HistoryIcon } from "lucide-react";

import * as api from "@/lib/api";
import { useResource } from "@/lib/api";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { toDate } from "@/lib/format";

export function ContactActivityPanel({ contactId }: { contactId: string }) {
  const activities = useResource(
    "activities",
    () => api.activities.listForContact(contactId),
    contactId,
  );

  if (activities.isLoading) {
    return <Skeleton className="mt-3 h-32 w-full" />;
  }

  const rows = activities.data ?? [];
  if (rows.length === 0) {
    return (
      <p className="pt-3 text-sm text-muted-foreground">No activity yet.</p>
    );
  }

  return (
    <div className="flex flex-col gap-1 pt-3">
      {rows.map((activity) => (
        <Item key={activity.id} size="sm">
          <ItemMedia variant="icon">
            <HistoryIcon />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>{activity.summary}</ItemTitle>
            <ItemDescription>
              {formatDistanceToNow(toDate(activity.at), { addSuffix: true })}
            </ItemDescription>
          </ItemContent>
        </Item>
      ))}
    </div>
  );
}
