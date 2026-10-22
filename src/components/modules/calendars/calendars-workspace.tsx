"use client";

import { useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";

import type { ID } from "@/types";
import * as api from "@/lib/api";
import { apiNow, useResource, type AppointmentRow } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { AppointmentDetailsDialog } from "./appointment-details-dialog";
import { liveFirst } from "./appointment-display";
import { CalendarList } from "./calendar-list";
import {
  VIEW_LABELS,
  calendarSearch,
  dayStart,
  historyMethod,
  localDay,
  parseCalendarParams,
  toInstantRange,
  visibleDays,
  zoneLabel,
  type CalendarPosition,
} from "./calendar-nav";
import { CalendarToolbar } from "./calendar-toolbar";
import { MonthView } from "./month-view";
import { TimeGridView } from "./time-grid-view";

const NONE_HIDDEN: ReadonlySet<ID> = new Set();

/**
 * The calendars page body: toolbar, calendar list and the current view (the
 * month grid, or the week and day time grids).
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
 *
 * Within a day, live appointments are listed before cancelled ones in every
 * view (`liveFirst`, applied once here), so a cancellation stays visible,
 * struck through, but never pushes a live booking behind "+N more".
 *
 * Clicking an appointment opens its details in a dialog. Which one is open is
 * component state, not the URL, for the same reseed reason. The dialog shows
 * the row as the latest fetch has it, so a status change or cancel made there
 * shows up once the refetch lands; if the row is gone from the range, the
 * snapshot taken on click stands. Closing keeps that row, so the exit
 * animation never draws an empty dialog.
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

  // Filtered and ordered once, here, so no view can ever receive a hidden
  // calendar's rows, stale ones included, or list a cancelled appointment
  // ahead of a live one on its day.
  const shownAppointments = liveFirst(
    (shown?.rows ?? []).filter(
      (appointment) => !hidden.has(appointment.calendarId),
    ),
  );

  const [detail, setDetail] = useState<{
    row: AppointmentRow;
    open: boolean;
  } | null>(null);
  const openAppointment = useCallback(
    (row: AppointmentRow) => setDetail({ row, open: true }),
    [],
  );
  const detailRow = detail
    ? ((shown?.rows ?? []).find((row) => row.id === detail.row.id) ??
      detail.row)
    : null;

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
                  onOpenAppointment={openAppointment}
                />
              ) : (
                <TimeGridView
                  view={shown.view}
                  date={shown.date}
                  today={today}
                  appointments={shownAppointments}
                  onOpenAppointment={openAppointment}
                />
              )}
            </section>
          )}
        </div>
      </div>
      <AppointmentDetailsDialog
        appointment={detailRow}
        open={detail?.open ?? false}
        onOpenChange={(open) =>
          setDetail((prev) => (prev ? { ...prev, open } : prev))
        }
      />
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
