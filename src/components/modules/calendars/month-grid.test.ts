import { describe, expect, it, vi } from "vitest";

import {
  MAX_CHIPS_PER_DAY,
  groupByLocalDay,
  isInMonth,
  monthWeeks,
  splitOverflow,
} from "./month-grid";

/**
 * The month view's pure parts: the weeks-by-days shape, which local day an
 * appointment lands on, and the "+N more" maths. The setup file runs every
 * test in UTC; the zone-dependent cases set one with `vi.stubEnv("TZ", ...)`
 * and first prove it took.
 */

function inZone(zone: string, probe: string, offset: number) {
  vi.stubEnv("TZ", zone);
  // A TZ override that silently failed would run every case in UTC.
  expect(new Date(probe).getTimezoneOffset()).toBe(offset);
}

/** Whole days between two "YYYY-MM-DD" days, computed in UTC. */
function daysBetween(a: string, b: string): number {
  return (
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000
  );
}

/**
 * Whole Sunday-first weeks of consecutive, unique days from `first` to
 * `last`.
 */
function expectWeeks(weeks: string[][], first: string, last: string) {
  const days = weeks.flat();
  expect(days.at(0)).toBe(first);
  expect(days.at(-1)).toBe(last);
  for (const week of weeks) {
    expect(week).toHaveLength(7);
    expect(new Date(`${week.at(0)}T00:00:00Z`).getUTCDay()).toBe(0);
  }
  expect(new Set(days).size).toBe(days.length);
  expect(days.length).toBe(daysBetween(first, last) + 1);
  expect(
    days.slice(1).map((day, i) => daysBetween(days[i] ?? "", day)),
  ).toEqual(days.slice(1).map(() => 1));
}

describe("monthWeeks", () => {
  it("September 2026 is five weeks, 30 August to 3 October", () => {
    const weeks = monthWeeks("2026-09-08");
    expect(weeks).toHaveLength(5);
    expectWeeks(weeks, "2026-08-30", "2026-10-03");
    // September starts on the first week's Tuesday.
    expect(weeks.at(0)?.at(2)).toBe("2026-09-01");
  });

  it("August 2026 is six weeks, 26 July to 5 September", () => {
    const weeks = monthWeeks("2026-08-31");
    expect(weeks).toHaveLength(6);
    expectWeeks(weeks, "2026-07-26", "2026-09-05");
  });

  it("February 2026 is exactly four weeks, 1 to 28 February", () => {
    const weeks = monthWeeks("2026-02-15");
    expect(weeks).toHaveLength(4);
    expectWeeks(weeks, "2026-02-01", "2026-02-28");
  });

  it("any day of the month gives the same grid", () => {
    expect(monthWeeks("2026-09-01")).toEqual(monthWeeks("2026-09-30"));
  });

  it.each([
    [
      "November 2026 (DST ends 1 Nov)",
      "2026-11-15",
      "2026-11-01",
      "2026-12-05",
    ],
    ["March 2026 (DST starts 8 Mar)", "2026-03-15", "2026-03-01", "2026-04-04"],
  ])(
    "%s: whole days across the DST change in Los Angeles",
    (_, date, first, last) => {
      inZone("America/Los_Angeles", "2026-09-08T09:00:00.000Z", 420);
      const weeks = monthWeeks(date);
      expect(weeks).toHaveLength(5);
      expect(weeks.flat()).toHaveLength(35);
      expectWeeks(weeks, first, last);
    },
  );
});

describe("isInMonth", () => {
  it("tells the month's days from the grid's leading and trailing days", () => {
    expect(isInMonth("2026-09-01", "2026-09-08")).toBe(true);
    expect(isInMonth("2026-09-30", "2026-09-08")).toBe(true);
    expect(isInMonth("2026-08-31", "2026-09-08")).toBe(false);
    expect(isInMonth("2026-10-01", "2026-09-08")).toBe(false);
    // Same month number, another year.
    expect(isInMonth("2027-09-08", "2026-09-08")).toBe(false);
  });
});

describe("groupByLocalDay", () => {
  // The first appointment in the dashboard's Upcoming card: 01:00 on 9
  // September in Singapore, 10:00 on 8 September in Los Angeles.
  const LATE = { id: "late", startAt: "2026-09-08T17:00:00.000Z" };
  const EARLY = { id: "early", startAt: "2026-09-08T02:00:00.000Z" };
  const NEXT = { id: "next", startAt: "2026-09-09T03:00:00.000Z" };

  it("files an appointment under the viewer's local day in Singapore", () => {
    inZone("Asia/Singapore", LATE.startAt, -480);
    const byDay = groupByLocalDay([EARLY, LATE, NEXT]);
    expect(byDay.get("2026-09-08")).toEqual([EARLY]);
    // Input order is kept within a day.
    expect(byDay.get("2026-09-09")).toEqual([LATE, NEXT]);
    expect([...byDay.keys()]).toEqual(["2026-09-08", "2026-09-09"]);
  });

  it("files the same appointment a day earlier in Los Angeles", () => {
    inZone("America/Los_Angeles", LATE.startAt, 420);
    const byDay = groupByLocalDay([EARLY, LATE, NEXT]);
    expect(byDay.get("2026-09-07")).toEqual([EARLY]);
    expect(byDay.get("2026-09-08")).toEqual([LATE, NEXT]);
    expect(byDay.has("2026-09-09")).toBe(false);
  });

  it("matches UTC days only when the viewer is in UTC", () => {
    inZone("UTC", LATE.startAt, 0);
    const byDay = groupByLocalDay([EARLY, LATE, NEXT]);
    expect(byDay.get("2026-09-08")).toEqual([EARLY, LATE]);
    expect(byDay.get("2026-09-09")).toEqual([NEXT]);
  });

  it("lists an appointment that crosses local midnight on its start day only", () => {
    inZone("Asia/Singapore", LATE.startAt, -480);
    // 23:30 to 00:30 in Singapore.
    const crossing = {
      id: "crossing",
      startAt: "2026-09-08T15:30:00.000Z",
      endAt: "2026-09-08T16:30:00.000Z",
    };
    const byDay = groupByLocalDay([crossing]);
    expect(byDay.get("2026-09-08")).toEqual([crossing]);
    expect(byDay.has("2026-09-09")).toBe(false);
  });

  it("is empty for no rows", () => {
    expect(groupByLocalDay([]).size).toBe(0);
  });
});

describe("splitOverflow", () => {
  const items = (n: number) => Array.from({ length: n }, (_, i) => i);

  it("shows three chips per day by default", () => {
    expect(MAX_CHIPS_PER_DAY).toBe(3);
  });

  it.each([
    [0, 0, 0],
    [1, 1, 0],
    [3, 3, 0],
    // One over: two chips and "+2 more", so a crowded cell stays three
    // lines tall.
    [4, 2, 2],
    [8, 2, 6],
  ])("%i items -> %i visible, %i more", (n, visible, more) => {
    const split = splitOverflow(items(n));
    expect(split.visible).toEqual(items(visible));
    expect(split.more).toBe(more);
    expect(split.visible.length + split.more).toBe(n);
  });

  it("takes another limit", () => {
    expect(splitOverflow(items(5), 5)).toEqual({ visible: items(5), more: 0 });
    expect(splitOverflow(items(6), 5)).toEqual({ visible: items(4), more: 2 });
  });
});
