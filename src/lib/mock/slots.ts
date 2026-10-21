import { TZDate } from "@date-fns/tz";

import type { Appointment, AvailabilityRule, Calendar } from "@/types";

/**
 * The booking engine: which start times a calendar offers on a given day.
 *
 * Server-owned, like `delivery.ts`: a real backend computes availability, so
 * components only ever see the result through `api.calendars`. The API's
 * `availableSlots()` and `book()` and the seed's appointment placement all
 * share this one module, so what the seed writes, what the booking dialog
 * offers and what `book()` accepts cannot disagree.
 *
 * The time model:
 *
 * - A day is a calendar date ("YYYY-MM-DD") read in the calendar's own zone,
 *   and runs from that zone's midnight to the next. It is 24 hours long on
 *   most days, 23 or 25 across a DST change.
 * - Availability windows ("09:00"-"17:00") are wall-clock times in that zone.
 * - Slots step by elapsed minutes from each window's start. On the 25-hour
 *   fall-back day a window spanning 01:00-02:00 therefore offers that hour
 *   twice, once in daylight time and once in standard time.
 * - A wall-clock time that a DST change skips or repeats resolves the way
 *   `TZDate` does: a skipped 02:30 becomes 03:30, a repeated 01:30 takes the
 *   first (daylight-time) reading.
 *
 * Plain functions of their inputs: no store, no clock, no randomness. Callers
 * pass "now" in.
 */

/** A calendar date, "YYYY-MM-DD". */
export type CalendarDay = string;

/** A half-open span of instants, `[start, end)`, in epoch milliseconds. */
export interface Interval {
  start: number;
  end: number;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(\d{2}):(\d{2})$/;

const toIso = (ms: number) => new Date(ms).toISOString();

interface DayParts {
  year: number;
  /** 1-12. */
  month: number;
  day: number;
}

/**
 * `day` split into numbers, or null unless it is a real "YYYY-MM-DD" date.
 * Round-trips through a date so that an overflow such as 2026-02-30 is
 * rejected rather than quietly read as 2 March.
 */
function parseDay(day: string): DayParts | null {
  const match = DAY_PATTERN.exec(day);
  if (!match) return null;
  const [year, month, date] = [match[1], match[2], match[3]].map(Number) as [
    number,
    number,
    number,
  ];
  const probe = new TZDate(year, month - 1, date, "UTC");
  return probe.getFullYear() === year &&
    probe.getMonth() === month - 1 &&
    probe.getDate() === date
    ? { year, month, day: date }
    : null;
}

export function isCalendarDay(day: string): boolean {
  return parseDay(day) !== null;
}

function mustParseDay(day: CalendarDay): DayParts {
  const parts = parseDay(day);
  if (!parts) throw new RangeError(`Not a calendar day: ${day}`);
  return parts;
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

function formatDay(date: Date): CalendarDay {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The calendar date that the instant `ms` falls on in `timeZone`. */
export function zonedDay(ms: number, timeZone: string): CalendarDay {
  return formatDay(new TZDate(ms, timeZone));
}

/** `day` moved by `days` calendar days. Zone-free date arithmetic. */
export function addDays(day: CalendarDay, days: number): CalendarDay {
  const { year, month, day: date } = mustParseDay(day);
  return formatDay(new TZDate(year, month - 1, date + days, "UTC"));
}

/** 0 = Sunday. The weekday of a calendar date does not depend on a zone. */
export function weekdayOf(day: CalendarDay): AvailabilityRule["weekday"] {
  const { year, month, day: date } = mustParseDay(day);
  return new TZDate(
    year,
    month - 1,
    date,
    "UTC",
  ).getDay() as AvailabilityRule["weekday"];
}

/** The instant at wall-clock `time` ("HH:mm") on `day` in `timeZone`. */
export function zonedTime(
  day: CalendarDay,
  time: string,
  timeZone: string,
): number {
  const { year, month, day: date } = mustParseDay(day);
  const match = TIME_PATTERN.exec(time);
  if (!match) throw new RangeError(`Not a wall-clock time: ${time}`);
  // Built from components: `new TZDate("YYYY-MM-DD", zone)` would parse the
  // string as UTC midnight, not as midnight in the zone.
  return new TZDate(
    year,
    month - 1,
    date,
    Number(match[1]),
    Number(match[2]),
    timeZone,
  ).getTime();
}

/** From `day`'s midnight in `timeZone` to the next day's midnight. */
export function dayInterval(day: CalendarDay, timeZone: string): Interval {
  return {
    start: zonedTime(day, "00:00", timeZone),
    end: zonedTime(addDays(day, 1), "00:00", timeZone),
  };
}

/** Every slot the calendar's hours allow on `day`, ignoring bookings. */
export function slotGrid(calendar: Calendar, day: CalendarDay): Interval[] {
  const weekday = weekdayOf(day);
  const rule = calendar.availability.find((r) => r.weekday === weekday);
  if (!rule?.enabled) return [];

  const duration = calendar.slotDurationMin * MINUTE;
  const step = calendar.slotIntervalMin * MINUTE;
  // A non-positive length or step would never leave the window.
  if (duration <= 0 || step <= 0) return [];

  const grid: Interval[] = [];
  for (const hours of rule.windows) {
    const opens = zonedTime(day, hours.start, calendar.timezone);
    const closes = zonedTime(day, hours.end, calendar.timezone);
    for (let start = opens; start + duration <= closes; start += step) {
      grid.push({ start, end: start + duration });
    }
  }
  return grid.sort((a, b) => a.start - b.start);
}

/**
 * Whether `slot` collides with any booking, with buffers applied both ways
 * (P7-H2): `slot` may not sit inside a booking's before- or after-buffer, and
 * no booking may sit inside `slot`'s. Buffers may overlap each other. The net
 * rule is a gap of at least max(bufferBeforeMin, bufferAfterMin) between
 * neighbours; touching at exactly that gap is allowed. The answer does not
 * depend on which of two times was booked first.
 */
export function isBlocked(
  slot: Interval,
  booked: readonly Interval[],
  calendar: Pick<Calendar, "bufferBeforeMin" | "bufferAfterMin">,
): boolean {
  const before = calendar.bufferBeforeMin * MINUTE;
  const after = calendar.bufferAfterMin * MINUTE;
  // `a` overlaps `b`'s span widened by the buffers (half-open, so touching
  // the widened edge is not a collision).
  const intrudes = (a: Interval, b: Interval) =>
    a.start < b.end + after && a.end > b.start - before;
  return booked.some((b) => intrudes(slot, b) || intrudes(b, slot));
}

/** Whether `day` already holds `maxBookingsPerDay` of `booked`. */
function isDayFull(
  calendar: Calendar,
  day: CalendarDay,
  booked: readonly Interval[],
): boolean {
  if (!calendar.maxBookingsPerDay) return false;
  const bounds = dayInterval(day, calendar.timezone);
  const onDay = booked.filter(
    (b) => b.start < bounds.end && b.end > bounds.start,
  );
  return onDay.length >= calendar.maxBookingsPerDay;
}

/**
 * The grid for `day` minus every slot that collides with `booked`, buffers
 * applied both ways (see `isBlocked`). Empty once the day holds
 * `maxBookingsPerDay` bookings. `booked` is every live booking of this
 * calendar; the caller decides what counts as live.
 */
export function openSlots(
  calendar: Calendar,
  day: CalendarDay,
  booked: readonly Interval[],
): Interval[] {
  if (isDayFull(calendar, day, booked)) return [];
  return slotGrid(calendar, day).filter(
    (slot) => !isBlocked(slot, booked, calendar),
  );
}

/**
 * Whether `slot` can join `booked` under the rules `openSlots` applies: clear
 * of every booking with buffers applied both ways (see `isBlocked`), on a day
 * (in the calendar's zone) below `maxBookingsPerDay`. Hours, notice and the
 * booking range are not checked: this is for a booking that already has its
 * time, such as a cancelled one being put back, which must not land on a time
 * taken meanwhile.
 */
export function hasRoomFor(
  calendar: Calendar,
  slot: Interval,
  booked: readonly Interval[],
): boolean {
  return (
    !isDayFull(calendar, zonedDay(slot.start, calendar.timezone), booked) &&
    !isBlocked(slot, booked, calendar)
  );
}

/** The span an appointment occupies. */
export function intervalOf(
  appointment: Pick<Appointment, "startAt" | "endAt">,
): Interval {
  return {
    start: Date.parse(appointment.startAt),
    end: Date.parse(appointment.endAt),
  };
}

/** The spans of a calendar's live bookings: every status but "cancelled". */
export function liveBookings(
  calendarId: Calendar["id"],
  appointments: Iterable<Appointment>,
): Interval[] {
  const booked: Interval[] = [];
  for (const a of appointments) {
    if (a.calendarId === calendarId && a.status !== "cancelled") {
      booked.push(intervalOf(a));
    }
  }
  return booked;
}

/**
 * The start times `calendar` offers on `day`, as ISO strings: its hours, minus
 * slots that collide with live bookings (buffers applied both ways, see
 * `isBlocked`), minus the minimum scheduling notice, and nothing past
 * `dateRangeDays` calendar days after today (both read in the calendar's zone;
 * the last day is included). `day` must be a valid "YYYY-MM-DD"; check it with
 * `isCalendarDay` first.
 */
export function freeSlots(input: {
  calendar: Calendar;
  day: CalendarDay;
  appointments: Iterable<Appointment>;
  nowMs: number;
}): string[] {
  const { calendar, day, nowMs } = input;

  const lastDay = addDays(
    zonedDay(nowMs, calendar.timezone),
    calendar.dateRangeDays,
  );
  if (day > lastDay) return [];

  const booked = liveBookings(calendar.id, input.appointments);
  const notBefore = nowMs + calendar.minSchedulingNoticeHours * HOUR;
  return openSlots(calendar, day, booked)
    .filter((slot) => slot.start >= notBefore)
    .map((slot) => toIso(slot.start));
}
