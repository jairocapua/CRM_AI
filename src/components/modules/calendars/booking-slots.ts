import type { ISODate } from "@/types";
import { calendarDayOf } from "./appointment-display";
import {
  dayStart,
  localDay,
  shiftDate,
  type CalendarDay,
} from "./calendar-nav";

/**
 * The booking dialog's day mapping, kept apart from React so it can be pinned
 * in any zone without a browser.
 *
 * The dialog's Day is a viewer-local day, like every other day on screen.
 * `availableSlots()` takes a date in the calendar's own zone, and from Asia
 * one local day overlaps two Los Angeles dates. So the dialog asks for every
 * calendar date its day touches (`calendarDaysFor`) and keeps the slots that
 * fall on the viewer's day (`slotsOnLocalDay`). A day is never derived from
 * `toISOString()`, whose UTC date is a day off for most of the world's
 * evenings.
 *
 * No runtime imports from `@/lib/api`: dates and instants in, data out.
 */

const DAY_MS = 86_400_000;

/** The calendar date after `date`. Date arithmetic only, so done in UTC. */
function nextDate(date: CalendarDay): CalendarDay {
  const midnightUtc = Date.parse(`${date}T00:00:00Z`);
  return calendarDayOf(new Date(midnightUtc + DAY_MS).toISOString(), "UTC");
}

/**
 * The dates in `timeZone` (an IANA name) that the viewer-local `day`
 * overlaps, in order: from the date its first instant falls on to the date of
 * its last millisecond, and every date between. Usually one or two; a day
 * that lasts 25 hours can reach three.
 */
export function calendarDaysFor(
  day: CalendarDay,
  timeZone: string,
): CalendarDay[] {
  const start = dayStart(day);
  const end = dayStart(shiftDate("day", day, 1));
  const first = calendarDayOf(start.toISOString(), timeZone);
  const last = calendarDayOf(
    new Date(end.getTime() - 1).toISOString(),
    timeZone,
  );

  const dates: CalendarDay[] = [];
  // "YYYY-MM-DD" strings compare in date order.
  for (let date = first; date <= last; date = nextDate(date)) {
    dates.push(date);
  }
  return dates;
}

/**
 * The slots, from every calendar date's list, that start on the viewer-local
 * `day`: each instant once (whatever its ISO spelling, the first one seen is
 * kept), earliest first.
 */
export function slotsOnLocalDay(
  lists: readonly (readonly ISODate[])[],
  day: CalendarDay,
): ISODate[] {
  const byInstant = new Map<number, ISODate>();
  for (const list of lists) {
    for (const slot of list) {
      const ms = Date.parse(slot);
      if (Number.isNaN(ms) || byInstant.has(ms)) continue;
      if (localDay(new Date(ms)) !== day) continue;
      byInstant.set(ms, slot);
    }
  }
  return [...byInstant].sort(([a], [b]) => a - b).map(([, slot]) => slot);
}
