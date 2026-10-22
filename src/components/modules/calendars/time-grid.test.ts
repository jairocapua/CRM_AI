import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_SCROLL_MIN,
  HOUR_HEIGHT_PX,
  MIN_BLOCK_MINUTES,
  MIN_BLOCK_PX,
  SCROLL_LEAD_MIN,
  daySegments,
  hourLabel,
  layoutDay,
  minutesIntoDay,
  minutesToPx,
  nowLineMinutes,
  scrollTargetMinutes,
  viewDays,
} from "./time-grid";

/**
 * The week and day views' pure parts: which days a view shows, where an
 * appointment sits in a day (wall-clock minutes in the viewer's zone, cut at
 * local midnight), the now line and where the grid scrolls on open. The setup
 * file runs every test in UTC; the zone-dependent cases set one with
 * `vi.stubEnv("TZ", ...)` and first prove it took.
 */

function inZone(zone: string, probe: string, offset: number) {
  vi.stubEnv("TZ", zone);
  // A TZ override that silently failed would run every case in UTC.
  expect(new Date(probe).getTimezoneOffset()).toBe(offset);
}

/** REF_DATE, the seed's anchor: 17:00 in Singapore, 02:00 in Los Angeles. */
const ANCHOR = "2026-09-08T09:00:00.000Z";

const row = (id: string, startAt: string, endAt: string) => ({
  id,
  startAt,
  endAt,
});

describe("viewDays", () => {
  it("a week is Sunday to Saturday around the date", () => {
    expect(viewDays("week", "2026-09-08")).toEqual([
      "2026-09-06",
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
    ]);
  });

  it("a day is just that day", () => {
    expect(viewDays("day", "2026-09-15")).toEqual(["2026-09-15"]);
  });

  it.each([
    ["DST ends (1 Nov)", "2026-11-04", "2026-11-01", "2026-11-07"],
    ["DST starts (8 Mar)", "2026-03-10", "2026-03-08", "2026-03-14"],
  ])(
    "seven distinct days across a DST change in Los Angeles: %s",
    (_, date, first, last) => {
      inZone("America/Los_Angeles", ANCHOR, 420);
      const days = viewDays("week", date);
      expect(days).toHaveLength(7);
      expect(new Set(days).size).toBe(7);
      expect(days.at(0)).toBe(first);
      expect(days.at(-1)).toBe(last);
    },
  );
});

describe("minutesIntoDay", () => {
  it("reads the viewer's wall clock, not UTC", () => {
    inZone("Asia/Singapore", ANCHOR, -480);
    expect(minutesIntoDay(new Date(ANCHOR))).toBe(17 * 60);
    expect(minutesIntoDay(new Date("2026-09-08T17:00:00.000Z"))).toBe(60);

    inZone("Asia/Kolkata", ANCHOR, -330);
    expect(minutesIntoDay(new Date("2026-09-07T18:15:00.000Z"))).toBe(
      23 * 60 + 45,
    );

    inZone("America/Los_Angeles", ANCHOR, 420);
    expect(minutesIntoDay(new Date(ANCHOR))).toBe(2 * 60);
  });
});

describe("daySegments", () => {
  // The seed's Onboarding Kickoff on 7 September: 23:45 to 00:30 in Kolkata.
  const CROSSING = row(
    "crossing",
    "2026-09-07T18:15:00.000Z",
    "2026-09-07T19:00:00.000Z",
  );

  it("cuts an appointment that crosses local midnight into both days", () => {
    inZone("Asia/Kolkata", ANCHOR, -330);
    expect(daySegments([CROSSING], "2026-09-07")).toEqual([
      {
        row: CROSSING,
        start: 23 * 60 + 45,
        end: 24 * 60,
        clippedStart: false,
        clippedEnd: true,
      },
    ]);
    expect(daySegments([CROSSING], "2026-09-08")).toEqual([
      {
        row: CROSSING,
        start: 0,
        end: 30,
        clippedStart: true,
        clippedEnd: false,
      },
    ]);
    expect(daySegments([CROSSING], "2026-09-06")).toEqual([]);
    expect(daySegments([CROSSING], "2026-09-09")).toEqual([]);
  });

  it("does not cut it where the viewer's day does not end inside it", () => {
    // 00:15 to 01:00 on 8 September in Singapore: one whole segment.
    inZone("Asia/Singapore", ANCHOR, -480);
    expect(daySegments([CROSSING], "2026-09-08")).toEqual([
      {
        row: CROSSING,
        start: 2 * 60 + 15,
        end: 3 * 60,
        clippedStart: false,
        clippedEnd: false,
      },
    ]);
    expect(daySegments([CROSSING], "2026-09-07")).toEqual([]);
  });

  it("places an evening-UTC appointment on the next local day in Singapore", () => {
    inZone("Asia/Singapore", ANCHOR, -480);
    const late = row(
      "late",
      "2026-09-08T17:00:00.000Z",
      "2026-09-08T17:30:00.000Z",
    );
    expect(daySegments([late], "2026-09-08")).toEqual([]);
    expect(daySegments([late], "2026-09-09")).toEqual([
      { row: late, start: 60, end: 90, clippedStart: false, clippedEnd: false },
    ]);
  });

  it("keeps an appointment that ends exactly at local midnight on its own day", () => {
    inZone("Asia/Singapore", ANCHOR, -480);
    // 23:00 to 00:00.
    const toMidnight = row(
      "to-midnight",
      "2026-09-08T15:00:00.000Z",
      "2026-09-08T16:00:00.000Z",
    );
    expect(daySegments([toMidnight], "2026-09-08")).toEqual([
      {
        row: toMidnight,
        start: 23 * 60,
        end: 24 * 60,
        clippedStart: false,
        clippedEnd: false,
      },
    ]);
    expect(daySegments([toMidnight], "2026-09-09")).toEqual([]);
  });

  it("keeps the input order of the rows on that day", () => {
    const a = row("a", "2026-09-08T10:00:00.000Z", "2026-09-08T11:00:00.000Z");
    const b = row("b", "2026-09-08T09:00:00.000Z", "2026-09-08T09:30:00.000Z");
    const other = row(
      "other",
      "2026-09-09T09:00:00.000Z",
      "2026-09-09T09:30:00.000Z",
    );
    expect(
      daySegments([a, other, b], "2026-09-08").map((s) => s.row.id),
    ).toEqual(["a", "b"]);
  });
});

describe("layoutDay", () => {
  it("lays the seed's Singapore 15 September side by side, then full width", () => {
    inZone("Asia/Singapore", ANCHOR, -480);
    // Strategy Session 00:00–01:00, Onboarding Kickoff 00:00–00:45, Discovery
    // Call 01:00–01:30: an overlap, then a touch.
    const strategy = row(
      "strategy",
      "2026-09-14T16:00:00.000Z",
      "2026-09-14T17:00:00.000Z",
    );
    const onboarding = row(
      "onboarding",
      "2026-09-14T16:00:00.000Z",
      "2026-09-14T16:45:00.000Z",
    );
    const discovery = row(
      "discovery",
      "2026-09-14T17:00:00.000Z",
      "2026-09-14T17:30:00.000Z",
    );
    expect(
      layoutDay([onboarding, strategy, discovery], "2026-09-15").map(
        ({ row: { id }, start, end, column, columns }) => ({
          id,
          start,
          end,
          column,
          columns,
        }),
      ),
    ).toEqual([
      { id: "onboarding", start: 0, end: 45, column: 1, columns: 2 },
      { id: "strategy", start: 0, end: 60, column: 0, columns: 2 },
      { id: "discovery", start: 60, end: 90, column: 0, columns: 1 },
    ]);
  });

  it("is empty for a day with nothing on it", () => {
    expect(layoutDay([], "2026-09-15")).toEqual([]);
  });

  /** Where a block is drawn: from its start, at least the minimum height. */
  const drawnSpan = ({ start, end }: { start: number; end: number }) => ({
    top: start,
    bottom: Math.max(end, start + MIN_BLOCK_MINUTES),
  });

  it("two back-to-back 15-minute appointments sit side by side, not overlapping", () => {
    // 10:00–10:15 and 10:15–10:30: each is drawn 25 minutes tall, so the
    // first block's box would cover the top of the second.
    const a = row("a", "2026-09-08T10:00:00.000Z", "2026-09-08T10:15:00.000Z");
    const b = row("b", "2026-09-08T10:15:00.000Z", "2026-09-08T10:30:00.000Z");
    const laidOut = layoutDay([a, b], "2026-09-08");

    // The real times are kept for drawing; only the packing is padded.
    expect(
      laidOut.map(({ row: { id }, start, end, column, columns }) => ({
        id,
        start,
        end,
        column,
        columns,
      })),
    ).toEqual([
      { id: "a", start: 600, end: 615, column: 0, columns: 2 },
      { id: "b", start: 615, end: 630, column: 1, columns: 2 },
    ]);

    // The drawn boxes overlap in time, so they must not share a column.
    const [first, second] = laidOut.map(drawnSpan);
    expect(first!.bottom).toBeGreaterThan(second!.top);
    expect(laidOut[0]!.column).not.toBe(laidOut[1]!.column);
  });

  it("short appointments at least the minimum block apart keep the full width", () => {
    // 10:00–10:15 is drawn to 10:25, exactly where the next one starts.
    const a = row("a", "2026-09-08T10:00:00.000Z", "2026-09-08T10:15:00.000Z");
    const b = row("b", "2026-09-08T10:25:00.000Z", "2026-09-08T10:40:00.000Z");
    const laidOut = layoutDay([a, b], "2026-09-08");

    expect(
      laidOut.map(({ row: { id }, column, columns }) => ({
        id,
        column,
        columns,
      })),
    ).toEqual([
      { id: "a", column: 0, columns: 1 },
      { id: "b", column: 0, columns: 1 },
    ]);
    const [first, second] = laidOut.map(drawnSpan);
    expect(first!.bottom).toBe(second!.top);
  });
});

describe("MIN_BLOCK_MINUTES", () => {
  it("is the minimum block height in minutes: 20px at 48px an hour is 25", () => {
    expect(MIN_BLOCK_PX).toBe(20);
    expect(HOUR_HEIGHT_PX).toBe(48);
    expect(MIN_BLOCK_MINUTES).toBe(25);
    expect(minutesToPx(MIN_BLOCK_MINUTES)).toBe(MIN_BLOCK_PX);
  });
});

describe("nowLineMinutes", () => {
  it("is the wall-clock minute on today's column, in the viewer's zone", () => {
    inZone("Asia/Singapore", ANCHOR, -480);
    expect(nowLineMinutes(new Date(ANCHOR), "2026-09-08")).toBe(17 * 60);

    inZone("America/Los_Angeles", ANCHOR, 420);
    expect(nowLineMinutes(new Date(ANCHOR), "2026-09-08")).toBe(2 * 60);
  });

  it("is null on any other day", () => {
    inZone("Asia/Singapore", ANCHOR, -480);
    expect(nowLineMinutes(new Date(ANCHOR), "2026-09-07")).toBeNull();
    expect(nowLineMinutes(new Date(ANCHOR), "2026-09-09")).toBeNull();
    // 02:00 on 8 September in Los Angeles is not 7 September there.
    inZone("America/Los_Angeles", ANCHOR, 420);
    expect(nowLineMinutes(new Date(ANCHOR), "2026-09-07")).toBeNull();
  });
});

describe("scrollTargetMinutes", () => {
  it("leads the earliest time of day across the days in view", () => {
    // Monday 06:00 and Tuesday 04:00: the earliest *time of day* wins.
    expect(scrollTargetMinutes([6 * 60, 4 * 60], null)).toBe(
      4 * 60 - SCROLL_LEAD_MIN,
    );
    expect(SCROLL_LEAD_MIN).toBe(30);
  });

  it("never scrolls above midnight", () => {
    expect(scrollTargetMinutes([10], null)).toBe(0);
    expect(scrollTargetMinutes([0], 600)).toBe(0);
  });

  it("prefers appointments over the now line", () => {
    expect(scrollTargetMinutes([10 * 60], 5 * 60)).toBe(9 * 60 + 30);
  });

  it("falls back to the now line when nothing is in view and today is", () => {
    expect(scrollTargetMinutes([], 17 * 60)).toBe(16 * 60 + 30);
  });

  it("falls back to the start of a working day otherwise", () => {
    expect(DEFAULT_SCROLL_MIN).toBe(8 * 60);
    expect(scrollTargetMinutes([], null)).toBe(DEFAULT_SCROLL_MIN);
  });
});

describe("hourLabel", () => {
  it.each([
    [0, "12 AM"],
    [1, "1 AM"],
    [11, "11 AM"],
    [12, "12 PM"],
    [13, "1 PM"],
    [23, "11 PM"],
  ])("%i -> %s", (hour, label) => {
    expect(hourLabel(hour)).toBe(label);
  });
});

describe("minutesToPx", () => {
  it("is one hour height per hour, so a day is 24 of them", () => {
    expect(minutesToPx(60)).toBe(HOUR_HEIGHT_PX);
    expect(minutesToPx(30)).toBe(HOUR_HEIGHT_PX / 2);
    expect(minutesToPx(24 * 60)).toBe(24 * HOUR_HEIGHT_PX);
  });
});
