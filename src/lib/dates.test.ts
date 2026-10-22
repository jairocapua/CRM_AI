import { describe, expect, it, vi } from "vitest";

import { isCalendarDay, parseCalendarDay } from "@/lib/dates";

/**
 * The one rule for "is this a real YYYY-MM-DD day?", shared by the calendars
 * page, the booking form, the booking engine and the API. A calendar day has
 * no time and no zone, so the answer must not depend on the runtime's zone:
 * the setup file runs in UTC, and the zone cases set their own with
 * `vi.stubEnv("TZ", ...)` and first prove it took.
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
