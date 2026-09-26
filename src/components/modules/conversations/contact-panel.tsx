"use client";

import Link from "next/link";
import { CalendarClockIcon, ExternalLinkIcon, UserXIcon } from "lucide-react";
import { format } from "date-fns";

import * as api from "@/lib/api";
import { apiNow, useResource } from "@/lib/api";
import { EmptyState } from "@/components/common/empty-state";
import { Money } from "@/components/common/money";
import { ContactStatusBadge } from "@/components/modules/contacts/contact-status-badge";
import { ContactInfoPanel } from "@/components/modules/contacts/detail/contact-info-panel";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { fullName, initials, toDate } from "@/lib/format";

/**
 * Who you are talking to, beside the thread: identity, the contact's details
 * and tags (the contacts module's own panel, reused), open deals and the next
 * appointment — the context a rep needs before replying.
 */
export function ContactPanel({ conversationId }: { conversationId: string }) {
  const conversation = useResource(
    "conversations",
    () => api.conversations.get(conversationId),
    conversationId,
  );
  const contactId = conversation.data?.contactId;
  const contact = useResource(
    "contacts",
    () =>
      contactId ? api.contacts.get(contactId) : Promise.resolve(undefined),
    contactId ?? "none",
  );

  if (conversation.error?.status === 404 || contact.error?.status === 404) {
    return (
      <div className="p-3">
        <EmptyState icon={UserXIcon} title="Contact not found" />
      </div>
    );
  }

  if (contact.isLoading || conversation.isLoading || !contact.data) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const record = contact.data;

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-4 p-4">
        <div className="flex flex-col items-center gap-2 text-center">
          <Avatar size="lg">
            <AvatarImage src={record.avatarUrl} alt="" />
            <AvatarFallback>
              {initials(record.firstName, record.lastName)}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col items-center gap-1">
            <span className="font-semibold">{fullName(record)}</span>
            {record.companyName || record.jobTitle ? (
              <span className="text-sm text-muted-foreground">
                {[record.jobTitle, record.companyName]
                  .filter(Boolean)
                  .join(" at ")}
              </span>
            ) : null}
            <ContactStatusBadge status={record.status} />
          </div>
          <Button
            variant="outline"
            size="sm"
            render={<Link href={`/contacts/${record.id}`} />}
            nativeButton={false}
          >
            <ExternalLinkIcon />
            View contact
          </Button>
        </div>

        <NextAppointment contactId={record.id} />
        <OpenDeals contactId={record.id} />
        <ContactInfoPanel contact={record} />
      </div>
    </ScrollArea>
  );
}

function NextAppointment({ contactId }: { contactId: string }) {
  const appointments = useResource(
    "appointments",
    () => api.calendars.listForContact(contactId),
    contactId,
  );
  if (appointments.isLoading) return <Skeleton className="h-16 w-full" />;

  const now = apiNow().toISOString();
  const next = (appointments.data ?? [])
    .filter((a) => a.status === "confirmed" && a.startAt >= now)
    .sort((a, b) => a.startAt.localeCompare(b.startAt))[0];
  if (!next) return null;

  return (
    <Card size="sm">
      <CardContent className="flex items-start gap-2.5">
        <CalendarClockIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">
            Next appointment
          </span>
          <span className="truncate text-sm font-medium">{next.title}</span>
          <span className="text-sm text-muted-foreground">
            {format(toDate(next.startAt), "EEE, MMM d 'at' h:mm a")}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function OpenDeals({ contactId }: { contactId: string }) {
  const opportunities = useResource(
    "opportunities",
    () => api.opportunities.listForContact(contactId),
    contactId,
  );
  if (opportunities.isLoading) return <Skeleton className="h-20 w-full" />;

  // Won and lost deals are history; beside a live thread only what is still
  // in play matters.
  const rows = (opportunities.data ?? []).filter((d) => d.status === "open");
  if (rows.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Open deals</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2.5">
        {rows.map((deal) => (
          <div key={deal.id} className="flex flex-col gap-0.5">
            <Link
              href={`/opportunities/${deal.id}`}
              className="truncate text-sm font-medium hover:underline"
            >
              {deal.name}
            </Link>
            <Money
              cents={deal.value}
              currency={deal.currency}
              className="text-sm text-muted-foreground"
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
