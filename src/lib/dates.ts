/**
 * Calendar days: the one rule for "is this a real YYYY-MM-DD day?".
 *
 * Shared by the calendars page (`calendar-nav.ts`), the booking form
 * (`validation/appointment.ts`), the deal form's Expected close
 * (`validation/opportunity.ts`), the booking engine (`mock/slots.ts`) and the
 * API (`api/calendars.ts`), so a day one of them accepts the others accept
 * too. Plain functions with no imports: no store, no clock, no zone, which
 * also keeps it outside the mock seam so components may use it.
 */

/**
 * A calendar date, "YYYY-MM-DD", with no time and no zone. Which zone it is
 * read in (the viewer's, a calendar's) is the caller's to decide.
 */
export type CalendarDay = string;

/** A calendar day split into numbers. */
export interface DayParts {
  year: number;
  /** 1-12. */
  month: number;
  day: number;
}

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * `value` split into numbers, or null unless it is a real "YYYY-MM-DD" day.
 *
 * Round-trips through `Date.UTC`, so an overflow (2026-02-30 would become
 * 2 March) is refused rather than moved, and so are years 0000-0099, which
 * `Date.UTC` and `new Date(y, m, d)` both read as 1900-1999. UTC fields keep
 * the answer independent of the runtime's zone.
 */
function toParts(value: string): DayParts | null {
  const match = DAY_PATTERN.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
    ? { year, month, day }
    : null;
}

/** Whether `value` is a real "YYYY-MM-DD" day, in years 0100-9999. */
export function isCalendarDay(value: string): value is CalendarDay {
  return toParts(value) !== null;
}

/**
 * `day` split into numbers, with a 1-based month. Throws a `RangeError` unless
 * it is a real day; check untrusted input with `isCalendarDay` first.
 */
export function parseCalendarDay(day: CalendarDay): DayParts {
  const parts = toParts(day);
  if (!parts) throw new RangeError(`Not a calendar day: ${day}`);
  return parts;
}
