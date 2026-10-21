"use client";

import { useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";

import type { ID } from "@/types";
import * as api from "@/lib/api";
import { apiNow, useResource } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarList } from "./calendar-list";
import {
  VIEW_LABELS,
  calendarSearch,
  dayStart,
  historyMethod,
  localDay,
  parseCalendarParams,
  rangeLabel,
  toInstantRange,
  visibleDays,
  zoneLabel,
  type CalendarPosition,
} from "./calendar-nav";
import { CalendarToolbar } from "./calendar-toolbar";
import { MonthView } from "./month-view";
import { ViewPlaceholder } from "./view-placeholder";

const NONE_HIDDEN: ReadonlySet<ID> = new Set();

/**
 * The calendars page body: toolbar, calendar list and the current view.
 *
 * The view and date live in the URL and nowhere else. They are read with
 * `useSearchParams` (the page wraps this in `<Suspense>`, which Next requires
 * for a prerendered route) and written with `history.pushState` or
 * `replaceState`, both of which Next 16 syncs into `useSearchParams`: a step
 * is a client re-render with no server round trip, and Back/Forward walk the
 * steps. A step that would not change the URL adds no history entry, and one
 * that keeps the position but tidies a non-canonical URL replaces it (see
 * `historyMethod`). A missing or invalid value falls back to month view and
 * the demo clock's today; it is not rewritten into the URL on load.
 *
 * While the next range loads, the previous range's view stays on screen,
 * dimmed and `aria-busy`, at its own position; a skeleton shows only on the
 * very first load. `useResource` keeps the last query's data while
 * `isLoading`, and the fetcher returns the position it was asked for, so the
 * old rows are never drawn on the new range's grid. `isRefreshing` (a refetch
 * after a mutation) changes nothing here.
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

  const navigate = useCallback(
    (next: CalendarPosition) => {
      switch (historyMethod(window.location.search, { view, date }, next)) {
        case "none":
          return;
        case "replace":
          window.history.replaceState(null, "", calendarSearch(next));
          return;
        case "push":
          window.history.pushState(null, "", calendarSearch(next));
      }
    },
    [view, date],
  );

  const calendars = useResource("calendars", () => api.calendars.list());

  const range = toInstantRange(visibleDays(view, date));
  const appointments = useResource(
    "appointments",
    async () => ({
      view,
      date,
      rows: await api.calendars.listAppointments(range),
    }),
    // Strings only. A Date, or anything read from apiNow(), would differ on
    // every render and refetch forever.
    `${range.from}|${range.to}`,
  );

  // The last result, for this range or, while `isLoading`, the previous one.
  const settled = appointments.data;
  const pending = appointments.isLoading && settled !== undefined;
  const shown =
    settled === undefined
      ? null
      : pending
        ? settled
        : // Loaded: the rows answer this range, so draw them at the URL's
          // position (a view or date change within the same range refetches
          // nothing).
          { view, date, rows: settled.rows };

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

  // Filtered once, here, so no view can ever receive a hidden calendar's rows,
  // stale ones included.
  const shownCalendars = (calendars.data ?? []).filter(
    (calendar) => !hidden.has(calendar.id),
  );
  const shownAppointments = (shown?.rows ?? []).filter(
    (appointment) => !hidden.has(appointment.calendarId),
  );

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
          {calendars.isLoading || shown === null ? (
            <Skeleton className="h-80 w-full rounded-xl" />
          ) : (
            <section
              aria-label={`${VIEW_LABELS[shown.view]} view`}
              aria-busy={pending || undefined}
              data-pending={pending || undefined}
              className="transition-opacity duration-150 data-pending:opacity-60 motion-reduce:transition-none"
            >
              {shown.view === "month" ? (
                <MonthView
                  date={shown.date}
                  today={today}
                  appointments={shownAppointments}
                  onOpenDay={(day) => navigate({ view: "day", date: day })}
                />
              ) : (
                // P7-T06 replaces this with the week and day time grids.
                <ViewPlaceholder
                  view={shown.view}
                  label={rangeLabel(shown.view, shown.date)}
                  calendars={shownCalendars}
                  appointments={shownAppointments}
                />
              )}
            </section>
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
