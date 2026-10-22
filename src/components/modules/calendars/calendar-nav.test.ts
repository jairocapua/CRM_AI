import { describe, expect, it, vi } from "vitest";

import {
  CALENDAR_VIEWS,
  calendarSearch,
  historyMethod,
  isCalendarDay,
  localDay,
  parseCalendarParams,
  rangeLabel,
  shiftDate,
  toInstantRange,
  visibleDays,
  zoneLabel,
  type CalendarView,
} from "./calendar-nav";

/**
 * The calendars page keeps its view and date in the URL
 * (`/calendars?view=week&date=2026-09-08`). Everything that page derives from
 * those two values lives in `calendar-nav.ts` as pure functions, pinned here.
 *
 * The setup file runs every test in UTC; the cases that depend on the viewer's
 * zone set one with `vi.stubEnv("TZ", ...)` and first prove it took.
 */

const TODAY = "2026-09-08";

const params = (query: string) => new URLSearchParams(query);

function inZone(zone: string, probe: string, offset: number) {
  vi.stubEnv("TZ", zone);
  // A TZ override that silently failed would run every case in UTC.
  expect(new Date(probe).getTimezoneOffset()).toBe(offset);
}

describe("parseCalendarParams", () => {
  it("falls back to month view and today when nothing is given", () => {
    expect(parseCalendarParams(params(""), TODAY)).toEqual({
      view: "month",
      date: TODAY,
    });
  });

  it.each(CALENDAR_VIEWS)("keeps a valid view: %s", (view) => {
    expect(
      parseCalendarParams(params(`view=${view}&date=2026-09-15`), TODAY),
    ).toEqual({ view, date: "2026-09-15" });
  });

  it.each(["year", "WEEK", "Day", "", " month", "agenda"])(
    "falls back to month for the unknown view %j",
    (view) => {
      expect(
        parseCalendarParams(
          params(`view=${encodeURIComponent(view)}&date=2026-09-15`),
          TODAY,
        ),
      ).toEqual({ view: "month", date: "2026-09-15" });
    },
  );

  it.each([
    "",
    "banana",
    "2026-02-30",
    "2026-02-29",
    "2026-13-01",
    "2026-00-10",
    "2026-09-00",
    "2026-09-31",
    "2026-9-8",
    "26-09-08",
    "2026-09-08T00:00",
    "2026-09-08T00:00:00.000Z",
    "2026-09-08 ",
    "0099-01-01",
    "+02026-09-08",
  ])("falls back to today for the invalid date %j", (date) => {
    expect(
      parseCalendarParams(
        params(`view=week&date=${encodeURIComponent(date)}`),
        TODAY,
      ),
    ).toEqual({ view: "week", date: TODAY });
  });

  it.each(["2028-02-29", "2026-12-25", "2027-01-01", "1999-12-31"])(
    "keeps the valid date %s",
    (date) => {
      expect(parseCalendarParams(params(`date=${date}`), TODAY)).toEqual({
        view: "month",
        date,
      });
    },
  );

  it("reads the first value of a duplicated parameter", () => {
    expect(
      parseCalendarParams(
        params("view=day&view=week&date=2026-01-02&date=2026-01-03"),
        TODAY,
      ),
    ).toEqual({ view: "day", date: "2026-01-02" });
  });
});

describe("isCalendarDay", () => {
  it("accepts real YYYY-MM-DD days, leap days included", () => {
    expect(isCalendarDay("2026-09-08")).toBe(true);
    expect(isCalendarDay("2028-02-29")).toBe(true);
    expect(isCalendarDay("2026-12-31")).toBe(true);
  });

  it("rejects overflowing and malformed days", () => {
    expect(isCalendarDay("2026-02-29")).toBe(false);
    expect(isCalendarDay("2026-04-31")).toBe(false);
    expect(isCalendarDay("2026-9-8")).toBe(false);
    // `new Date(99, 0, 1)` is 1999: a two-digit year must not alias.
    expect(isCalendarDay("0099-01-01")).toBe(false);
  });
});

describe("calendarSearch", () => {
  it("writes view then date", () => {
    expect(calendarSearch({ view: "week", date: "2026-09-08" })).toBe(
      "?view=week&date=2026-09-08",
    );
  });

  it.each(CALENDAR_VIEWS)(
    "round-trips through parseCalendarParams: %s",
    (v) => {
      const position = { view: v, date: "2027-03-14" };
      expect(
        parseCalendarParams(params(calendarSearch(position)), TODAY),
      ).toEqual(position);
    },
  );
});

describe("historyMethod", () => {
  const HERE = { view: "month", date: "2026-09-08" } as const;

  it("is none when the search string would not change", () => {
    // Today while already on today: no entry, or Back would seem to do
    // nothing.
    expect(historyMethod("?view=month&date=2026-09-08", HERE, HERE)).toBe(
      "none",
    );
  });

  it.each([
    "",
    "?view=year",
    "?date=2026-02-30",
    "?date=2026-09-08",
    "?date=2026-09-08&view=month",
  ])("replaces the non-canonical URL %j for the same position", (search) => {
    // The position is unchanged, so no history entry; the URL is made
    // canonical in place.
    expect(historyMethod(search, HERE, HERE)).toBe("replace");
  });

  it.each<[string, { view: CalendarView; date: string }]>([
    ["another date", { view: "month", date: "2026-10-08" }],
    ["another view", { view: "week", date: "2026-09-08" }],
    ["both", { view: "day", date: "2026-09-15" }],
  ])("pushes a move to %s", (_, next) => {
    expect(historyMethod("?view=month&date=2026-09-08", HERE, next)).toBe(
      "push",
    );
    // From a non-canonical URL too: a real move is always an entry.
    expect(historyMethod("", HERE, next)).toBe("push");
  });

  it.each<[string, CalendarView, string, string]>([
    // Today from Sep 20 in month view: the same September grid, so Back would
    // seem to do nothing.
    ["month Sep 20 -> Sep 8", "month", "2026-09-20", "2026-09-08"],
    // Both in the week of Sep 6–12.
    ["week Sep 9 -> Sep 12", "week", "2026-09-09", "2026-09-12"],
  ])(
    "replaces a date change that keeps the view and its days: %s",
    (_, view, from, to) => {
      expect(
        historyMethod(
          calendarSearch({ view, date: from }),
          { view, date: from },
          { view, date: to },
        ),
      ).toBe("replace");
    },
  );

  it.each<[string, CalendarView, string, string]>([
    // The August and September grids share a week, but are not the same days.
    ["month Aug 31 -> Sep 1", "month", "2026-08-31", "2026-09-01"],
    ["week Sep 12 -> Sep 13", "week", "2026-09-12", "2026-09-13"],
    ["day Sep 8 -> Sep 9", "day", "2026-09-08", "2026-09-09"],
  ])("pushes a date change that shows other days: %s", (_, view, from, to) => {
    expect(
      historyMethod(
        calendarSearch({ view, date: from }),
        { view, date: from },
        { view, date: to },
      ),
    ).toBe("push");
  });

  it("pushes a view change even when the days overlap", () => {
    // Week Sep 6–12 lies inside the September grid, but the view differs.
    expect(
      historyMethod(
        "?view=month&date=2026-09-08",
        { view: "month", date: "2026-09-08" },
        { view: "week", date: "2026-09-08" },
      ),
    ).toBe("push");
  });
});

describe("shiftDate", () => {
  it.each<[CalendarView, string, -1 | 1, string]>([
    ["month", "2026-09-08", 1, "2026-10-08"],
    ["month", "2026-09-08", -1, "2026-08-08"],
    // A shorter month clamps to its last day rather than spilling over.
    ["month", "2026-01-31", 1, "2026-02-28"],
    ["month", "2026-03-31", -1, "2026-02-28"],
    ["month", "2028-01-31", 1, "2028-02-29"],
    ["month", "2026-12-15", 1, "2027-01-15"],
    ["month", "2027-01-15", -1, "2026-12-15"],
    ["week", "2026-09-08", 1, "2026-09-15"],
    ["week", "2026-09-28", 1, "2026-10-05"],
    ["week", "2026-10-05", -1, "2026-09-28"],
    ["week", "2026-12-29", 1, "2027-01-05"],
    ["day", "2026-09-08", 1, "2026-09-09"],
    ["day", "2026-12-31", 1, "2027-01-01"],
    ["day", "2026-03-01", -1, "2026-02-28"],
    ["day", "2028-03-01", -1, "2028-02-29"],
  ])("%s: %s %i -> %s", (view, date, step, expected) => {
    expect(shiftDate(view, date, step)).toBe(expected);
  });

  it("steps whole days across both US DST changes", () => {
    inZone("America/Los_Angeles", "2026-09-08T09:00:00.000Z", 420);
    expect(shiftDate("day", "2026-11-01", 1)).toBe("2026-11-02");
    expect(shiftDate("day", "2026-11-02", -1)).toBe("2026-11-01");
    expect(shiftDate("day", "2026-03-08", 1)).toBe("2026-03-09");
    expect(shiftDate("week", "2026-10-28", 1)).toBe("2026-11-04");
  });
});

describe("visibleDays", () => {
  it("day view covers exactly that day", () => {
    expect(visibleDays("day", "2026-09-08")).toEqual({
      start: "2026-09-08",
      endExclusive: "2026-09-09",
    });
  });

  it.each(["2026-09-06", "2026-09-08", "2026-09-12"])(
    "week view runs Sunday to Saturday: %s",
    (date) => {
      expect(visibleDays("week", date)).toEqual({
        start: "2026-09-06",
        endExclusive: "2026-09-13",
      });
    },
  );

  it("month view is the whole weeks-by-days grid around the month", () => {
    // September 2026 starts on a Tuesday and ends on a Wednesday.
    expect(visibleDays("month", "2026-09-08")).toEqual({
      start: "2026-08-30",
      endExclusive: "2026-10-04",
    });
    // February 2026 starts on a Sunday and ends on a Saturday: four rows.
    expect(visibleDays("month", "2026-02-15")).toEqual({
      start: "2026-02-01",
      endExclusive: "2026-03-01",
    });
  });

  it.each(Array.from({ length: 12 }, (_, i) => i + 1))(
    "every month grid of 2026 is whole Sunday-first weeks: month %i",
    (month) => {
      const first = `2026-${String(month).padStart(2, "0")}-01`;
      const { start, endExclusive } = visibleDays("month", first);
      const days =
        (Date.parse(`${endExclusive}T00:00:00Z`) -
          Date.parse(`${start}T00:00:00Z`)) /
        86_400_000;

      expect(new Date(`${start}T00:00:00Z`).getUTCDay()).toBe(0);
      expect(days % 7).toBe(0);
      expect([35, 42, 28]).toContain(days);
      expect(start <= first).toBe(true);
      expect(shiftDate("month", first, 1) <= endExclusive).toBe(true);
    },
  );
});

describe("rangeLabel", () => {
  it.each<[CalendarView, string, string]>([
    ["month", "2026-09-08", "September 2026"],
    ["month", "2027-01-31", "January 2027"],
    ["week", "2026-09-08", "Sep 6 – 12, 2026"],
    ["week", "2026-09-30", "Sep 27 – Oct 3, 2026"],
    ["week", "2026-12-30", "Dec 27, 2026 – Jan 2, 2027"],
    ["week", "2026-11-01", "Nov 1 – 7, 2026"],
    ["day", "2026-09-08", "Tuesday, September 8, 2026"],
    ["day", "2027-01-01", "Friday, January 1, 2027"],
  ])("%s %s -> %s", (view, date, expected) => {
    expect(rangeLabel(view, date)).toBe(expected);
  });
});

describe("the viewer's zone", () => {
  // REF_DATE, the seed's anchor: 17:00 in Singapore, 23:00 the day before
  // in Honolulu.
  const ANCHOR = new Date("2026-09-08T09:00:00.000Z");

  it("localDay reads the viewer-local date", () => {
    inZone("Asia/Singapore", ANCHOR.toISOString(), -480);
    expect(localDay(ANCHOR)).toBe("2026-09-08");

    inZone("Pacific/Honolulu", ANCHOR.toISOString(), 600);
    expect(localDay(ANCHOR)).toBe("2026-09-07");
  });

  it("toInstantRange runs from local midnight to local midnight", () => {
    expect(toInstantRange(visibleDays("month", "2026-09-08"))).toEqual({
      from: "2026-08-30T00:00:00.000Z",
      to: "2026-10-04T00:00:00.000Z",
    });

    inZone("Asia/Singapore", ANCHOR.toISOString(), -480);
    expect(toInstantRange(visibleDays("month", "2026-09-08"))).toEqual({
      from: "2026-08-29T16:00:00.000Z",
      to: "2026-10-03T16:00:00.000Z",
    });
  });

  it("toInstantRange follows a DST change inside the range", () => {
    inZone("America/Los_Angeles", ANCHOR.toISOString(), 420);
    // Midnight PDT on the Sunday, midnight PST a week later: 169 hours.
    expect(toInstantRange(visibleDays("week", "2026-11-01"))).toEqual({
      from: "2026-11-01T07:00:00.000Z",
      to: "2026-11-08T08:00:00.000Z",
    });
    expect(toInstantRange(visibleDays("day", "2026-03-08"))).toEqual({
      from: "2026-03-08T08:00:00.000Z",
      to: "2026-03-09T07:00:00.000Z",
    });
  });

  it("zoneLabel names the zone and its offset on that day", () => {
    inZone("Asia/Singapore", ANCHOR.toISOString(), -480);
    expect(zoneLabel(ANCHOR)).toBe("Asia/Singapore · GMT+8");

    // Not Asia/Kolkata: Node's ICU reports that zone by its legacy name,
    // Asia/Calcutta. The label shows whatever name the runtime resolves.
    inZone("Australia/Adelaide", ANCHOR.toISOString(), -570);
    expect(zoneLabel(ANCHOR)).toBe("Australia/Adelaide · GMT+9:30");

    inZone("America/Los_Angeles", ANCHOR.toISOString(), 420);
    expect(zoneLabel(ANCHOR)).toBe("America/Los_Angeles · GMT-7");
    expect(zoneLabel(new Date("2026-12-01T12:00:00.000Z"))).toBe(
      "America/Los_Angeles · GMT-8",
    );
  });

  it("zoneLabel names an explicit zone whatever the runtime zone", () => {
    inZone("Asia/Singapore", ANCHOR.toISOString(), -480);
    expect(zoneLabel(ANCHOR, "America/Los_Angeles")).toBe(
      "America/Los_Angeles · GMT-7",
    );
    expect(
      zoneLabel(new Date("2026-12-01T12:00:00.000Z"), "America/Los_Angeles"),
    ).toBe("America/Los_Angeles · GMT-8");
    expect(zoneLabel(ANCHOR, "UTC")).toBe("UTC · GMT");
    // No zone given: still the runtime's own.
    expect(zoneLabel(ANCHOR)).toBe("Asia/Singapore · GMT+8");
  });
});
