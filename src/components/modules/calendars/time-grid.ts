import { addDays } from "date-fns";

import type { ISODate } from "@/types";
import { toDate } from "@/lib/format";
import {
  dayStart,
  localDay,
  visibleDays,
  type CalendarDay,
} from "./calendar-nav";
import { packIntervals, type Placement } from "./pack-intervals";

/**
 * The week and day views' pure parts, kept apart from React so they can be
 * pinned without a browser: which days a view shows, where an appointment sits
 * in a day, the now line and where the grid scrolls when it opens.
 *
 * A day is 24 rows of wall-clock hours in the viewer's zone, and an
 * appointment's position is its wall-clock start there (never the UTC hour or
 * the calendar's own zone). An appointment that crosses local midnight is cut
 * into a segment on each day it occupies; unlike the month view, which lists
 * it on its start day only, a time grid draws occupied time.
 *
 * DST days are not stretched: the grid always has 24 rows, a block's top is
 * its wall-clock start and its height its real duration (capped at midnight).
 * On a fall-back day the repeated hour overlaps itself and on a spring-forward
 * day the missing hour is an empty row. Seeded appointments never fall in
 * those hours for a US viewer, so this is accepted rather than handled.
 *
 * No runtime imports from `@/lib/api`: rows come in, plain data goes out.
 */

export const MINUTES_PER_DAY = 24 * 60;

/** The height of one hour row, in CSS pixels. The view and its maths share it. */
export const HOUR_HEIGHT_PX = 48;

/** How far above the earliest appointment the grid opens, in minutes. */
export const SCROLL_LEAD_MIN = 30;

/** Where an empty view opens when today is not in it either: 08:00. */
export const DEFAULT_SCROLL_MIN = 8 * 60;

/** Vertical offset of a minute of the day, in CSS pixels. */
export function minutesToPx(minutes: number): number {
  return (minutes / 60) * HOUR_HEIGHT_PX;
}

/** "12 AM", "1 AM" … "11 PM": the hour gutter's labels. */
export function hourLabel(hour: number): string {
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve} ${hour < 12 ? "AM" : "PM"}`;
}

/**
 * The days a week or day view shows, in order. Stepped as calendar days from
 * local midnight (`addDays`), never by adding 24 hours, so a DST change inside
 * the week cannot skip or repeat a day.
 */
export function viewDays(
  view: "week" | "day",
  date: CalendarDay,
): CalendarDay[] {
  const { start } = visibleDays(view, date);
  if (view === "day") return [start];
  const first = dayStart(start);
  return Array.from({ length: 7 }, (_, i) => localDay(addDays(first, i)));
}

/** Wall-clock minutes since local midnight: 01:30 is 90. */
export function minutesIntoDay(at: Date): number {
  return at.getHours() * 60 + at.getMinutes();
}

/** The part of an appointment that falls on one day, in minutes of that day. */
export interface DaySegment<T> {
  row: T;
  /** Minutes into the day; 0 when the appointment began the day before. */
  start: number;
  /** Minutes into the day, after `start`; 1440 when it runs past midnight. */
  end: number;
  /** It began before this day's local midnight. */
  clippedStart: boolean;
  /** It ends after the next local midnight. */
  clippedEnd: boolean;
}

/**
 * The segments of `rows` that fall on `day`, in input order: each row that
 * overlaps [local midnight, next local midnight), cut to it. A row that ends
 * exactly at midnight stays on its own day only.
 */
export function daySegments<T extends { startAt: ISODate; endAt: ISODate }>(
  rows: readonly T[],
  day: CalendarDay,
): DaySegment<T>[] {
  const from = dayStart(day);
  const fromMs = from.getTime();
  const toMs = addDays(from, 1).getTime();

  const segments: DaySegment<T>[] = [];
  for (const row of rows) {
    const start = toDate(row.startAt);
    const end = toDate(row.endAt);
    const startMs = start.getTime();
    const endMs = end.getTime();
    if (startMs >= toMs || endMs <= fromMs) continue;

    const clippedStart = startMs < fromMs;
    const clippedEnd = endMs > toMs;
    const startMin = clippedStart ? 0 : minutesIntoDay(start);
    const endMin = clippedEnd
      ? MINUTES_PER_DAY
      : clippedStart
        ? minutesIntoDay(end)
        : Math.min(startMin + (endMs - startMs) / 60_000, MINUTES_PER_DAY);
    segments.push({
      row,
      start: startMin,
      end: endMin,
      clippedStart,
      clippedEnd,
    });
  }
  return segments;
}

/** A day's segment with its side-by-side placement. */
export type LaidOutSegment<T> = DaySegment<T> & Placement;

/**
 * A day's segments with their columns: overlapping ones side by side, as
 * `packIntervals` decides. In input order.
 */
export function layoutDay<T extends { startAt: ISODate; endAt: ISODate }>(
  rows: readonly T[],
  day: CalendarDay,
): LaidOutSegment<T>[] {
  const segments = daySegments(rows, day);
  const placements = packIntervals(segments);
  return segments.map((segment, i) => ({
    ...segment,
    ...(placements[i] ?? { column: 0, columns: 1 }),
  }));
}

/**
 * Where the now line sits on `day`, in minutes, or null when `now` is on
 * another day. `now` is the demo clock's, never the wall clock's.
 */
export function nowLineMinutes(now: Date, day: CalendarDay): number | null {
  return localDay(now) === day ? minutesIntoDay(now) : null;
}

/**
 * The minute of the day the grid opens at: a little above the earliest
 * segment start across every day in view (a time of day, so Tuesday 04:00
 * beats Monday 06:00), clamped at midnight. With nothing in view it leads the
 * now line if today is in view, else opens at 08:00.
 */
export function scrollTargetMinutes(
  segmentStarts: readonly number[],
  nowMinutes: number | null,
): number {
  const anchor =
    segmentStarts.length > 0 ? Math.min(...segmentStarts) : nowMinutes;
  if (anchor === null) return DEFAULT_SCROLL_MIN;
  return Math.max(0, anchor - SCROLL_LEAD_MIN);
}
