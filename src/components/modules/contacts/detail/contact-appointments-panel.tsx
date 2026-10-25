"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarPlusIcon } from "lucide-react";
import { format } from "date-fns";

import { APPOINTMENT_STATUS_LABELS, type AppointmentStatus } from "@/types";
import * as api from "@/lib/api";
import { apiNow, loadErrorOf, useResource } from "@/lib/api";
import { LoadError } from "@/components/common/load-error";
import { BookingDialog } from "@/components/modules/calendars/booking-dialog";
import {
  calendarSearch,
  localDay,
} from "@/components/modules/calendars/calendar-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { TAG_DOT_CLASSES } from "@/lib/constants";
import { cn } from "@/lib/utils";

const STATUS_VARIANTS: Record<
  AppointmentStatus,
  "secondary" | "outline" | "destructive"
> = {
  confirmed: "secondary",
  showed: "outline",
  no_show: "destructive",
  cancelled: "outline",
};

/**
 * A contact's appointments, newest first as the API lists them, each linking
 * to its day on the calendar, and a Book button that opens the booking dialog
 * with this contact filled in. Times are the viewer's, like everywhere else.
 * A failed load with nothing listed shows a `LoadError` with Retry, never
 * "No appointments yet."; a failed refetch keeps the rows already listed.
 */
export function ContactAppointmentsPanel({ contactId }: { contactId: string }) {
  const appointments = useResource(
    "appointments",
    () => api.calendars.listForContact(contactId),
    contactId,
  );
  const [bookOpen, setBookOpen] = useState(false);
  const loadError = loadErrorOf(appointments);
  const rows = appointments.data ?? [];

  return (
    <div className="flex flex-col gap-3 pt-3">
      <div className="flex items-center justify-end">
        <Button size="sm" onClick={() => setBookOpen(true)}>
          <CalendarPlusIcon data-icon="inline-start" />
          Book
        </Button>
      </div>

      {appointments.isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : loadError ? (
        <LoadError
          title="Could not load appointments"
          message={loadError.message}
          onRetry={appointments.refetch}
          retrying={appointments.isRefreshing}
        />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No appointments yet.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {rows.map((appointment) => {
            const start = new Date(appointment.startAt);
            const cancelled = appointment.status === "cancelled";
            return (
              <li
                key={appointment.id}
                data-appointment-id={appointment.id}
                data-status={appointment.status}
              >
                <Item size="sm" variant="outline">
                  <ItemMedia>
                    <span
                      aria-hidden
                      className={cn(
                        "size-2 rounded-full",
                        TAG_DOT_CLASSES[appointment.calendarColor],
                      )}
                    />
                  </ItemMedia>
                  <ItemContent className="min-w-0">
                    <ItemTitle
                      className={cn(
                        cancelled && "text-muted-foreground line-through",
                      )}
                    >
                      {appointment.title}
                    </ItemTitle>
                    <ItemDescription>
                      <Link
                        href={`/calendars${calendarSearch({
                          view: "day",
                          date: localDay(start),
                        })}`}
                        className="tabular-nums"
                      >
                        {format(start, "EEE, MMM d, yyyy · h:mm a")}
                      </Link>
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Badge variant={STATUS_VARIANTS[appointment.status]}>
                      {APPOINTMENT_STATUS_LABELS[appointment.status]}
                    </Badge>
                  </ItemActions>
                </Item>
              </li>
            );
          })}
        </ul>
      )}

      <BookingDialog
        open={bookOpen}
        onOpenChange={setBookOpen}
        contactId={contactId}
        defaultDay={localDay(apiNow())}
      />
    </div>
  );
}
