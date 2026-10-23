"use client";

import { useCallback, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarPlusIcon, ClockIcon } from "lucide-react";

import type { ID } from "@/types";
import * as api from "@/lib/api";
import { apiNow, useResource, type AppointmentRow } from "@/lib/api";
import { LoadError } from "@/components/common/load-error";
import { Button, LinkButton } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AppointmentDetailsDialog } from "./appointment-details-dialog";
import { liveFirst } from "./appointment-display";
import { appointmentFocusFallback } from "./appointment-focus";
import { BookingDialog } from "./booking-dialog";
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
 * When the appointments fail to load and there are no rows to draw (the first
 * load, or a step to a range that failed: `useResource` drops the previous
 * query's data then, so the old grid is never left under the new label), the
 * view area shows a `LoadError` whose Retry calls `refetch()`. While that
 * retry runs, the alert stays with its button busy, never a skeleton. A
 * refetch that fails while rows are on screen keeps them there.
 *
 * When the calendar list fails to load and none is on screen, its column
 * shows a `LoadError` whose Retry calls `refetch()`; while that retry runs,
 * the alert stays with its button busy, never a skeleton. The view still
 * draws the range's appointments, because each row carries its calendar's
 * name and colour, and no calendar is hidden. A refetch that fails with the
 * list on screen keeps the list.
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
 *
 * Closing the details puts focus back on the chip or block that opened them
 * while it is still on screen. It may not be: in month view a cancel lists the
 * appointment after the day's live ones (`liveFirst`), which can push its chip
 * behind "+N more", and Base UI would then drop focus to `<body>`. Focus goes
 * instead to the appointment's chip if it has come back (after Undo), else to
 * that day's "+N more" (`appointmentFocusFallback`).
 *
 * The toolbar's Book button opens the booking dialog on the day in view, or
 * on today when that day is already past. A booking invalidates
 * "appointments", so the view refetches and shows it without more wiring.
 * Beside it, Availability links to `/calendars/availability`, the editor for
 * each calendar's weekly hours and booking rules.
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
  // Nothing to draw because the read failed: the first load, or a step to a
  // range that failed. With rows on screen, a failed refetch keeps them.
  const loadError = shown === null ? appointments.error : null;

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
  // The button that opened the details, and for which row: read only when
  // the dialog closes, never during render.
  const openedFrom = useRef<{
    opener: HTMLElement;
    row: AppointmentRow;
  } | null>(null);
  const viewRef = useRef<HTMLElement>(null);
  const openAppointment = useCallback(
    (row: AppointmentRow, opener: HTMLElement) => {
      openedFrom.current = { opener, row };
      setDetail({ row, open: true });
    },
    [],
  );
  // Base UI calls this as the dialog closes. `true` keeps its own default.
  const detailsFinalFocus = useCallback((): HTMLElement | true => {
    const from = openedFrom.current;
    if (!from) return true;
    if (from.opener.isConnected) return from.opener;
    const view = viewRef.current;
    return (
      (view?.isConnected && appointmentFocusFallback(view, from.row)) || true
    );
  }, []);
  const detailRow = detail
    ? ((shown?.rows ?? []).find((row) => row.id === detail.row.id) ??
      detail.row)
    : null;

  const [bookOpen, setBookOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <CalendarToolbar
        view={view}
        date={date}
        today={today}
        timeZoneLabel={zoneLabel(dayStart(date))}
        onNavigate={navigate}
      >
        <LinkButton href="/calendars/availability" variant="outline">
          <ClockIcon data-icon="inline-start" />
          Availability
        </LinkButton>
        <Button onClick={() => setBookOpen(true)}>
          <CalendarPlusIcon data-icon="inline-start" />
          Book
        </Button>
      </CalendarToolbar>
      <div className="grid gap-4 md:grid-cols-[14rem_minmax(0,1fr)]">
        <div>
          {calendars.isLoading ? (
            <CalendarListSkeleton />
          ) : calendars.error && calendars.data === undefined ? (
            <LoadError
              title="Could not load calendars"
              message={calendars.error.message}
              onRetry={calendars.refetch}
              retrying={calendars.isRefreshing}
            />
          ) : (
            <CalendarList
              // Loaded here; `?? []` only satisfies the type.
              calendars={calendars.data ?? []}
              hidden={hidden}
              onToggle={toggleCalendar}
            />
          )}
        </div>
        <div className="min-w-0">
          {loadError && !calendars.isLoading ? (
            <LoadError
              title="Could not load appointments"
              message={loadError.message}
              onRetry={appointments.refetch}
              retrying={appointments.isRefreshing}
            />
          ) : calendars.isLoading || shown === null ? (
            <Skeleton className="h-80 w-full rounded-xl" />
          ) : (
            <section
              ref={viewRef}
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
        finalFocus={detailsFinalFocus}
      />
      <BookingDialog
        open={bookOpen}
        onOpenChange={setBookOpen}
        // "YYYY-MM-DD" strings compare in date order.
        defaultDay={date >= today ? date : today}
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
