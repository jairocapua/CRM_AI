import { describe, expect, it, vi } from "vitest";

import { isCalendarDay, parseCalendarDay, parseInstant } from "@/lib/dates";

/**
 * The one rule for "is this a real YYYY-MM-DD day?", shared by the calendars
 * page, the booking form, the booking engine and the API, and the one rule
 * for "does this string name one instant?", shared by book() and the deal
 * API. Neither answer may depend on the runtime's zone: the setup file runs
 * in UTC, and the zone cases set their own with `vi.stubEnv("TZ", ...)` and
 * first prove it took.
 */

function inZone(zone: string, offset: number) {
  vi.stubEnv("TZ", zone);
  // A TZ override that silently failed would run every case in UTC.
  expect(new Date("2026-09-08T00:00:00Z").getTimezoneOffset()).toBe(offset);
}

describe("isCalendarDay", () => {
  it.each([
    "2026-09-08",
    "2028-02-29",
    "2026-12-31",
    "2000-02-29",
    "0100-01-01",
    "9999-12-31",
  ])("accepts real YYYY-MM-DD days, leap days included: %s", (day) => {
    expect(isCalendarDay(day)).toBe(true);
  });

  it.each([
    "",
    "banana",
    "2026-02-29",
    "2026-02-30",
    "2026-04-31",
    "2026-09-31",
    "2026-13-01",
    "2026-00-10",
    "2026-09-00",
    "2026-9-8",
    "26-09-08",
    "2026-09-08T00:00",
    "2026-09-08T00:00:00.000Z",
    "2026-09-08 ",
    " 2026-09-08",
    "+02026-09-08",
    // 1900 is not a leap year (divisible by 100, not by 400).
    "1900-02-29",
  ])("rejects overflowing and malformed days: %j", (day) => {
    expect(isCalendarDay(day)).toBe(false);
  });

  it.each(["0099-01-01", "0000-01-01"])(
    "refuses years 0000-0099, which Date reads as 1900-1999: %s",
    (day) => {
      expect(isCalendarDay(day)).toBe(false);
    },
  );
});

describe("parseCalendarDay", () => {
  it("splits a day into a 1-based month", () => {
    expect(parseCalendarDay("2026-09-08")).toEqual({
      year: 2026,
      month: 9,
      day: 8,
    });
    expect(parseCalendarDay("2028-02-29")).toEqual({
      year: 2028,
      month: 2,
      day: 29,
    });
  });

  it("throws a RangeError naming the day", () => {
    expect(() => parseCalendarDay("2026-02-30")).toThrow(RangeError);
    expect(() => parseCalendarDay("2026-02-30")).toThrow(
      /Not a calendar day: 2026-02-30/,
    );
  });

  it.each<[string, number]>([
    ["UTC", 0],
    ["Asia/Singapore", -480],
    ["America/Los_Angeles", 420],
  ])("reads the same in any runtime zone: %s", (zone, offset) => {
    inZone(zone, offset);
    expect(parseCalendarDay("2026-09-08")).toEqual({
      year: 2026,
      month: 9,
      day: 8,
    });
    expect(isCalendarDay("2028-02-29")).toBe(true);
    expect(isCalendarDay("2026-02-30")).toBe(false);
    expect(isCalendarDay("0099-01-01")).toBe(false);
  });
});

/** Spellings `parseInstant` accepts, with the instant each one names. */
const SPELLINGS: { sent: string; instant: string }[] = [
  { sent: "2026-09-08T17:00:00.000Z", instant: "2026-09-08T17:00:00.000Z" },
  { sent: "2026-09-08T17:00Z", instant: "2026-09-08T17:00:00.000Z" },
  { sent: "2026-09-08T17:00:00+08:00", instant: "2026-09-08T09:00:00.000Z" },
  { sent: "2026-09-08T08:30:15.5-07:00", instant: "2026-09-08T15:30:15.500Z" },
  // What the deal form sends for 0100-01-01 in Singapore: local midnight
  // there was +6:55:25 (local mean time), so the instant is in UTC year 0099.
  { sent: "0099-12-31T17:04:35Z", instant: "0099-12-31T17:04:35.000Z" },
  { sent: "0000-01-01T00:00:00Z", instant: "0000-01-01T00:00:00.000Z" },
];

/** `parseInstant(value)` as an ISO string, so a failure prints readably. */
function instantOf(value: string): string | null {
  const ms = parseInstant(value);
  return ms === null ? null : new Date(ms).toISOString();
}

describe("parseInstant", () => {
  it.each(SPELLINGS)("reads $sent as $instant", ({ sent, instant }) => {
    expect(instantOf(sent)).toBe(instant);
  });

  it.each([
    "",
    "banana",
    "2026-09-08",
    // No zone: the instant would depend on the runtime's zone.
    "2026-09-08T17:00:00",
    "2026-09-08 17:00:00Z",
    "2026-09-08T17:00:00z",
    // `Date.parse` reads this one as 2 March.
    "2026-02-30T17:00:00Z",
    "2026-09-08T24:00:00Z",
    "2026-09-08T17:60:00Z",
    "2026-09-08T17:00:00.1234Z",
    "2026-09-08T17:00:00+24:00",
    "+010000-01-01T00:00:00.000Z",
    // Real dates whose instants fall in UTC years 10000 and -1.
    "9999-12-31T23:00:00-12:00",
    "0000-01-01T00:00:00+01:00",
  ])("refuses %j", (value) => {
    expect(parseInstant(value)).toBeNull();
  });

  it("reads the same instants with the runtime in Asia/Singapore", () => {
    inZone("Asia/Singapore", -480);
    for (const { sent, instant } of SPELLINGS) {
      expect(instantOf(sent), sent).toBe(instant);
    }
    expect(parseInstant("2026-09-08T17:00:00")).toBeNull();
  });

  it.each(SPELLINGS)(
    "accepts its own toISOString() spelling of $sent",
    ({ sent }) => {
      const ms = parseInstant(sent);
      expect(ms).not.toBeNull();
      expect(parseInstant(new Date(ms!).toISOString())).toBe(ms);
    },
  );
});
