"use client";

import Link from "next/link";
import { CalendarIcon } from "lucide-react";
import { format, isSameDay, parseISO } from "date-fns";

import * as api from "@/lib/api";
import { apiNow, useResource } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TAG_DOT_CLASSES } from "@/lib/constants";
import { cn } from "@/lib/utils";

/** "Today", "Tomorrow", else "Wed, Sep 10" — against the demo clock. */
function dayLabel(date: Date, now: Date): string {
  if (isSameDay(date, now)) return "Today";
  // Not `isTomorrow`: that reads the wall clock, not the demo day.
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (isSameDay(date, tomorrow)) return "Tomorrow";
  return format(date, "EEE, MMM d");
}

/**
 * The next confirmed bookings. This is where an appointment booked in
 * Calendars shows up on the dashboard (the Phase 7 check).
 */
export function UpcomingAppointmentsCard() {
  const upcoming = useResource("appointments", () =>
    api.calendars.listUpcoming(6),
  );
  const now = apiNow();
  const rows = upcoming.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upcoming appointments</CardTitle>
        <CardDescription>Next confirmed bookings.</CardDescription>
      </CardHeader>
      <CardContent>
        {upcoming.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
            <CalendarIcon className="size-5" aria-hidden />
            Nothing booked ahead.
          </div>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {rows.map((appointment) => {
              const start = parseISO(appointment.startAt);
              return (
                <li
                  key={appointment.id}
                  data-appointment-id={appointment.id}
                  className="flex items-start gap-2.5"
                >
                  <span
                    className={cn(
                      "mt-1.5 size-2 shrink-0 rounded-full",
                      TAG_DOT_CLASSES[appointment.calendarColor],
                    )}
                    aria-hidden
                  />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <Link
                      href={`/contacts/${appointment.contactId}`}
                      className="truncate text-sm hover:underline"
                    >
                      {appointment.contactName}
                    </Link>
                    <span className="truncate text-xs text-muted-foreground">
                      {appointment.calendarName}
                    </span>
                  </div>
                  <span className="shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                    {dayLabel(start, now)}
                    <br />
                    {format(start, "h:mm a")}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
