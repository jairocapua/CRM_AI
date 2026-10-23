import { describe, expect, it, vi } from "vitest";

import type { AppointmentStatus } from "@/types";
import {
  calendarDayOf,
  liveFirst,
  offersStart,
  shownStatus,
  zonedTimes,
  type StatusWrite,
} from "./appointment-display";
import { groupByLocalDay, splitOverflow } from "./month-grid";

/**
 * The appointment details' pure parts: the order a day lists its
 * appointments in, the calendar date and wall-clock times of an instant in a
 * given zone, and which status the details show while a change is in flight.
 *
 * The setup file runs every test in UTC; the zone-dependent cases set one
 * with `vi.stubEnv("TZ", ...)` and first prove it took.
 */

function inZone(zone: string, probe: string, offset: number) {
  vi.stubEnv("TZ", zone);
  // A TZ override that silently failed would run every case in UTC.
  expect(new Date(probe).getTimezoneOffset()).toBe(offset);
}

interface Row {
  id: string;
  startAt: string;
  status: AppointmentStatus;
}

const row = (id: string, startAt: string, status: AppointmentStatus): Row => ({
  id,
  startAt,
  status,
});

describe("liveFirst", () => {
  it("puts live rows first, each group in input order", () => {
    const rows = [
      row("live-1", "2026-09-08T01:00:00.000Z", "confirmed"),
      row("cancelled-0", "2026-09-08T00:00:00.000Z", "cancelled"),
      row("live-2", "2026-09-08T02:00:00.000Z", "showed"),
      row("cancelled-3", "2026-09-08T03:00:00.000Z", "cancelled"),
      row("live-4", "2026-09-08T04:00:00.000Z", "no_show"),
    ];

    expect(liveFirst(rows).map((r) => r.id)).toEqual([
      "live-1",
      "live-2",
      "live-4",
      "cancelled-0",
      "cancelled-3",
    ]);
  });

  it("keeps the input order within each group, not start order", () => {
    // The API's order is kept as given (its tie order included); nothing is
    // re-sorted by time.
    const rows = [
      row("b", "2026-09-08T02:00:00.000Z", "confirmed"),
      row("a", "2026-09-08T01:00:00.000Z", "confirmed"),
      row("y", "2026-09-08T02:00:00.000Z", "cancelled"),
      row("x", "2026-09-08T01:00:00.000Z", "cancelled"),
    ];
    expect(liveFirst(rows).map((r) => r.id)).toEqual(["b", "a", "y", "x"]);
  });

  it("loses and duplicates nothing", () => {
    const rows = [
      row("1", "2026-09-08T03:00:00.000Z", "cancelled"),
      row("2", "2026-09-08T01:00:00.000Z", "confirmed"),
      row("3", "2026-09-08T02:00:00.000Z", "cancelled"),
    ];
    const out = liveFirst(rows);
    expect(out).toHaveLength(rows.length);
    expect(new Set(out)).toEqual(new Set(rows));
  });

  it("leaves an all-live or all-cancelled list unchanged", () => {
    const live = [
      row("1", "2026-09-08T01:00:00.000Z", "confirmed"),
      row("2", "2026-09-08T00:00:00.000Z", "showed"),
    ];
    const cancelled = [
      row("3", "2026-09-08T01:00:00.000Z", "cancelled"),
      row("4", "2026-09-08T00:00:00.000Z", "cancelled"),
    ];
    expect(liveFirst(live)).toEqual(live);
    expect(liveFirst(cancelled)).toEqual(cancelled);
    expect(liveFirst([])).toEqual([]);
  });

  it("does not modify its input", () => {
    const rows = [
      row("1", "2026-09-08T00:00:00.000Z", "cancelled"),
      row("2", "2026-09-08T01:00:00.000Z", "confirmed"),
    ];
    const before = [...rows];
    liveFirst(rows);
    expect(rows).toEqual(before);
  });

  it("keeps live rows visible above +N more", () => {
    // Four on one day, the earliest cancelled. In start order the cancelled
    // one would take a visible chip and push a live booking behind "+N more".
    const rows = [
      row("cancelled", "2026-09-08T00:00:00.000Z", "cancelled"),
      row("live-1", "2026-09-08T01:00:00.000Z", "confirmed"),
      row("live-2", "2026-09-08T02:00:00.000Z", "confirmed"),
      row("live-3", "2026-09-08T03:00:00.000Z", "showed"),
    ];
    const unordered = splitOverflow(
      groupByLocalDay(rows).get("2026-09-08") ?? [],
    );
    expect(unordered.visible.map((r) => r.id)).toContain("cancelled");

    const { visible, more } = splitOverflow(
      groupByLocalDay(liveFirst(rows)).get("2026-09-08") ?? [],
    );
    expect(visible.map((r) => r.id)).toEqual(["live-1", "live-2"]);
    expect(visible.every((r) => r.status !== "cancelled")).toBe(true);
    expect(more).toBe(2);
  });
});

describe("calendarDayOf", () => {
  // 23:30 on 8 September in Los Angeles, 14:30 on 9 September in Singapore.
  const AT = "2026-09-09T06:30:00.000Z";

  it("reads the date in the given zone, not the runtime's", () => {
    for (const [runtime, offset] of [
      ["Asia/Singapore", -480],
      ["America/Los_Angeles", 420],
    ] as const) {
      inZone(runtime, AT, offset);
      expect(calendarDayOf(AT, "America/Los_Angeles")).toBe("2026-09-08");
      expect(calendarDayOf(AT, "Asia/Singapore")).toBe("2026-09-09");
      expect(calendarDayOf(AT, "UTC")).toBe("2026-09-09");
    }
  });

  it("is the day of a midnight start, in that zone", () => {
    // 00:00 on 8 September in Los Angeles (PDT).
    expect(
      calendarDayOf("2026-09-08T07:00:00.000Z", "America/Los_Angeles"),
    ).toBe("2026-09-08");
    // One millisecond earlier is still the 7th.
    expect(
      calendarDayOf("2026-09-08T06:59:59.999Z", "America/Los_Angeles"),
    ).toBe("2026-09-07");
  });
});

describe("zonedTimes", () => {
  const START = "2026-09-08T17:00:00.000Z";
  const END = "2026-09-08T17:30:00.000Z";

  it("shows the times in an explicit zone, whatever the runtime zone", () => {
    inZone("Asia/Singapore", START, -480);
    expect(zonedTimes(START, END, "America/Los_Angeles")).toEqual({
      day: "Tuesday, September 8, 2026",
      times: "10:00 AM – 10:30 AM",
      zone: "America/Los_Angeles · GMT-7",
    });
  });

  it("shows the viewer's own times when no zone is given", () => {
    inZone("Asia/Singapore", START, -480);
    expect(zonedTimes(START, END)).toEqual({
      day: "Wednesday, September 9, 2026",
      times: "1:00 AM – 1:30 AM",
      zone: "Asia/Singapore · GMT+8",
    });

    inZone("America/Los_Angeles", START, 420);
    expect(zonedTimes(START, END)).toEqual({
      day: "Tuesday, September 8, 2026",
      times: "10:00 AM – 10:30 AM",
      zone: "America/Los_Angeles · GMT-7",
    });
  });

  it("takes the zone's offset on the appointment's own date", () => {
    inZone("Asia/Singapore", START, -480);
    // Standard time in December: GMT-8, not the summer's GMT-7.
    expect(
      zonedTimes(
        "2026-12-01T18:00:00.000Z",
        "2026-12-01T19:00:00.000Z",
        "America/Los_Angeles",
      ),
    ).toEqual({
      day: "Tuesday, December 1, 2026",
      times: "10:00 AM – 11:00 AM",
      zone: "America/Los_Angeles · GMT-8",
    });
  });

  describe("an appointment that crosses midnight", () => {
    // 23:45 on 7 September to 00:30 on the 8th in Kolkata (GMT+5:30), but
    // 11:15 AM to noon on the 7th in Los Angeles: a case like the seed's.
    const KOLKATA_START = "2026-09-07T18:15:00.000Z";
    const KOLKATA_END = "2026-09-07T19:00:00.000Z";

    it("adds the end date when it ends on a later date in that zone, whatever the runtime zone", () => {
      for (const [runtime, offset] of [
        ["Asia/Singapore", -480],
        ["America/Los_Angeles", 420],
      ] as const) {
        inZone(runtime, KOLKATA_START, offset);
        expect(zonedTimes(KOLKATA_START, KOLKATA_END, "Asia/Kolkata")).toEqual({
          day: "Monday, September 7, 2026",
          times: "11:45 PM – Tuesday, September 8, 12:30 AM",
          zone: "Asia/Kolkata · GMT+5:30",
        });
        expect(
          zonedTimes(KOLKATA_START, KOLKATA_END, "America/Los_Angeles"),
        ).toEqual({
          day: "Monday, September 7, 2026",
          times: "11:15 AM – 12:00 PM",
          zone: "America/Los_Angeles · GMT-7",
        });
      }
    });

    it("dates the calendar zone's end while the viewer's does not cross, and the reverse", () => {
      // 23:30 on 8 September to 00:30 on the 9th in Los Angeles, 2:30 PM to
      // 3:30 PM on the 9th in Singapore.
      const START = "2026-09-09T06:30:00.000Z";
      const END = "2026-09-09T07:30:00.000Z";
      const laCrossing = {
        day: "Tuesday, September 8, 2026",
        times: "11:30 PM – Wednesday, September 9, 12:30 AM",
        zone: "America/Los_Angeles · GMT-7",
      };

      inZone("Asia/Singapore", START, -480);
      expect(zonedTimes(START, END, "America/Los_Angeles")).toEqual(laCrossing);
      expect(zonedTimes(START, END)).toEqual({
        day: "Wednesday, September 9, 2026",
        times: "2:30 PM – 3:30 PM",
        zone: "Asia/Singapore · GMT+8",
      });

      inZone("America/Los_Angeles", START, 420);
      expect(zonedTimes(START, END)).toEqual(laCrossing);
    });

    it("shows the viewer's own end date when no zone is given", () => {
      inZone("Asia/Kolkata", KOLKATA_START, -330);
      const times = zonedTimes(KOLKATA_START, KOLKATA_END);
      expect(times).toMatchObject({
        day: "Monday, September 7, 2026",
        times: "11:45 PM – Tuesday, September 8, 12:30 AM",
      });
      // The offset only: the runtime may name the zone by its legacy id,
      // Asia/Calcutta.
      expect(times.zone).toMatch(/ · GMT\+5:30$/);
    });

    it("keeps an end exactly at local midnight on the start date", () => {
      // 23:30 on 7 September in Los Angeles to midnight, as the week and day
      // grids draw it (`daySegments`: it stays on its own day only).
      const START = "2026-09-08T06:30:00.000Z";
      expect(
        zonedTimes(START, "2026-09-08T07:00:00.000Z", "America/Los_Angeles"),
      ).toEqual({
        day: "Monday, September 7, 2026",
        times: "11:30 PM – 12:00 AM",
        zone: "America/Los_Angeles · GMT-7",
      });
      // A quarter of an hour later it ends on the 8th.
      expect(
        zonedTimes(START, "2026-09-08T07:15:00.000Z", "America/Los_Angeles"),
      ).toEqual({
        day: "Monday, September 7, 2026",
        times: "11:30 PM – Tuesday, September 8, 12:15 AM",
        zone: "America/Los_Angeles · GMT-7",
      });
    });

    it("names the end's year only when it differs from the start's", () => {
      // New Year's Eve in Los Angeles, standard time.
      expect(
        zonedTimes(
          "2027-01-01T07:30:00.000Z",
          "2027-01-01T08:30:00.000Z",
          "America/Los_Angeles",
        ),
      ).toEqual({
        day: "Thursday, December 31, 2026",
        times: "11:30 PM – Friday, January 1, 2027, 12:30 AM",
        zone: "America/Los_Angeles · GMT-8",
      });
    });
  });
});

describe("offersStart", () => {
  const SLOTS = ["2026-09-08T16:00:00.000Z", "2026-09-08T17:00:00.000Z"];

  it("is true when the start is one of the offered instants", () => {
    expect(offersStart(SLOTS, "2026-09-08T17:00:00.000Z")).toBe(true);
    // Any ISO spelling of the same instant.
    expect(offersStart(SLOTS, "2026-09-08T10:00:00-07:00")).toBe(true);
  });

  it("is false otherwise", () => {
    expect(offersStart(SLOTS, "2026-09-08T17:30:00.000Z")).toBe(false);
    expect(offersStart([], "2026-09-08T17:00:00.000Z")).toBe(false);
    expect(offersStart(SLOTS, "not a date")).toBe(false);
  });
});

describe("shownStatus", () => {
  const ROW = {
    id: "appt_1",
    updatedAt: "2026-09-08T09:00:00.000Z",
    status: "confirmed" as const,
  };

  it("is the stored status with no write in flight", () => {
    expect(shownStatus(ROW, null)).toBe("confirmed");
  });

  it("is the written status while the row has not moved on", () => {
    const write: StatusWrite = {
      id: ROW.id,
      base: ROW.updatedAt,
      status: "no_show",
    };
    expect(shownStatus(ROW, write)).toBe("no_show");
  });

  it("is the stored status again once the row has been updated", () => {
    // After the refetch the row carries a newer `updatedAt`: the store has
    // answered, so the write no longer speaks for it.
    const write: StatusWrite = {
      id: ROW.id,
      base: ROW.updatedAt,
      status: "no_show",
    };
    expect(
      shownStatus(
        { ...ROW, updatedAt: "2026-09-08T09:00:05.000Z", status: "showed" },
        write,
      ),
    ).toBe("showed");
  });

  it("ignores a write for another appointment", () => {
    const write: StatusWrite = {
      id: "appt_2",
      base: ROW.updatedAt,
      status: "cancelled",
    };
    expect(shownStatus(ROW, write)).toBe("confirmed");
  });
});
