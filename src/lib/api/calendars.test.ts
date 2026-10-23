import { describe, expect, it, vi } from "vitest";

import type { Appointment, AvailabilityRule, Calendar, ID } from "@/types";
import {
  seededWorld,
  setDemoNow,
  settle,
  stubLocalStorage,
} from "@/lib/mock/testing";
import type { CalendarPatch } from "./calendars";

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
    /** Monthly Review: seeded inactive (`isActive: false`). */
    review: bySlug("review"),
    slots: (calendar: Calendar, day: string) =>
      settle(api.availableSlots(calendar.id, day)),
    book: (calendar: Calendar, startAt: string) =>
      settle(api.book({ calendarId: calendar.id, contactId, startAt })),
  };
}

type World = Awaited<ReturnType<typeof loadWorld>>;

/**
 * What a rejected booking must leave as it was: every appointment from
 * Oct 20 to Dec 1, and the booking contact's timeline.
 */
async function snapshot({ api, activities, contactId }: World) {
  return {
    appointments: await settle(
      api.listAppointments({
        from: "2026-10-20T00:00:00.000Z",
        to: "2026-12-01T00:00:00.000Z",
      }),
    ),
    timeline: await settle(activities.listForContact(contactId)),
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

  it("reads 'today' in the calendar's zone for dateRangeDays", async () => {
    // 03:00Z on Tue 10-27 is still Mon 10-26, 20:00, in Los Angeles, so the
    // 30-day range still ends on Wed 11-25. Counted from the UTC date (or
    // Singapore's, 11:00 on 10-27) it would run to Thu 11-26, an open day.
    const { discovery, slots } = await loadWorld(
      zone,
      "2026-10-27T03:00:00.000Z",
    );
    expect(await slots(discovery, "2026-11-25")).toEqual(DISCOVERY_LAST_DAY);
    expect(await slots(discovery, "2026-11-26")).toEqual([]);
  });

  it("rejects an inactive calendar with a 409", async () => {
    const { review, slots } = await loadWorld(zone);
    await expect(slots(review, "2026-10-28")).rejects.toMatchObject({
      status: 409,
      code: "CALENDAR_INACTIVE",
    });
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

  it.each([
    "2026-10-27T00:00:00.000Z",
    "2026-02-30",
    "2026-10-7",
    "tomorrow",
    "0099-01-01",
  ])("rejects %s as a day with a 422", async (day) => {
    const { discovery, slots } = await loadWorld(zone);
    await expect(slots(discovery, day)).rejects.toMatchObject({
      status: 422,
      code: "INVALID_DAY",
    });
  });
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

  it.each(["2026-10-27T10:00:00-07:00", "2026-10-27T17:00Z"])(
    "stores any spelling of a slot's instant as UTC ISO: %s",
    async (spelling) => {
      const { discovery, book } = await loadWorld(zone);
      const booked = await book(discovery, spelling);
      expect(booked.startAt).toBe("2026-10-27T17:00:00.000Z");
      expect(booked.endAt).toBe("2026-10-27T17:30:00.000Z");
    },
  );

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
      const world = await loadWorld(zone);
      const { discovery, book } = world;
      for (const startAt of c.before ?? []) await book(discovery, startAt);
      const before = await snapshot(world);

      await expect(book(discovery, c.startAt)).rejects.toMatchObject({
        status: 409,
        code: "SLOT_UNAVAILABLE",
      });
      expect(await snapshot(world)).toEqual(before);
    },
  );

  /**
   * A start must name one instant on its own: an ISO date-time ending in `Z`
   * or an offset. Read without one, "17:00" would mean a different instant in
   * every runtime zone (it is 17:00Z, an open slot, in UTC).
   */
  it.each([
    { name: "free text", startAt: "next tuesday" },
    { name: "a time with no zone", startAt: "2026-10-27T17:00:00" },
    { name: "a date with no time", startAt: "2026-10-27" },
    // `Date.parse` reads this one as 2 March.
    { name: "an impossible date", startAt: "2026-02-30T17:00:00.000Z" },
    { name: "an impossible hour", startAt: "2026-10-27T25:00:00Z" },
  ])(
    "rejects $name as a start with a 422 and writes nothing",
    async ({ startAt }) => {
      const world = await loadWorld(zone);
      const before = await snapshot(world);

      await expect(world.book(world.discovery, startAt)).rejects.toMatchObject({
        status: 422,
        code: "INVALID_START",
      });
      expect(await snapshot(world)).toEqual(before);
    },
  );

  it("rejects an unknown contact with a 404 and writes nothing", async () => {
    const world = await loadWorld(zone);
    const { api, activities, discovery } = world;
    const before = await snapshot(world);

    await expect(
      settle(
        api.book({
          calendarId: discovery.id,
          contactId: "contact_missing",
          startAt: "2026-10-27T17:00:00.000Z",
        }),
      ),
    ).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    expect(await snapshot(world)).toEqual(before);
    expect(await settle(activities.listForContact("contact_missing"))).toEqual(
      [],
    );
  });

  it("rejects an inactive calendar with a 409 and writes nothing, until it is made active", async () => {
    const world = await loadWorld(zone);
    const { api, review, slots, book } = world;
    // Wed 09:00 PDT, past Monthly Review's 48 hours of notice from DEMO_NOW.
    const startAt = "2026-10-28T16:00:00.000Z";
    const before = await snapshot(world);

    await expect(book(review, startAt)).rejects.toMatchObject({
      status: 409,
      code: "CALENDAR_INACTIVE",
    });
    expect(await snapshot(world)).toEqual(before);

    // Positive control: being inactive is all that stood in the way.
    await settle(api.update(review.id, { isActive: true }));
    expect(await slots(review, "2026-10-28")).toContain(startAt);
    await expect(book(review, startAt)).resolves.toMatchObject({
      calendarId: review.id,
      startAt,
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

/**
 * P7-H3 (DECISIONS 2026-10-23): once an appointment has ended, it can only be
 * marked Showed or No Show; it can no longer be confirmed or cancelled. The
 * rule names target statuses only, so Showed and No Show stay allowed on
 * either side of the end.
 *
 * Every case books Discovery's 10:00 PDT slot on Tue 10-27 (17:00Z-17:30Z) at
 * DEMO_NOW, a day ahead, then moves the demo clock (which only runs forward).
 */
describe("setStatus() and cancel() once an appointment has ended (P7-H3)", () => {
  const START = "2026-10-27T17:00:00.000Z";
  const END = "2026-10-27T17:30:00.000Z";
  const HALF_AN_HOUR_AFTER = "2026-10-27T18:00:00.000Z";
  const MESSAGE =
    "This appointment has already ended, so it can only be marked Showed or No Show.";

  async function bookedWorld() {
    const world = await loadWorld(ZONES[0]!);
    const booked = await world.book(world.discovery, START);
    expect(booked).toMatchObject({ endAt: END, status: "confirmed" });
    return { ...world, id: booked.id };
  }

  const REFUSED: {
    name: string;
    /** Run after the booking, while it is still a day ahead. */
    ahead?: (world: World, id: ID) => Promise<unknown>;
    /** The demo clock for the refused call. */
    at: string;
    call: (api: World["api"], id: ID) => Promise<Appointment>;
  }[] = [
    {
      name: "cancel() on one never marked",
      at: HALF_AN_HOUR_AFTER,
      call: (api, id) => api.cancel(id),
    },
    {
      name: "setStatus(cancelled) on a no-show",
      ahead: ({ api }, id) => settle(api.setStatus(id, "no_show")),
      at: HALF_AN_HOUR_AFTER,
      call: (api, id) => api.setStatus(id, "cancelled"),
    },
    {
      name: "confirming one marked Showed",
      ahead: ({ api }, id) => settle(api.setStatus(id, "showed")),
      at: HALF_AN_HOUR_AFTER,
      call: (api, id) => api.setStatus(id, "confirmed"),
    },
    {
      name: "restoring a cancelled one as Confirmed",
      ahead: ({ api }, id) => settle(api.cancel(id)),
      at: HALF_AN_HOUR_AFTER,
      call: (api, id) => api.setStatus(id, "confirmed"),
    },
    {
      // Its time is taken too, which is a 409: the 422 is checked first.
      name: "restoring as Confirmed after its time was rebooked",
      ahead: async ({ api, discovery, book }, id) => {
        await settle(api.cancel(id));
        await book(discovery, START);
      },
      at: HALF_AN_HOUR_AFTER,
      call: (api, id) => api.setStatus(id, "confirmed"),
    },
    {
      name: "cancel() a millisecond after its end",
      at: "2026-10-27T17:30:00.001Z",
      call: (api, id) => api.cancel(id),
    },
  ];

  it.each(REFUSED)("refuses $name with a 422 and writes nothing", async (c) => {
    const world = await bookedWorld();
    // Loaded after `seededWorld()`, so it is the class the API throws.
    const { ApiError, nowIso } = await import("./http");
    await c.ahead?.(world, world.id);
    setDemoNow(c.at);
    const before = await snapshot(world);

    const error = await settle(c.call(world.api, world.id)).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 422,
      code: "PAST_APPOINTMENT",
      message: MESSAGE,
    });
    expect(await snapshot(world)).toEqual(before);
    // Not even the clock's mark moved: nothing has issued a timestamp since
    // the clock was set, so the next one is `at` itself.
    expect(nowIso()).toBe(c.at);
  });

  /** The status changes on the contact's timeline, newest first. */
  async function statusSummaries({ activities, contactId }: World, id: ID) {
    const timeline = await settle(activities.listForContact(contactId));
    return timeline
      .filter((a) => a.appointmentId === id && a.type !== "appointment.booked")
      .map((a) => a.summary);
  }

  it("lets an ended appointment be marked Showed, then No Show, then Showed again", async () => {
    const world = await bookedWorld();
    setDemoNow(HALF_AN_HOUR_AFTER);

    for (const status of ["showed", "no_show", "showed"] as const) {
      await expect(
        settle(world.api.setStatus(world.id, status)),
      ).resolves.toMatchObject({ id: world.id, status });
    }
    expect(await statusSummaries(world, world.id)).toEqual([
      "Appointment marked showed",
      "Appointment marked no show",
      "Appointment marked showed",
    ]);
  });

  it("lets an ended appointment go straight to No Show", async () => {
    const world = await bookedWorld();
    setDemoNow(HALF_AN_HOUR_AFTER);

    await expect(
      settle(world.api.setStatus(world.id, "no_show")),
    ).resolves.toMatchObject({ status: "no_show" });
    expect(await statusSummaries(world, world.id)).toEqual([
      "Appointment marked no show",
    ]);
  });

  it("lets an ended, cancelled appointment be marked Showed (the rule names target statuses only)", async () => {
    // Flagged to the owner: pinned so a later decision changes it on purpose.
    const world = await bookedWorld();
    await settle(world.api.cancel(world.id));
    setDemoNow(HALF_AN_HOUR_AFTER);

    await expect(
      settle(world.api.setStatus(world.id, "showed")),
    ).resolves.toMatchObject({ status: "showed" });
  });

  it("still cancels and confirms an appointment that has not ended", async () => {
    // Running: a minute before its end, so both writes land before it.
    const world = await bookedWorld();
    setDemoNow("2026-10-27T17:29:00.000Z");

    await expect(settle(world.api.cancel(world.id))).resolves.toMatchObject({
      status: "cancelled",
    });
    await expect(
      settle(world.api.setStatus(world.id, "confirmed")),
    ).resolves.toMatchObject({ status: "confirmed" });
  });

  it("at its end instant, cancel() is still allowed", async () => {
    // One write only: the clock issues strictly increasing timestamps, so a
    // second write in this millisecond would run at END + 1ms.
    const world = await bookedWorld();
    setDemoNow(END);

    await expect(settle(world.api.cancel(world.id))).resolves.toMatchObject({
      status: "cancelled",
    });
  });
});

/**
 * `update()` enforces the availability editor's rules itself, so a caller
 * that skips the form (a `fetch()` client, a script) cannot save settings the
 * slot engine would misread or throw on.
 */
describe("update() checks the settings it is given", () => {
  /** A patch that opens Tuesday (weekday 2) with exactly these windows. */
  const tuesday =
    (...windows: [string, string][]) =>
    (calendar: Calendar): Partial<Calendar> => ({
      availability: calendar.availability.map((rule) =>
        rule.weekday === 2
          ? {
              ...rule,
              enabled: true,
              windows: windows.map(([start, end]) => ({ start, end })),
            }
          : rule,
      ),
    });

  /**
   * Each patch breaks one rule, built on Discovery's own (valid) settings, so
   * `at` (where the API says the problem is) proves which rule caught it, and
   * `says` is the whole plain-language message a toast shows, with no path in
   * it. Discovery has one rule per weekday, so Tuesday's is availability.2 and
   * an extra rule is availability.7. The last row is about the patch as a
   * whole, so it has no `at`: the error's `field` is unset.
   */
  const BAD_PATCHES: {
    name: string;
    patch: (calendar: Calendar) => CalendarPatch;
    at: string | undefined;
    says: string;
  }[] = [
    {
      name: "a time that is not HH:mm",
      patch: tuesday(["9:00", "17:00"]),
      at: "availability.2.windows.0.start",
      says: "Tuesday, start of window 1: Enter a time.",
    },
    {
      name: "an hour past 23",
      patch: tuesday(["09:00", "24:00"]),
      at: "availability.2.windows.0.end",
      says: "Tuesday, end of window 1: Enter a time.",
    },
    {
      name: "a reversed window",
      patch: tuesday(["17:00", "09:00"]),
      at: "availability.2.windows.0.end",
      says: "Tuesday, end of window 1: End time must be after the start time.",
    },
    {
      name: "a zero-length window",
      patch: tuesday(["09:00", "09:00"]),
      at: "availability.2.windows.0.end",
      says: "Tuesday, end of window 1: End time must be after the start time.",
    },
    {
      name: "overlapping windows",
      patch: tuesday(["09:00", "12:00"], ["11:00", "14:00"]),
      at: "availability.2.windows.1.start",
      says: "Tuesday, start of window 2: Overlaps another time window on this day.",
    },
    {
      name: "a window nested in another",
      patch: tuesday(["09:00", "17:00"], ["10:00", "11:00"]),
      at: "availability.2.windows.1.start",
      says: "Tuesday, start of window 2: Overlaps another time window on this day.",
    },
    {
      name: "two rules for one weekday",
      patch: (c) => ({
        availability: [
          ...c.availability,
          { weekday: 2, enabled: false, windows: [] },
        ],
      }),
      at: "availability.7.weekday",
      says: "Tuesday hours: Only one rule per weekday.",
    },
    {
      name: "a weekday past Saturday",
      patch: (c) => ({
        availability: [
          ...c.availability,
          {
            weekday: 7 as AvailabilityRule["weekday"],
            enabled: false,
            windows: [],
          },
        ],
      }),
      at: "availability.7.weekday",
      says: "Weekly hours: Not a weekday.",
    },
    {
      // A JSON client can send any type: zod's own wording ("Invalid input:
      // expected boolean, received string") must not reach the message.
      name: "a day switch that is not true or false",
      patch: (c) => ({
        availability: c.availability.map((rule) =>
          rule.weekday === 2
            ? { ...rule, enabled: "yes" as unknown as boolean }
            : rule,
        ),
      }),
      at: "availability.2.enabled",
      says: "Tuesday hours: Not a valid value.",
    },
    {
      name: "a zero slot length",
      patch: () => ({ slotDurationMin: 0 }),
      at: "slotDurationMin",
      says: "Slot duration: Must be at least 1 minute.",
    },
    {
      name: "a negative slot length",
      patch: () => ({ slotDurationMin: -30 }),
      at: "slotDurationMin",
      says: "Slot duration: Must be at least 1 minute.",
    },
    {
      name: "a fractional slot interval",
      patch: () => ({ slotIntervalMin: 7.5 }),
      at: "slotIntervalMin",
      says: "Slot interval: Enter a whole number.",
    },
    {
      name: "a negative buffer before",
      patch: () => ({ bufferBeforeMin: -5 }),
      at: "bufferBeforeMin",
      says: "Buffer before: Can't be negative.",
    },
    {
      name: "a fractional buffer after",
      patch: () => ({ bufferAfterMin: 2.5 }),
      at: "bufferAfterMin",
      says: "Buffer after: Enter a whole number.",
    },
    {
      name: "a negative notice",
      patch: () => ({ minSchedulingNoticeHours: -1 }),
      at: "minSchedulingNoticeHours",
      says: "Minimum notice: Can't be negative.",
    },
    {
      name: "a fractional date range",
      patch: () => ({ dateRangeDays: 1.5 }),
      at: "dateRangeDays",
      says: "Booking range: Enter a whole number.",
    },
    {
      name: "a daily cap of zero",
      patch: () => ({ maxBookingsPerDay: 0 }),
      at: "maxBookingsPerDay",
      says: "Daily booking limit: Must be at least 1.",
    },
    {
      name: "a fractional daily cap",
      patch: () => ({ maxBookingsPerDay: 2.5 }),
      at: "maxBookingsPerDay",
      says: "Daily booking limit: Enter a whole number.",
    },
    {
      name: "an unknown time zone",
      patch: () => ({ timezone: "Mars/Olympus" }),
      at: "timezone",
      says: "Time zone: Not a known time zone.",
    },
    {
      name: "an empty time zone",
      patch: () => ({ timezone: "" }),
      at: "timezone",
      says: "Time zone: Not a known time zone.",
    },
    {
      name: "a time zone that is not a string",
      patch: () => ({ timezone: 5 as unknown as string }),
      at: "timezone",
      says: "Time zone: Not a valid value.",
    },
    {
      // A required field takes no null: only the optional ones are removed
      // that way.
      name: "a null name",
      patch: () => ({ name: null }) as unknown as CalendarPatch,
      at: "name",
      says: "Name: Not a valid value.",
    },
    {
      name: "a blank name",
      patch: () => ({ name: "   " }),
      at: "name",
      says: "Name: Can't be empty.",
    },
    {
      name: "a colour that is not a calendar colour",
      patch: () => ({ color: "purple" }) as unknown as CalendarPatch,
      at: "color",
      says: "Colour: Not a calendar colour.",
    },
    {
      name: "a null colour",
      patch: () => ({ color: null }) as unknown as CalendarPatch,
      at: "color",
      says: "Colour: Not a calendar colour.",
    },
    {
      name: "a null team",
      patch: () => ({ teamMemberIds: null }) as unknown as CalendarPatch,
      at: "teamMemberIds",
      says: "Team members: Not a valid value.",
    },
    {
      name: "an empty team member id",
      patch: () => ({ teamMemberIds: [""] }),
      at: "teamMemberIds.0",
      says: "Team members: Not a valid value.",
    },
    {
      name: "a null active switch",
      patch: () => ({ isActive: null }) as unknown as CalendarPatch,
      at: "isActive",
      says: "Active: Not a valid value.",
    },
    {
      name: "an active switch that is not true or false",
      patch: () => ({ isActive: "yes" }) as unknown as CalendarPatch,
      at: "isActive",
      says: "Active: Not a valid value.",
    },
    {
      name: "a description that is not a string",
      patch: () => ({ description: 5 }) as unknown as CalendarPatch,
      at: "description",
      says: "Description: Not a valid value.",
    },
    {
      name: "a patch that is not an object (a JSON body of null)",
      patch: () => null as unknown as CalendarPatch,
      at: undefined,
      says: "Calendar settings: Not a valid value.",
    },
  ];

  it.each(BAD_PATCHES)(
    "rejects $name with a 422 and leaves the calendar unchanged",
    async ({ patch, at, says }) => {
      const { api, discovery } = await loadWorld(ZONES[0]!);
      const before = await settle(api.get(discovery.id));

      await expect(
        settle(api.update(discovery.id, patch(discovery))),
      ).rejects.toMatchObject({
        status: 422,
        code: "INVALID_CALENDAR",
        field: at,
        message: says,
      });
      expect(await settle(api.get(discovery.id))).toEqual(before);
    },
  );

  it("saves touching windows", async () => {
    // The slot engine reads windows half-open, so 12:00 belongs to the second.
    const { api, discovery, slots } = await loadWorld(ZONES[0]!);
    await settle(
      api.update(
        discovery.id,
        tuesday(["09:00", "12:00"], ["12:00", "17:00"])(discovery),
      ),
    );
    expect(await slots(discovery, "2026-10-27")).toEqual(DISCOVERY_TUESDAY);
  });

  it("saves a valid name, description, colour, team and active state", async () => {
    const { api, discovery, strategy, slots } = await loadWorld(ZONES[0]!);
    const before = await settle(api.get(discovery.id));
    const changes = {
      description: "First chat with a new lead.",
      color: "sky" as const,
      teamMemberIds: [strategy.teamMemberIds[0]!],
      isActive: false,
    };

    const saved = await settle(
      api.update(discovery.id, { ...changes, name: "  Intro Call  " }),
    );
    const stored = await settle(api.get(discovery.id));

    for (const calendar of [saved, stored]) {
      expect(calendar).toEqual({
        ...before,
        ...changes,
        name: "Intro Call",
        updatedAt: expect.any(String),
      });
    }
    // Inactive took effect: the calendar no longer offers slots.
    await expect(slots(discovery, "2026-10-27")).rejects.toMatchObject({
      status: 409,
      code: "CALENDAR_INACTIVE",
    });
  });

  it("re-saves every seeded calendar's own settings", async () => {
    // Every field at once, as a client that round-trips the whole record
    // would send it: the server-owned keys (id, slug, type, timestamps) are
    // ignored, so the record saves as it was.
    const { api } = await loadWorld(ZONES[0]!);
    for (const calendar of await settle(api.list())) {
      await expect(
        settle(api.update(calendar.id, calendar)),
      ).resolves.toMatchObject({ ...calendar, updatedAt: expect.any(String) });
    }
  });
});

/**
 * A patch says only what it changes. A key set to `undefined` is the same as
 * a missing one, as it would be once the patch went over the wire as JSON, so
 * `null` is how a caller removes an optional field, the daily cap or the
 * description. Keys `update()` does not let a caller change are dropped.
 */
describe("update() merges only what the patch defines", () => {
  it("ignores keys set to undefined and saves the rest", async () => {
    const { api, discovery, slots } = await loadWorld(ZONES[0]!);
    const before = await settle(api.get(discovery.id));

    const saved = await settle(
      api.update(discovery.id, {
        timezone: undefined,
        name: undefined,
        isActive: undefined,
        availability: undefined,
        maxBookingsPerDay: undefined,
        bufferBeforeMin: 5,
      }),
    );
    const stored = await settle(api.get(discovery.id));

    for (const calendar of [saved, stored]) {
      expect(calendar.timezone).toBe("America/Los_Angeles");
      expect(calendar).toEqual({
        ...before,
        bufferBeforeMin: 5,
        updatedAt: expect.any(String),
      });
      // `toEqual` reads a key holding `undefined` as a missing one, so it
      // cannot see a key the patch wrote as `undefined`.
      expect(
        Object.entries(calendar).filter(([, value]) => value === undefined),
      ).toEqual([]);
    }
    expect(stored).toMatchObject({
      name: "Discovery Call",
      isActive: true,
      maxBookingsPerDay: 6,
    });
    // Still read in Los Angeles: the slots are its wall-clock hours.
    expect(await slots(discovery, "2026-10-27")).toEqual(DISCOVERY_TUESDAY);
  });

  it("clears the daily cap with null, and only with null", async () => {
    // Strategy Session takes three a day, 60-minute slots with 10/15-minute
    // buffers: with these three booked, the buffers leave only 18:00Z.
    const { api, strategy, slots, book } = await loadWorld(ZONES[0]!);
    for (const startAt of [
      "2026-10-27T16:00:00.000Z",
      "2026-10-27T20:00:00.000Z",
      "2026-10-27T22:00:00.000Z",
    ]) {
      await book(strategy, startAt);
    }
    expect(await slots(strategy, "2026-10-27")).toEqual([]);

    await settle(api.update(strategy.id, { maxBookingsPerDay: undefined }));
    expect(await settle(api.get(strategy.id))).toMatchObject({
      maxBookingsPerDay: 3,
    });
    expect(await slots(strategy, "2026-10-27")).toEqual([]);

    const saved = await settle(
      api.update(strategy.id, { maxBookingsPerDay: null }),
    );
    // Removed, never stored as null: an absent key is how a calendar with no
    // cap already reads (Onboarding Kickoff is seeded that way).
    expect(saved).not.toHaveProperty("maxBookingsPerDay");
    expect(await settle(api.get(strategy.id))).not.toHaveProperty(
      "maxBookingsPerDay",
    );
    expect(await slots(strategy, "2026-10-27")).toEqual([
      "2026-10-27T18:00:00.000Z",
    ]);

    // A cap can be set again afterwards.
    await settle(api.update(strategy.id, { maxBookingsPerDay: 2 }));
    expect(await slots(strategy, "2026-10-27")).toEqual([]);
  });

  it("removes the description with null, and only with null", async () => {
    const { api, discovery } = await loadWorld(ZONES[0]!);

    await settle(api.update(discovery.id, { description: undefined }));
    expect(await settle(api.get(discovery.id))).toMatchObject({
      description: "30-minute intro call for new leads.",
    });

    const saved = await settle(api.update(discovery.id, { description: null }));
    // Removed, never stored as null, as the daily cap is.
    expect(saved).not.toHaveProperty("description");
    expect(await settle(api.get(discovery.id))).not.toHaveProperty(
      "description",
    );

    // A description can be set again afterwards.
    await settle(api.update(discovery.id, { description: "Back again." }));
    expect(await settle(api.get(discovery.id))).toMatchObject({
      description: "Back again.",
    });
  });

  it("keeps the calendar's id, slug, type and timestamps, and stores nothing it does not know", async () => {
    // What a JSON client could send: server-owned keys, a key the API has
    // never heard of, and extra keys inside the weekly hours.
    const { api, discovery } = await loadWorld(ZONES[0]!);
    const before = await settle(api.get(discovery.id));
    const ids = (await settle(api.list())).map((c) => c.id);
    const sent = {
      id: "cal_other",
      slug: "elsewhere",
      type: "class",
      createdAt: "1999-01-01T00:00:00.000Z",
      updatedAt: "2099-01-01T00:00:00.000Z",
      createdBy: "usr_x",
      foo: "bar",
      bufferAfterMin: 20,
      availability: before.availability.map((rule) => ({
        ...rule,
        note: "extra",
        windows: rule.windows.map((hours) => ({ ...hours, label: "extra" })),
      })),
    };

    const saved = await settle(
      api.update(discovery.id, sent as unknown as CalendarPatch),
    );
    const stored = await settle(api.get(discovery.id));

    for (const calendar of [saved, stored]) {
      // `toEqual` fails on any key `before` lacks, at every depth: `foo`,
      // `createdBy`, a rule's `note`, a window's `label`.
      expect(calendar).toEqual({
        ...before,
        bufferAfterMin: 20,
        updatedAt: expect.any(String),
      });
      expect(calendar.createdAt).toBe(before.createdAt);
      expect(calendar.updatedAt).not.toBe(sent.updatedAt);
      expect(calendar).not.toHaveProperty("foo");
      expect(calendar).not.toHaveProperty("createdBy");
    }
    await expect(settle(api.get("cal_other"))).rejects.toMatchObject({
      status: 404,
    });
    expect((await settle(api.list())).map((c) => c.id)).toEqual(ids);
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
