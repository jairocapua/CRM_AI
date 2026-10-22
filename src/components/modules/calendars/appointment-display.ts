import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";

import type { AppointmentStatus, ID, ISODate } from "@/types";
import { zoneLabel, type CalendarDay } from "./calendar-nav";

/**
 * How an appointment is shown, kept apart from React so it can be pinned
 * without a browser: the order a day lists its appointments in, an instant's
 * date and wall-clock times in a given zone, whether a start is still offered,
 * and which status the details show while a change is in flight.
 *
 * No runtime imports from `@/lib/api`: rows come in, plain data goes out.
 */

const EN_DASH = "–";

/**
 * Live appointments first, then cancelled ones, each group in input order:
 * a stable split, not a sort. The API returns rows by start time, so within a
 * day the live ones stay in time order and the cancelled ones follow, still in
 * time order. The workspace applies it once, and both views keep the order
 * they are given (`groupByLocalDay`, `layoutDay`), so in every view a
 * cancellation never pushes a live booking behind "+N more", and an identical
 * time slot draws the live booking in the leftmost column.
 */
export function liveFirst<T extends { status: AppointmentStatus }>(
  rows: readonly T[],
): T[] {
  const live: T[] = [];
  const cancelled: T[] = [];
  for (const row of rows) {
    (row.status === "cancelled" ? cancelled : live).push(row);
  }
  return [...live, ...cancelled];
}

/**
 * The "YYYY-MM-DD" date an instant falls on in `timeZone` (an IANA name),
 * whatever the viewer's zone: the day `availableSlots()` takes for a
 * calendar. Never the UTC date (`toISOString`), which is a day off for most
 * of the world's evenings.
 */
export function calendarDayOf(iso: ISODate, timeZone: string): CalendarDay {
  return format(new TZDate(Date.parse(iso), timeZone), "yyyy-MM-dd");
}

/** An appointment's date and times in one zone, ready to print. */
export interface ZonedTimes {
  /** "Tuesday, September 8, 2026": the start's date. */
  day: string;
  /** "10:00 AM – 10:30 AM". */
  times: string;
  /** "America/Los_Angeles · GMT-7", the offset on the start's date. */
  zone: string;
}

/**
 * The start's date and the start and end times in `timeZone`, or in the
 * viewer's own zone when none is given.
 */
export function zonedTimes(
  startAt: ISODate,
  endAt: ISODate,
  timeZone?: string,
): ZonedTimes {
  const at = (iso: ISODate) =>
    timeZone === undefined
      ? new Date(iso)
      : new TZDate(Date.parse(iso), timeZone);
  const start = at(startAt);
  const end = at(endAt);
  return {
    day: format(start, "EEEE, MMMM d, yyyy"),
    times: `${format(start, "h:mm a")} ${EN_DASH} ${format(end, "h:mm a")}`,
    zone: zoneLabel(new Date(startAt), timeZone),
  };
}

/**
 * Whether `startAt` is one of the instants a calendar offers (`slots`, as
 * `availableSlots()` returns them). Compared as instants, so any ISO spelling
 * of the same moment matches.
 */
export function offersStart(slots: readonly ISODate[], startAt: ISODate) {
  const startMs = Date.parse(startAt);
  if (Number.isNaN(startMs)) return false;
  return slots.some((slot) => Date.parse(slot) === startMs);
}

/**
 * A status change the details asked for and the store has not yet answered:
 * which appointment, the `updatedAt` it was made against, and the status.
 */
export interface StatusWrite {
  id: ID;
  base: ISODate;
  status: AppointmentStatus;
}

/**
 * The status the details show: the write's while it is in flight for this
 * appointment, the stored one otherwise. Derived rather than synced: the
 * write stops counting the moment the row carries a newer `updatedAt` (the
 * refetch after the change), so the select neither snaps back to the old
 * value while the change and the refetch run nor needs an effect to let go.
 */
export function shownStatus(
  row: { id: ID; updatedAt: ISODate; status: AppointmentStatus },
  write: StatusWrite | null,
): AppointmentStatus {
  return write !== null && write.id === row.id && write.base === row.updatedAt
    ? write.status
    : row.status;
}
