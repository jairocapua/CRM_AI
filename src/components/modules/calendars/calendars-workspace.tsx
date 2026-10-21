"use client";

import { useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";

import type { ID } from "@/types";
import * as api from "@/lib/api";
import { apiNow, useResource } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarList } from "./calendar-list";
import {
  calendarSearch,
  dayStart,
  localDay,
  parseCalendarParams,
  rangeLabel,
  toInstantRange,
  visibleDays,
  zoneLabel,
  type CalendarPosition,
} from "./calendar-nav";
import { CalendarToolbar } from "./calendar-toolbar";
import { ViewPlaceholder } from "./view-placeholder";

const NONE_HIDDEN: ReadonlySet<ID> = new Set();

/**
 * The calendars page body: toolbar, calendar list and the current view.
 *
 * The view and date live in the URL and nowhere else. They are read with
 * `useSearchParams` (the page wraps this in `<Suspense>`, which Next requires
 * for a prerendered route) and written with `history.pushState`, which Next
 * 16 syncs into `useSearchParams`: a step is a client re-render with no server
 * round trip, and Back/Forward walk the steps. A missing or invalid value
 * falls back to month view and the demo clock's today; it is not rewritten
 * into the URL, and the next step writes canonical values.
 *
 * Which calendars are hidden is component state: a way of looking, not a
 * change to any calendar, so it never reaches the store. Seeded ids also
 * change on every reseed, so they would rot in a bookmarked URL. It survives
 * view and date changes and resets on reload.
 */
export function CalendarsWorkspace() {
  const searchParams = useSearchParams();
  // The demo clock, never `new Date()`: today is the seeded world's day.
  const today = localDay(apiNow());
  const { view, date } = parseCalendarParams(searchParams, today);

  const navigate = useCallback((next: CalendarPosition) => {
    window.history.pushState(null, "", calendarSearch(next));
  }, []);

  const calendars = useResource("calendars", () => api.calendars.list());

  const range = toInstantRange(visibleDays(view, date));
  const appointments = useResource(
    "appointments",
    () => api.calendars.listAppointments(range),
    // Strings only. A Date, or anything read from apiNow(), would differ on
    // every render and refetch forever.
    `${range.from}|${range.to}`,
  );

  const [hidden, setHidden] = useState<ReadonlySet<ID>>(NONE_HIDDEN);
  const toggleCalendar = useCallback((id: ID, visible: boolean) => {
    setHidden((prev) => {
      if (prev.has(id) !== visible) return prev;
      const next = new Set(prev);
      if (visible) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Filtered once, here, so no view can ever receive a hidden calendar's rows.
  const shownCalendars = (calendars.data ?? []).filter(
    (calendar) => !hidden.has(calendar.id),
  );
  const shownAppointments = (appointments.data ?? []).filter(
    (appointment) => !hidden.has(appointment.calendarId),
  );

  const label = rangeLabel(view, date);
  const viewProps = {
    label,
    calendars: shownCalendars,
    appointments: shownAppointments,
  };

  return (
    <div className="flex flex-col gap-4">
      <CalendarToolbar
        view={view}
        date={date}
        today={today}
        timeZoneLabel={zoneLabel(dayStart(date))}
        onNavigate={navigate}
      />
      <div className="grid gap-4 md:grid-cols-[14rem_minmax(0,1fr)]">
        <div>
          {calendars.isLoading ? (
            <CalendarListSkeleton />
          ) : (
            <CalendarList
              calendars={calendars.data ?? []}
              hidden={hidden}
              onToggle={toggleCalendar}
            />
          )}
        </div>
        <div className="min-w-0">
          {calendars.isLoading || appointments.isLoading ? (
            <Skeleton className="h-80 w-full rounded-xl" />
          ) : view === "month" ? (
            // P7-T05 replaces this branch with the month grid.
            <ViewPlaceholder view="month" {...viewProps} />
          ) : view === "week" ? (
            // P7-T06 replaces this branch and the next with the time grid.
            <ViewPlaceholder view="week" {...viewProps} />
          ) : (
            <ViewPlaceholder view="day" {...viewProps} />
          )}
        </div>
      </div>
    </div>
  );
}

function CalendarListSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-4 w-20" />
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-7 w-full" />
      ))}
    </div>
  );
}

/** The page's `<Suspense>` fallback, shaped like the workspace. */
export function CalendarsWorkspaceSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-8 w-full max-w-xl" />
      <div className="grid gap-4 md:grid-cols-[14rem_minmax(0,1fr)]">
        <CalendarListSkeleton />
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    </div>
  );
}
