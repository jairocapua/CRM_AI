/**
 * Calendar days and instants: the one rule for "is this a real YYYY-MM-DD
 * day?" and the one rule for "does this string name one instant?".
 *
 * Days are shared by the calendars page (`calendar-nav.ts`), the booking form
 * (`validation/appointment.ts`), the deal form's Expected close
 * (`validation/opportunity.ts`), the booking engine (`mock/slots.ts`) and the
 * calendars API (`api/calendars.ts`), so a day one of them accepts the others
 * accept too. Instants are shared by book() (`api/calendars.ts`) and the deal
 * API's expected close (`api/opportunities.ts`). Plain functions with no
 * imports: no store, no clock, no zone, which also keeps it outside the mock
 * seam so components may use it.
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
 * An ISO date-time that names one instant on its own: "YYYY-MM-DD", a 24-hour
 * time (seconds and up to three fraction digits optional), and `Z` or a
 * `±HH:mm` offset. Year, month and day are captured so the date can be
 * checked; whether it is real is `isRealDate`'s to say.
 */
const INSTANT_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

/**
 * Whether year/month/day (month 1-based) is a real date, in any year
 * 0000-9999. The probe is `setUTCFullYear`, which takes years 0000-0099
 * literally (unlike `Date.UTC`), and an overflow (2026-02-30 would become
 * 2 March) shows up as a changed field. UTC fields keep the answer
 * independent of the runtime's zone.
 */
function isRealDate(year: number, month: number, day: number): boolean {
  const probe = new Date(0);
  probe.setUTCFullYear(year, month - 1, day);
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

/**
 * `value` split into numbers, or null unless it is a real "YYYY-MM-DD" day in
 * years 0100-9999.
 *
 * The 0100 minimum exists because `Date.UTC` and `new Date(y, m, d)` both
 * read years 0-99 as 1900-1999, so a day before 0100 would turn into a
 * different day in every caller that builds a date from the parts (the deal
 * form's `dateInputToIso`, the calendars page, the slot engine's `TZDate`s).
 */
function toParts(value: string): DayParts | null {
  const match = DAY_PATTERN.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return year >= 100 && isRealDate(year, month, day)
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

/**
 * `value` as epoch milliseconds, or null unless it names one instant:
 * `YYYY-MM-DDTHH:mm[:ss[.fff]]` ending in `Z` or `±HH:mm`, on a real date,
 * that falls inside UTC years 0000-9999.
 *
 * - Without a zone `Date.parse` reads a date-time in the runtime's own zone,
 *   so the same string would be a different instant on every machine; a
 *   date with no time is refused for the same reason.
 * - `Date.parse` reads 2026-02-30 as 2 March, so the date is checked first.
 * - The date part may be in any year 0000-9999, not only the 0100 minimum
 *   `isCalendarDay` keeps: local midnight of 0100-01-01 east of UTC is an
 *   instant in UTC year 0099, and the deal form sends exactly that.
 * - The UTC-year bound keeps every accepted instant one whose `toISOString()`
 *   is again "YYYY-…" (not "+010000-…"), so a stored value always reads back
 *   here, through `parseISO` and into a date input.
 */
export function parseInstant(value: string): number | null {
  const match = INSTANT_PATTERN.exec(value);
  if (!match) return null;
  if (!isRealDate(Number(match[1]), Number(match[2]), Number(match[3]))) {
    return null;
  }
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  const year = new Date(ms).getUTCFullYear();
  return year >= 0 && year <= 9999 ? ms : null;
}
