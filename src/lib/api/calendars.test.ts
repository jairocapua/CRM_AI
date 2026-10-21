import { describe, expect, it, vi } from "vitest";

import type { Calendar } from "@/types";
import {
  seededWorld,
  setDemoNow,
  settle,
  stubLocalStorage,
} from "@/lib/mock/testing";

/**
 * The P7 time model: availability windows are wall-clock times in the
 * calendar's own zone (every seeded calendar is America/Los_Angeles), whatever
 * zone the runtime is in. Every expectation below is a hand-written list of
 * UTC instants, so nothing here shares arithmetic with the engine.
 *
 * Los Angeles is UTC-7 until the fall-back on Sunday 2026-11-01 and UTC-8
 * after it, so 09:00 local is 16:00Z before the change and 17:00Z after.
 *
 * The demo clock is moved to Monday 2026-10-26 08:00 PDT, past the seeded
 * appointments (they end mid-October), so the calendars start empty and each
 * case books exactly what it needs.
 */

interface Zone {
  zone: string;
  /** `getTimezoneOffset()` at DEMO_NOW: proves the TZ override took. */
  offset: number;
}

const ZONES: Zone[] = [
  { zone: "UTC", offset: 0 },
  { zone: "Asia/Singapore", offset: -480 },
];

/** Monday 2026-10-26, 08:00 in Los Angeles. */
const DEMO_NOW = "2026-10-26T15:00:00.000Z";

/** Discovery Call, Tue 2026-10-27, 09:00-17:00 PDT in 30-minute steps. */
const DISCOVERY_TUESDAY = [
  "2026-10-27T16:00:00.000Z",
  "2026-10-27T16:30:00.000Z",
  "2026-10-27T17:00:00.000Z",
  "2026-10-27T17:30:00.000Z",
  "2026-10-27T18:00:00.000Z",
  "2026-10-27T18:30:00.000Z",
  "2026-10-27T19:00:00.000Z",
  "2026-10-27T19:30:00.000Z",
  "2026-10-27T20:00:00.000Z",
  "2026-10-27T20:30:00.000Z",
  "2026-10-27T21:00:00.000Z",
  "2026-10-27T21:30:00.000Z",
  "2026-10-27T22:00:00.000Z",
  "2026-10-27T22:30:00.000Z",
  "2026-10-27T23:00:00.000Z",
  "2026-10-27T23:30:00.000Z",
];

/** Discovery Call, Mon 2026-11-02 (PST): 09:00-17:00 is 17:00Z-01:00Z. */
const DISCOVERY_MONDAY_AFTER_DST = [
  "2026-11-02T17:00:00.000Z",
  "2026-11-02T17:30:00.000Z",
  "2026-11-02T18:00:00.000Z",
  "2026-11-02T18:30:00.000Z",
  "2026-11-02T19:00:00.000Z",
  "2026-11-02T19:30:00.000Z",
  "2026-11-02T20:00:00.000Z",
  "2026-11-02T20:30:00.000Z",
  "2026-11-02T21:00:00.000Z",
  "2026-11-02T21:30:00.000Z",
  "2026-11-02T22:00:00.000Z",
  "2026-11-02T22:30:00.000Z",
  "2026-11-02T23:00:00.000Z",
  "2026-11-02T23:30:00.000Z",
  "2026-11-03T00:00:00.000Z",
  "2026-11-03T00:30:00.000Z",
];

/** Discovery Call, Wed 2026-11-25 (PST), the last day of its 30-day range. */
const DISCOVERY_LAST_DAY = [
  "2026-11-25T17:00:00.000Z",
  "2026-11-25T17:30:00.000Z",
  "2026-11-25T18:00:00.000Z",
  "2026-11-25T18:30:00.000Z",
  "2026-11-25T19:00:00.000Z",
  "2026-11-25T19:30:00.000Z",
  "2026-11-25T20:00:00.000Z",
  "2026-11-25T20:30:00.000Z",
  "2026-11-25T21:00:00.000Z",
  "2026-11-25T21:30:00.000Z",
  "2026-11-25T22:00:00.000Z",
  "2026-11-25T22:30:00.000Z",
  "2026-11-25T23:00:00.000Z",
  "2026-11-25T23:30:00.000Z",
  "2026-11-26T00:00:00.000Z",
  "2026-11-26T00:30:00.000Z",
];

/** Strategy Session, Wed 2026-10-28, 09:00-16:00 PDT in 60-minute steps. */
const STRATEGY_WEDNESDAY = [
  "2026-10-28T16:00:00.000Z",
  "2026-10-28T17:00:00.000Z",
  "2026-10-28T18:00:00.000Z",
  "2026-10-28T19:00:00.000Z",
  "2026-10-28T20:00:00.000Z",
  "2026-10-28T21:00:00.000Z",
  "2026-10-28T22:00:00.000Z",
];

async function loadWorld(zone: Zone, now = DEMO_NOW) {
  vi.stubEnv("TZ", zone.zone);
  // A TZ override that silently failed would run every case in UTC.
  expect(new Date(DEMO_NOW).getTimezoneOffset()).toBe(zone.offset);

  const { db } = await seededWorld();
  setDemoNow(now);
  const api = await import("./calendars");
  const activities = await import("./activities");

  const calendars = await settle(api.list());
  const bySlug = (slug: string): Calendar => {
    const calendar = calendars.find((c) => c.slug === slug);
    if (!calendar) throw new Error(`no seeded calendar "${slug}"`);
    return calendar;
  };
  const contactId = Object.keys(db.getState().contacts)[0]!;

  return {
    api,
    activities,
    contactId,
    discovery: bySlug("discovery"),
    strategy: bySlug("strategy"),
    slots: (calendar: Calendar, day: string) =>
      settle(api.availableSlots(calendar.id, day)),
    book: (calendar: Calendar, startAt: string) =>
      settle(api.book({ calendarId: calendar.id, contactId, startAt })),
  };
}

describe.each(ZONES)("availableSlots() with the runtime in $zone", (zone) => {
  it("starts from an empty calendar in late October", async () => {
    // Guards every literal list below: a seeded booking in this range would
    // make them wrong for a reason unrelated to the engine.
    const { api } = await loadWorld(zone);
    const rows = await settle(
      api.listAppointments({
        from: "2026-10-26T00:00:00.000Z",
        to: "2026-11-27T00:00:00.000Z",
      }),
    );
    expect(rows).toEqual([]);
  });

  it("gives a Tuesday's slots as Los Angeles wall-clock times", async () => {
    const { discovery, slots } = await loadWorld(zone);
    expect(await slots(discovery, "2026-10-27")).toEqual(DISCOVERY_TUESDAY);
  });

  it("removes a booking and the buffers on both sides of it", async () => {
    // Strategy Session: 60-minute slots, 10 minutes before, 15 after.
    const { strategy, slots, book } = await loadWorld(zone);
    await book(strategy, "2026-10-27T18:00:00.000Z");

    expect(await slots(strategy, "2026-10-27")).toEqual([
      "2026-10-27T16:00:00.000Z",
      // 17:00Z ends at 18:00Z, inside the 10-minute buffer before 18:00Z.
      // 18:00Z is the booking itself.
      // 19:00Z starts inside the 15-minute buffer after 19:00Z.
      "2026-10-27T20:00:00.000Z",
      "2026-10-27T21:00:00.000Z",
      "2026-10-27T22:00:00.000Z",
    ]);
  });

  it("keeps wall-clock hours across the fall-back change", async () => {
    const { discovery, slots } = await loadWorld(zone);

    // Friday, still PDT (UTC-7), with the shorter 09:00-15:00 window.
    expect(await slots(discovery, "2026-10-30")).toEqual([
      "2026-10-30T16:00:00.000Z",
      "2026-10-30T16:30:00.000Z",
      "2026-10-30T17:00:00.000Z",
      "2026-10-30T17:30:00.000Z",
      "2026-10-30T18:00:00.000Z",
      "2026-10-30T18:30:00.000Z",
      "2026-10-30T19:00:00.000Z",
      "2026-10-30T19:30:00.000Z",
      "2026-10-30T20:00:00.000Z",
      "2026-10-30T20:30:00.000Z",
      "2026-10-30T21:00:00.000Z",
      "2026-10-30T21:30:00.000Z",
    ]);
    // Sunday 2026-11-01, the change itself: closed.
    expect(await slots(discovery, "2026-11-01")).toEqual([]);
    // Monday, now PST (UTC-8): the same 09:00 is an hour later in UTC.
    expect(await slots(discovery, "2026-11-02")).toEqual(
      DISCOVERY_MONDAY_AFTER_DST,
    );
  });

  it("steps through the 25-hour day by elapsed time", async () => {
    const { api, discovery, slots, book } = await loadWorld(zone);
    // Open Sunday 00:00-04:00 so the repeated 01:00 hour is inside a window.
    await settle(
      api.update(discovery.id, {
        availability: discovery.availability.map((rule) =>
          rule.weekday === 0
            ? {
                ...rule,
                enabled: true,
                windows: [{ start: "00:00", end: "04:00" }],
              }
            : rule,
        ),
      }),
    );

    // Midnight PDT is 07:00Z; 04:00 PST is 12:00Z: five hours, ten slots.
    expect(await slots(discovery, "2026-11-01")).toEqual([
      "2026-11-01T07:00:00.000Z", // 00:00 PDT
      "2026-11-01T07:30:00.000Z", // 00:30 PDT
      "2026-11-01T08:00:00.000Z", // 01:00 PDT
      "2026-11-01T08:30:00.000Z", // 01:30 PDT
      "2026-11-01T09:00:00.000Z", // 01:00 PST
      "2026-11-01T09:30:00.000Z", // 01:30 PST
      "2026-11-01T10:00:00.000Z", // 02:00 PST
      "2026-11-01T10:30:00.000Z",
      "2026-11-01T11:00:00.000Z",
      "2026-11-01T11:30:00.000Z", // 03:30 PST
    ]);

    // 01:30 PDT; its 10-minute after-buffer reaches into 01:00 PST, and
    // 01:00 PDT's own after-buffer would reach into it.
    await book(discovery, "2026-11-01T08:30:00.000Z");
    expect(await slots(discovery, "2026-11-01")).toEqual([
      "2026-11-01T07:00:00.000Z",
      "2026-11-01T07:30:00.000Z",
      "2026-11-01T09:30:00.000Z",
      "2026-11-01T10:00:00.000Z",
      "2026-11-01T10:30:00.000Z",
      "2026-11-01T11:00:00.000Z",
      "2026-11-01T11:30:00.000Z",
    ]);
  });

  it("offers nothing beyond dateRangeDays", async () => {
    // Discovery books 30 days ahead: from Mon 10-26, Wed 11-25 is the last day.
    const { discovery, slots } = await loadWorld(zone);
    expect(await slots(discovery, "2026-11-25")).toEqual(DISCOVERY_LAST_DAY);
    expect(await slots(discovery, "2026-11-26")).toEqual([]);
  });

  it("applies the minimum scheduling notice", async () => {
    // 11:10 PDT plus Discovery's 4 hours: nothing before 22:10Z.
    const { discovery, slots } = await loadWorld(
      zone,
      "2026-10-27T18:10:00.000Z",
    );
    expect(await slots(discovery, "2026-10-27")).toEqual([
      "2026-10-27T22:30:00.000Z",
      "2026-10-27T23:00:00.000Z",
      "2026-10-27T23:30:00.000Z",
    ]);
  });

  it("closes a day at maxBookingsPerDay", async () => {
    // Strategy Session takes three a day.
    const { strategy, slots, book } = await loadWorld(zone);
    await book(strategy, "2026-10-27T16:00:00.000Z");
    await book(strategy, "2026-10-27T20:00:00.000Z");
    // Buffers take 17:00Z, 19:00Z and 21:00Z; two slots are still open.
    expect(await slots(strategy, "2026-10-27")).toEqual([
      "2026-10-27T18:00:00.000Z",
      "2026-10-27T22:00:00.000Z",
    ]);

    await book(strategy, "2026-10-27T22:00:00.000Z");
    expect(await slots(strategy, "2026-10-27")).toEqual([]);
    expect(await slots(strategy, "2026-10-28")).toEqual(STRATEGY_WEDNESDAY);
  });

  it.each(["2026-10-27T00:00:00.000Z", "2026-02-30", "2026-10-7", "tomorrow"])(
    "rejects %s as a day with a 422",
    async (day) => {
      const { discovery, slots } = await loadWorld(zone);
      await expect(slots(discovery, day)).rejects.toMatchObject({
        status: 422,
        code: "INVALID_DAY",
      });
    },
  );
});

describe.each(ZONES)("book() with the runtime in $zone", (zone) => {
  it("takes a slot, and cancelling gives it back", async () => {
    const { api, discovery, slots, book } = await loadWorld(zone);
    const booked = await book(discovery, "2026-10-27T17:00:00.000Z");

    expect(booked).toMatchObject({
      calendarId: discovery.id,
      startAt: "2026-10-27T17:00:00.000Z",
      endAt: "2026-10-27T17:30:00.000Z",
      timezone: "America/Los_Angeles",
      status: "confirmed",
      source: "manual",
    });
    // Both neighbours go too: 17:30Z starts inside the booking's 10-minute
    // after-buffer, and 16:30Z's own after-buffer would reach into it.
    expect(await slots(discovery, "2026-10-27")).toEqual(
      DISCOVERY_TUESDAY.filter(
        (iso) =>
          iso !== "2026-10-27T16:30:00.000Z" &&
          iso !== "2026-10-27T17:00:00.000Z" &&
          iso !== "2026-10-27T17:30:00.000Z",
      ),
    );

    await settle(api.cancel(booked.id));
    expect(await slots(discovery, "2026-10-27")).toEqual(DISCOVERY_TUESDAY);
  });

  it("puts a cancelled booking back while its time is still free", async () => {
    const { api, discovery, slots, book } = await loadWorld(zone);
    const booked = await book(discovery, "2026-10-27T17:00:00.000Z");
    await settle(api.cancel(booked.id));

    const restored = await settle(api.setStatus(booked.id, "confirmed"));
    expect(restored.status).toBe("confirmed");
    // The booking and both neighbours, as before it was cancelled.
    expect(await slots(discovery, "2026-10-27")).toEqual(
      DISCOVERY_TUESDAY.filter(
        (iso) =>
          iso !== "2026-10-27T16:30:00.000Z" &&
          iso !== "2026-10-27T17:00:00.000Z" &&
          iso !== "2026-10-27T17:30:00.000Z",
      ),
    );
  });

  const RESTORE_CONFLICTS: {
    name: string;
    calendar: "discovery" | "strategy";
    /** Booked, cancelled, then moved to `to`. */
    restored: string;
    /** Booked while `restored` is cancelled. */
    taken: string[];
    to: "confirmed" | "showed" | "no_show";
  }[] = [
    {
      name: "its own time, rebooked",
      calendar: "discovery",
      restored: "2026-10-27T17:00:00.000Z",
      taken: ["2026-10-27T17:00:00.000Z"],
      to: "confirmed",
    },
    {
      // 16:30Z's 10-minute after-buffer runs to 17:10Z.
      name: "a time inside a new booking's buffer",
      calendar: "discovery",
      restored: "2026-10-27T17:00:00.000Z",
      taken: ["2026-10-27T16:30:00.000Z"],
      to: "showed",
    },
    {
      // The mirror of the case above: 16:30Z's own 10-minute after-buffer
      // runs to 17:10Z, past the start of the booking made at 17:00Z.
      name: "a time whose own after-buffer reaches a new booking",
      calendar: "discovery",
      restored: "2026-10-27T16:30:00.000Z",
      taken: ["2026-10-27T17:00:00.000Z"],
      to: "confirmed",
    },
    {
      // Strategy Session takes three a day; none of these touch 16:00Z.
      name: "a day filled to maxBookingsPerDay",
      calendar: "strategy",
      restored: "2026-10-27T16:00:00.000Z",
      taken: [
        "2026-10-27T18:00:00.000Z",
        "2026-10-27T20:00:00.000Z",
        "2026-10-27T22:00:00.000Z",
      ],
      to: "no_show",
    },
  ];

  it.each(RESTORE_CONFLICTS)(
    "will not move a cancelled booking back onto $name",
    async (c) => {
      const world = await loadWorld(zone);
      const { api, activities, contactId, book } = world;
      const calendar = world[c.calendar];

      const first = await book(calendar, c.restored);
      await settle(api.cancel(first.id));
      for (const startAt of c.taken) await book(calendar, startAt);

      const snapshot = async () => ({
        appointments: await settle(
          api.listAppointments({
            from: "2026-10-27T00:00:00.000Z",
            to: "2026-10-28T00:00:00.000Z",
          }),
        ),
        timeline: await settle(activities.listForContact(contactId)),
      });
      const before = await snapshot();

      await expect(settle(api.setStatus(first.id, c.to))).rejects.toMatchObject(
        { status: 409, code: "SLOT_UNAVAILABLE" },
      );
      expect(await snapshot()).toEqual(before);
      const live = before.appointments.filter((a) => a.status !== "cancelled");
      expect(live.map((a) => a.startAt)).toEqual(c.taken);
    },
  );

  /**
   * Buffers apply both ways (P7-H2): no booking may sit inside another's
   * before- or after-buffer, whichever was booked first, so neighbours need a
   * gap of max(bufferBeforeMin, bufferAfterMin). Each row is run in both
   * orders, each in a fresh world. The seeded grids step by a whole slot, so
   * the boundary rows reconfigure Strategy to 1-minute steps; the 20/5 rows
   * put the larger buffer before, unlike any seeded calendar.
   */
  const ORDERS: {
    name: string;
    calendar: "discovery" | "strategy";
    patch?: Partial<Calendar>;
    earlier: string;
    later: string;
    /** What happens to whichever start is booked second. */
    second: "booked" | "rejected";
  }[] = [
    {
      // Discovery: 0 before, 10 after. 16:30Z's after-buffer runs to 17:10Z.
      name: "back-to-back Discovery slots",
      calendar: "discovery",
      earlier: "2026-10-27T16:30:00.000Z", // 09:30 PDT
      later: "2026-10-27T17:00:00.000Z", // 10:00 PDT
      second: "rejected",
    },
    {
      name: "Discovery slots a slot apart",
      calendar: "discovery",
      earlier: "2026-10-27T16:00:00.000Z", // 09:00 PDT
      later: "2026-10-27T17:00:00.000Z", // 10:00 PDT
      second: "booked",
    },
    {
      // 10 before, 15 after: the gap must be 15.
      name: "a 15-minute gap with 10/15 buffers",
      calendar: "strategy",
      patch: { slotIntervalMin: 1 },
      earlier: "2026-10-27T17:00:00.000Z", // 10:00-11:00 PDT
      later: "2026-10-27T18:15:00.000Z", // 11:15 PDT
      second: "booked",
    },
    {
      name: "a 14-minute gap with 10/15 buffers",
      calendar: "strategy",
      patch: { slotIntervalMin: 1 },
      earlier: "2026-10-27T17:00:00.000Z", // 10:00-11:00 PDT
      later: "2026-10-27T18:14:00.000Z", // 11:14 PDT
      second: "rejected",
    },
    {
      // 20 before, 5 after: the gap must be 20.
      name: "a 20-minute gap with 20/5 buffers",
      calendar: "strategy",
      patch: { slotIntervalMin: 1, bufferBeforeMin: 20, bufferAfterMin: 5 },
      earlier: "2026-10-27T17:00:00.000Z", // 10:00-11:00 PDT
      later: "2026-10-27T18:20:00.000Z", // 11:20 PDT
      second: "booked",
    },
    {
      name: "a 19-minute gap with 20/5 buffers",
      calendar: "strategy",
      patch: { slotIntervalMin: 1, bufferBeforeMin: 20, bufferAfterMin: 5 },
      earlier: "2026-10-27T17:00:00.000Z", // 10:00-11:00 PDT
      later: "2026-10-27T18:19:00.000Z", // 11:19 PDT
      second: "rejected",
    },
  ];

  it.each(
    ORDERS.flatMap((row) => [
      { ...row, order: "earlier first", first: row.earlier, then: row.later },
      { ...row, order: "later first", first: row.later, then: row.earlier },
    ]),
  )(
    "gives the same answer whichever is booked first: $name, $order",
    async (c) => {
      const world = await loadWorld(zone);
      const { api, slots, book } = world;
      const calendar = c.patch
        ? await settle(api.update(world[c.calendar].id, c.patch))
        : world[c.calendar];

      await book(calendar, c.first);

      // What availableSlots() offers and what book() accepts must agree.
      const offered = await slots(calendar, "2026-10-27");
      expect(offered.includes(c.then), `${c.then} offered`).toBe(
        c.second === "booked",
      );

      const second = book(calendar, c.then);
      if (c.second === "booked") {
        await expect(second).resolves.toMatchObject({ startAt: c.then });
      } else {
        await expect(second).rejects.toMatchObject({
          status: 409,
          code: "SLOT_UNAVAILABLE",
        });
      }
    },
  );

  it("stores any spelling of a slot's instant as UTC ISO", async () => {
    const { discovery, book } = await loadWorld(zone);
    const booked = await book(discovery, "2026-10-27T10:00:00-07:00");
    expect(booked.startAt).toBe("2026-10-27T17:00:00.000Z");
    expect(booked.endAt).toBe("2026-10-27T17:30:00.000Z");
  });

  const REJECTED: {
    name: string;
    startAt: string;
    /** Bookings made first, so the case has something to collide with. */
    before?: string[];
  }[] = [
    {
      name: "a taken slot",
      startAt: "2026-10-27T17:00:00.000Z",
      before: ["2026-10-27T17:00:00.000Z"],
    },
    {
      name: "a slot inside a booking's buffer",
      startAt: "2026-10-27T17:30:00.000Z",
      before: ["2026-10-27T17:00:00.000Z"],
    },
    { name: "an off-grid start", startAt: "2026-10-27T17:10:00.000Z" },
    {
      name: "a start outside hours (08:30 PDT)",
      startAt: "2026-10-27T15:30:00.000Z",
    },
    { name: "a closed day (Sunday)", startAt: "2026-10-25T17:00:00.000Z" },
    {
      name: "a day beyond dateRangeDays",
      startAt: "2026-11-26T17:00:00.000Z",
    },
    {
      name: "a start inside the minimum notice",
      startAt: "2026-10-26T17:00:00.000Z",
    },
  ];

  it.each(REJECTED)(
    "rejects $name with a 409 and writes nothing",
    async (c) => {
      const { api, activities, contactId, discovery, book } =
        await loadWorld(zone);
      for (const startAt of c.before ?? []) await book(discovery, startAt);

      const snapshot = async () => ({
        appointments: await settle(
          api.listAppointments({
            from: "2026-10-20T00:00:00.000Z",
            to: "2026-12-01T00:00:00.000Z",
          }),
        ),
        timeline: await settle(activities.listForContact(contactId)),
      });
      const before = await snapshot();

      await expect(book(discovery, c.startAt)).rejects.toMatchObject({
        status: 409,
        code: "SLOT_UNAVAILABLE",
      });
      expect(await snapshot()).toEqual(before);
    },
  );

  it("rejects a start that is not an instant with a 422", async () => {
    const { discovery, book } = await loadWorld(zone);
    await expect(book(discovery, "next tuesday")).rejects.toMatchObject({
      status: 422,
      code: "INVALID_START",
    });
  });

  it("lets exactly one of two concurrent bookings of a slot win", async () => {
    const { api, contactId, discovery } = await loadWorld(zone);
    const draft = {
      calendarId: discovery.id,
      contactId,
      startAt: "2026-10-27T17:00:00.000Z",
    };
    const results = await settle(
      Promise.allSettled([api.book(draft), api.book(draft)]),
    );

    expect(results.map((r) => r.status).sort()).toEqual([
      "fulfilled",
      "rejected",
    ]);
    const lost = results.find((r) => r.status === "rejected");
    expect(lost?.reason).toMatchObject({
      status: 409,
      code: "SLOT_UNAVAILABLE",
    });

    const rows = await settle(
      api.listAppointments({
        from: "2026-10-27T00:00:00.000Z",
        to: "2026-10-28T00:00:00.000Z",
        calendarIds: [discovery.id],
      }),
    );
    expect(rows.map((r) => r.startAt)).toEqual(["2026-10-27T17:00:00.000Z"]);
  });
});

describe("listUpcoming()", () => {
  const ANCHOR = "2026-09-08T09:00:00.000Z";

  it("does not advance the clock's high-water mark", async () => {
    await seededWorld();
    const storage = stubLocalStorage();
    const api = await import("./calendars");
    const { nowIso } = await import("./http");

    const rows = await settle(api.listUpcoming(6));
    expect(rows).toHaveLength(6);
    expect(storage.getItem("nimbus-crm-clock")).toBeNull();

    // Nothing moved the clock: the first timestamp issued is the anchor.
    expect(nowIso()).toBe(ANCHOR);
    // Positive control: a write does persist the mark through this stub.
    expect(JSON.parse(storage.getItem("nimbus-crm-clock") ?? "null")).toEqual({
      seededAt: ANCHOR,
      at: Date.parse(ANCHOR),
    });
  });
});
