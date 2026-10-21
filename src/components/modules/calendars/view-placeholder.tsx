import { CalendarDaysIcon } from "lucide-react";

import type { AppointmentRow } from "@/lib/api";
import type { Calendar, ID } from "@/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { TAG_DOT_CLASSES } from "@/lib/constants";
import { pluralize } from "@/lib/format";
import { cn } from "@/lib/utils";
import { VIEW_LABELS, type CalendarView } from "./calendar-nav";

/**
 * Stands in for the month, week and day views until P7-T05/T06 replace them.
 * It already receives exactly what a real view will: the visible calendars
 * and the appointments in range with hidden calendars filtered out. It shows
 * a per-calendar count, so the data path can be checked end to end.
 */
export function ViewPlaceholder({
  view,
  label,
  calendars,
  appointments,
}: {
  view: CalendarView;
  label: string;
  calendars: readonly Calendar[];
  appointments: readonly AppointmentRow[];
}) {
  const counts = new Map<ID, number>();
  for (const appointment of appointments) {
    counts.set(
      appointment.calendarId,
      (counts.get(appointment.calendarId) ?? 0) + 1,
    );
  }
  const booked = calendars.filter((calendar) => counts.has(calendar.id));

  return (
    <Card className="min-h-80">
      <CardHeader>
        <CardTitle>{VIEW_LABELS[view]} view</CardTitle>
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        {appointments.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CalendarDaysIcon />
              </EmptyMedia>
              <EmptyTitle>No appointments in view</EmptyTitle>
              <EmptyDescription>
                Nothing is booked on the visible calendars this {view}.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <ul
              aria-label="Appointments in view"
              className="flex flex-col gap-1.5"
            >
              {booked.map((calendar) => (
                <li
                  key={calendar.id}
                  className="flex items-center gap-2.5 text-sm"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "size-2.5 shrink-0 rounded-full",
                      TAG_DOT_CLASSES[calendar.color],
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {calendar.name}
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {counts.get(calendar.id)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground text-sm">
              {pluralize(appointments.length, "appointment")} in view
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
