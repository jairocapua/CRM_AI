import { faker } from "@faker-js/faker";

/**
 * The world is anchored to a fixed instant, not to `Date.now()`.
 *
 * `faker.seed()` alone is not enough: `date.recent()` / `.soon()` / `.past()`
 * are all relative to the current time, so a workspace seeded today would drift
 * every day — "3 days in stage" quietly becomes "94 days in stage" next
 * quarter, and appointments stop straddling "today". Pinning the reference date
 * as well makes every run reproducible.
 */
export const REF_DATE = new Date("2026-09-08T09:00:00.000Z");

export function resetRng() {
  faker.seed(20260908);
  faker.setDefaultRefDate(REF_DATE);
}

export { faker };

/** Days offset from REF_DATE, as an ISO string. */
export function refPlusDays(days: number, hour = 9, minute = 0): string {
  const d = new Date(REF_DATE);
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hour, minute, 0, 0);
  return d.toISOString();
}

/**
 * `refPlusDays` for something that has already happened.
 *
 * REF_DATE is 09:00 UTC, so "0 days ago at 16:00" is seven hours in the
 * future — past the demo clock's "now", where it sorts above everything that
 * happens in the session. Offsets are capped at 0 and a day-0 time after the
 * anchor rolls back a day. Makes no draws, so callers keep their stream.
 */
export function refPast(days: number, hour = 9, minute = 0): string {
  const offset = Math.min(days, 0);
  const iso = refPlusDays(offset, hour, minute);
  return iso > REF_DATE.toISOString()
    ? refPlusDays(offset - 1, hour, minute)
    : iso;
}

export function refPlusMinutes(minutes: number): string {
  return new Date(REF_DATE.getTime() + minutes * 60_000).toISOString();
}

/** Inclusive integer in [min, max]. */
export function int(min: number, max: number): number {
  return faker.number.int({ min, max });
}

export function pick<T>(items: readonly T[]): T {
  return items[faker.number.int({ min: 0, max: items.length - 1 })]!;
}

export function pickSome<T>(
  items: readonly T[],
  min: number,
  max: number,
): T[] {
  const count = Math.min(int(min, max), items.length);
  return faker.helpers.arrayElements([...items], count);
}

export function chance(probability: number): boolean {
  return faker.number.float({ min: 0, max: 1 }) < probability;
}
