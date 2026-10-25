import { addDays, isSameMonth } from "date-fns";

import type { ISODate } from "@/types";
import { toDate } from "@/lib/format";
import {
  dayStart,
  localDay,
  visibleDays,
  type CalendarDay,
} from "./calendar-nav";

/**
 * The month view's pure parts, kept apart from React so they can be pinned
 * without a browser: the weeks-by-days shape of a month, which viewer-local
 * day each appointment falls on, and how many chips a day shows before
 * "+N more".
 *
 * No runtime imports from `@/lib/api`: rows come in, plain data goes out.
 */

/** Chips a day cell shows before it switches to "+N more". */
export const MAX_CHIPS_PER_DAY = 3;

/**
 * The month grid around `date`, as weeks of seven days, Sunday first:
 * September 2026 is five weeks, 30 August to 3 October. Days are stepped as
 * calendar days from local midnight (`addDays`), never by adding 24 hours, so
 * a DST change inside the month cannot skip or repeat a day.
 */
export function monthWeeks(date: CalendarDay): CalendarDay[][] {
  const { start, endExclusive } = visibleDays("month", date);
  const first = dayStart(start);
  const weeks: CalendarDay[][] = [];
  let week: CalendarDay[] = [];
  // `visibleDays` covers whole Sunday-to-Saturday weeks, so the last week
  // always fills.
  for (
    let i = 0, day = start;
    day < endExclusive;
    day = localDay(addDays(first, ++i))
  ) {
    week.push(day);
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  return weeks;
}

/** Whether `day` belongs to the month of `date`, not its leading or trailing week. */
export function isInMonth(day: CalendarDay, date: CalendarDay): boolean {
  return isSameMonth(dayStart(day), dayStart(date));
}

/**
 * The viewer-local day an appointment starting at `startAt` is filed under.
 * Never the UTC day or the calendar's own zone: 2026-09-08T17:00Z is 9
 * September in Singapore and 8 September in Los Angeles.
 */
export function localStartDay(startAt: ISODate): CalendarDay {
  return localDay(toDate(startAt));
}

/**
 * Rows filed under the viewer-local day they start on (`localStartDay`), in
 * input order (the API already sorts by `startAt`). An appointment that
 * crosses local midnight is listed on its start day only.
 */
export function groupByLocalDay<T extends { startAt: ISODate }>(
  rows: readonly T[],
): Map<CalendarDay, T[]> {
  const byDay = new Map<CalendarDay, T[]>();
  for (const row of rows) {
    const day = localStartDay(row.startAt);
    const list = byDay.get(day);
    if (list) list.push(row);
    else byDay.set(day, [row]);
  }
  return byDay;
}

/**
 * Which of a day's items show as chips. Up to `max` all show; above that,
 * `max - 1` show and the last line becomes "+N more", so a crowded cell is
 * never taller than a full one.
 */
export function splitOverflow<T>(
  items: readonly T[],
  max = MAX_CHIPS_PER_DAY,
): { visible: T[]; more: number } {
  if (items.length <= max) return { visible: [...items], more: 0 };
  const shown = Math.max(max - 1, 0);
  return { visible: items.slice(0, shown), more: items.length - shown };
}
