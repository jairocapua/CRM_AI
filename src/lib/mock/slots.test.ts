import { describe, expect, it } from "vitest";

import type { AvailabilityWindow, Calendar } from "@/types";
import { freeSlots, slotGrid } from "./slots";

/**
 * The slot engine on a hand-built calendar: no store, no clock. Every
 * expectation is a literal list of UTC instants. Los Angeles is UTC-7 on
 * Tuesday 2026-10-27, so 09:00 there is 16:00Z.
 */

/** America/Los_Angeles, 30-minute slots every 30 minutes, open Tuesdays only. */
function tuesdayCalendar(...windows: AvailabilityWindow[]): Calendar {
  return {
    id: "cal_fixture",
    name: "Fixture",
    type: "simple",
    color: "indigo",
    slug: "fixture",
    timezone: "America/Los_Angeles",
    slotDurationMin: 30,
    slotIntervalMin: 30,
    bufferBeforeMin: 0,
    bufferAfterMin: 0,
    minSchedulingNoticeHours: 0,
    dateRangeDays: 30,
    teamMemberIds: [],
    availability: ([0, 1, 2, 3, 4, 5, 6] as const).map((weekday) => ({
      weekday,
      enabled: weekday === 2,
      windows: weekday === 2 ? windows : [],
    })),
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

const TUESDAY = "2026-10-27";

/** 09:00-12:00 PDT in 30-minute slots: each start once. */
const NINE_TO_NOON = [
  "2026-10-27T16:00:00.000Z",
  "2026-10-27T16:30:00.000Z",
  "2026-10-27T17:00:00.000Z",
  "2026-10-27T17:30:00.000Z",
  "2026-10-27T18:00:00.000Z",
  "2026-10-27T18:30:00.000Z",
];

const starts = (calendar: Calendar) =>
  slotGrid(calendar, TUESDAY).map((slot) => new Date(slot.start).toISOString());

describe("slotGrid()", () => {
  it("lists each start once when windows overlap", () => {
    const calendar = tuesdayCalendar(
      { start: "09:00", end: "11:00" },
      { start: "10:00", end: "12:00" },
    );
    expect(starts(calendar)).toEqual(NINE_TO_NOON);
  });

  it("lists each start once when one window nests in another", () => {
    const calendar = tuesdayCalendar(
      { start: "09:00", end: "12:00" },
      { start: "10:00", end: "11:00" },
    );
    expect(starts(calendar)).toEqual(NINE_TO_NOON);
  });
});

describe("freeSlots()", () => {
  it("offers each start once when windows overlap", () => {
    // The booking dialog renders this list as radio cards keyed by the
    // instant, so a repeated start would be a repeated key.
    const offered = freeSlots({
      calendar: tuesdayCalendar(
        { start: "09:00", end: "11:00" },
        { start: "10:00", end: "12:00" },
      ),
      day: TUESDAY,
      appointments: [],
      nowMs: Date.parse("2026-10-26T15:00:00.000Z"),
    });
    expect(offered).toEqual(NINE_TO_NOON);
  });
});
