import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
} from "date-fns";

import type { ISODate } from "@/types";

/**
 * Where the calendars page is looking: a view and a day, both kept in the URL
 * (`/calendars?view=week&date=2026-09-08`). Everything derived from those two
 * values lives here as pure functions, so the page, its toolbar and the
 * month/week/day views agree on ranges and labels, and the tests can pin them
 * without a browser.
 *
 * The URL date is a viewer-local calendar day. It is turned into a `Date` only
 * here, at the render edge, as local midnight; instants leave this module as
 * ISO strings. Weeks start on Sunday (date-fns' default).
 *
 * No imports from `@/lib/api`: this module is plain data in, data out. "Today"
 * is the caller's to supply, from the demo clock.
 */

export const CALENDAR_VIEWS = ["month", "week", "day"] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];

export const VIEW_LABELS: Record<CalendarView, string> = {
  month: "Month",
  week: "Week",
  day: "Day",
};

/** A viewer-local calendar day, "YYYY-MM-DD". */
export type CalendarDay = string;

export interface CalendarPosition {
  view: CalendarView;
  date: CalendarDay;
}

/** The days a view shows, as [start, endExclusive). */
export interface DayRange {
  start: CalendarDay;
  endExclusive: CalendarDay;
}

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const EN_DASH = "–";

/**
 * `day` as local midnight, or null unless it is a real "YYYY-MM-DD" day.
 * Round-trips through the Date so an overflow (2026-02-30 becoming 2 March)
 * or a two-digit year (`new Date(99, 0, 1)` is 1999) is rejected rather than
 * silently moved.
 */
function parseDay(day: string): Date | null {
  const match = DAY_PATTERN.exec(day);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const date = Number(match[3]);
  const local = new Date(year, month, date);
  return local.getFullYear() === year &&
    local.getMonth() === month &&
    local.getDate() === date
    ? local
    : null;
}

function mustParseDay(day: CalendarDay): Date {
  const local = parseDay(day);
  if (!local) throw new RangeError(`Not a calendar day: ${day}`);
  return local;
}

export function isCalendarDay(value: string): value is CalendarDay {
  return parseDay(value) !== null;
}

export function isCalendarView(value: string | null): value is CalendarView {
  return (CALENDAR_VIEWS as readonly (string | null)[]).includes(value);
}

/** The viewer-local calendar day an instant falls on. */
export function localDay(at: Date): CalendarDay {
  return format(at, "yyyy-MM-dd");
}

/**
 * The view and day a query string asks for. Anything missing or invalid falls
 * back (an unknown view to month, a bad date to `today`) and never throws: a
 * hand-edited or stale URL still opens a working page. Matching is exact, so
 * `?view=WEEK` is unknown. A duplicated parameter reads its first value, as
 * `URLSearchParams.get` does.
 */
export function parseCalendarParams(
  params: { get(name: string): string | null },
  today: CalendarDay,
): CalendarPosition {
  const view = params.get("view");
  const date = params.get("date");
  return {
    view: isCalendarView(view) ? view : "month",
    date: date !== null && isCalendarDay(date) ? date : today,
  };
}

/** The query string for a position, "?view=week&date=2026-09-08". */
export function calendarSearch({ view, date }: CalendarPosition): string {
  return `?${new URLSearchParams({ view, date }).toString()}`;
}

/**
 * One step back or forward by the view's unit. Months clamp to the shorter
 * month's last day (31 January + 1 month is 28 February), as date-fns does.
 */
export function shiftDate(
  view: CalendarView,
  date: CalendarDay,
  step: -1 | 1,
): CalendarDay {
  const local = mustParseDay(date);
  const next =
    view === "month"
      ? addMonths(local, step)
      : view === "week"
        ? addWeeks(local, step)
        : addDays(local, step);
  return localDay(next);
}

/**
 * The days a view covers. Month is the full weeks-by-days grid around the
 * month (September 2026 runs 30 August to 3 October), so the month view can
 * fill its leading and trailing days from the same fetch.
 */
export function visibleDays(view: CalendarView, date: CalendarDay): DayRange {
  const local = mustParseDay(date);
  if (view === "day") {
    return { start: date, endExclusive: localDay(addDays(local, 1)) };
  }
  if (view === "week") {
    const start = startOfWeek(local);
    return {
      start: localDay(start),
      endExclusive: localDay(addDays(start, 7)),
    };
  }
  const last = endOfWeek(endOfMonth(local));
  return {
    start: localDay(startOfWeek(startOfMonth(local))),
    // `last` is 23:59:59.999 on the grid's final Saturday; its next calendar
    // day is the exclusive end.
    endExclusive: localDay(addDays(mustParseDay(localDay(last)), 1)),
  };
}

/**
 * A day range as instants: local midnight to local midnight, which is not
 * always a multiple of 24 hours (a DST change inside the range moves it).
 */
export function toInstantRange({ start, endExclusive }: DayRange): {
  from: ISODate;
  to: ISODate;
} {
  return {
    from: mustParseDay(start).toISOString(),
    to: mustParseDay(endExclusive).toISOString(),
  };
}

/**
 * The toolbar heading: "September 2026", "Sep 6 – 12, 2026",
 * "Sep 27 – Oct 3, 2026", "Dec 27, 2026 – Jan 2, 2027" or
 * "Tuesday, September 8, 2026".
 */
export function rangeLabel(view: CalendarView, date: CalendarDay): string {
  const local = mustParseDay(date);
  if (view === "month") return format(local, "MMMM yyyy");
  if (view === "day") return format(local, "EEEE, MMMM d, yyyy");

  const first = startOfWeek(local);
  const last = addDays(first, 6);
  if (first.getFullYear() !== last.getFullYear()) {
    return `${format(first, "MMM d, yyyy")} ${EN_DASH} ${format(last, "MMM d, yyyy")}`;
  }
  if (first.getMonth() !== last.getMonth()) {
    return `${format(first, "MMM d")} ${EN_DASH} ${format(last, "MMM d, yyyy")}`;
  }
  return `${format(first, "MMM d")} ${EN_DASH} ${format(last, "d, yyyy")}`;
}

/**
 * The viewer's zone and its offset at `at`, "Asia/Singapore · GMT+8". Times
 * on the calendars page are shown in this zone.
 */
export function zoneLabel(at: Date): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const offset = new Intl.DateTimeFormat("en-US", {
    timeZoneName: "shortOffset",
  })
    .formatToParts(at)
    .find((part) => part.type === "timeZoneName")?.value;
  return offset ? `${zone} · ${offset}` : zone;
}

/** Local midnight of a calendar day, for callers that need a `Date`. */
export function dayStart(date: CalendarDay): Date {
  return mustParseDay(date);
}
