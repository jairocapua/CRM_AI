import { describe, expect, it, vi } from "vitest";

import { calendarDaysFor, slotsOnLocalDay } from "./booking-slots";

/**
 * The booking dialog's day mapping. The viewer picks a day in their own zone;
 * `availableSlots()` takes dates in the calendar's zone. From Asia one local
 * day overlaps two Los Angeles dates, so the dialog asks for each of them and
 * keeps the slots that fall on the viewer's day.
 *
 * The setup file runs every test in UTC; each case sets the viewer's zone
 * with `vi.stubEnv("TZ", ...)` and first proves it took. Expectations are
 * written out by hand from the zones' offsets, so nothing here shares
 * arithmetic with the code under test.
 */

const LA = "America/Los_Angeles";

function inZone(zone: string, probe: string, offset: number) {
  vi.stubEnv("TZ", zone);
  // A TZ override that silently failed would run every case in UTC.
  expect(new Date(probe).getTimezoneOffset()).toBe(offset);
}

describe("calendarDaysFor", () => {
  it("maps a Singapore day onto the two Los Angeles dates it overlaps", () => {
    inZone("Asia/Singapore", "2026-09-15T12:00:00Z", -480);
    // 00:00 SGT on the 15th is 09:00 PDT on the 14th; the day ends at 08:59
    // PDT on the 15th.
    expect(calendarDaysFor("2026-09-15", LA)).toEqual([
      "2026-09-14",
      "2026-09-15",
    ]);
  });

  it("is the day itself when the viewer shares the calendar's zone", () => {
    inZone(LA, "2026-09-15T12:00:00Z", 420);
    expect(calendarDaysFor("2026-09-15", LA)).toEqual(["2026-09-15"]);
  });

  it("maps a UTC day onto the two Los Angeles dates it overlaps", () => {
    inZone("UTC", "2026-09-15T12:00:00Z", 0);
    // 00:00Z on the 15th is 17:00 PDT on the 14th; 23:59Z is 16:59 PDT on
    // the 15th. The UTC day is not the answer.
    expect(calendarDaysFor("2026-09-15", LA)).toEqual([
      "2026-09-14",
      "2026-09-15",
    ]);
  });

  it("keeps the 25-hour fall-back day on one date for a Los Angeles viewer", () => {
    inZone(LA, "2026-10-31T12:00:00Z", 420);
    // 2026-11-01 runs 07:00Z to 08:00Z the next day, all of it the 1st.
    expect(calendarDaysFor("2026-11-01", LA)).toEqual(["2026-11-01"]);
  });

  it("maps a UTC day across the fall-back onto two dates", () => {
    inZone("UTC", "2026-11-01T12:00:00Z", 0);
    // 00:00Z is 17:00 PDT on 31 October; 23:59Z is 15:59 PST on the 1st.
    expect(calendarDaysFor("2026-11-01", LA)).toEqual([
      "2026-10-31",
      "2026-11-01",
    ]);
  });

  it("walks every date between the ends when a long day spans three", () => {
    // St John's falls back on 2026-11-01 (NDT -2:30 to NST -3:30), so that
    // day lasts 25 hours: 02:30Z on the 1st to 03:30Z on the 2nd. In São
    // Paulo (-3:00, no DST) that is 23:30 on 31 October to 00:30 on the 2nd.
    inZone("America/St_Johns", "2026-10-31T12:00:00Z", 150);
    expect(calendarDaysFor("2026-11-01", "America/Sao_Paulo")).toEqual([
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
    ]);
  });

  it("rejects a day that does not exist", () => {
    expect(() => calendarDaysFor("2026-02-30", LA)).toThrow(RangeError);
  });
});

describe("slotsOnLocalDay", () => {
  it("keeps the slots on the viewer's day from every date's list, in order", () => {
    inZone("Asia/Singapore", "2026-09-15T12:00:00Z", -480);
    // The 14th's and the 15th's Los Angeles slots, as availableSlots()
    // returns them. Singapore's 15th runs 16:00Z on the 14th to 16:00Z on
    // the 15th.
    const la14 = [
      "2026-09-14T16:00:00.000Z", // 00:00 SGT 15th: kept
      "2026-09-14T22:30:00.000Z", // 06:30 SGT 15th: kept
    ];
    const la15 = [
      "2026-09-15T15:30:00.000Z", // 23:30 SGT 15th: kept
      "2026-09-15T16:00:00.000Z", // 00:00 SGT 16th: dropped
      "2026-09-15T20:00:00.000Z", // 04:00 SGT 16th: dropped
    ];
    // Lists arrive in either order; the result is by time.
    expect(slotsOnLocalDay([la15, la14], "2026-09-15")).toEqual([
      "2026-09-14T16:00:00.000Z",
      "2026-09-14T22:30:00.000Z",
      "2026-09-15T15:30:00.000Z",
    ]);
  });

  it("holds the day's edges: 00:00 and 23:59 in, the minutes either side out", () => {
    inZone("Asia/Singapore", "2026-09-15T12:00:00Z", -480);
    expect(
      slotsOnLocalDay(
        [
          [
            "2026-09-14T15:59:00.000Z", // 23:59 SGT 14th
            "2026-09-14T16:00:00.000Z", // 00:00 SGT 15th
            "2026-09-15T15:59:00.000Z", // 23:59 SGT 15th
            "2026-09-15T16:00:00.000Z", // 00:00 SGT 16th
          ],
        ],
        "2026-09-15",
      ),
    ).toEqual(["2026-09-14T16:00:00.000Z", "2026-09-15T15:59:00.000Z"]);
  });

  it("lists one instant once, however it is spelled", () => {
    inZone("Asia/Singapore", "2026-09-15T12:00:00Z", -480);
    expect(
      slotsOnLocalDay(
        [
          ["2026-09-15T01:00:00.000Z", "2026-09-15T02:00:00.000Z"],
          ["2026-09-15T01:00:00+00:00", "2026-09-15T09:00:00+08:00"],
        ],
        "2026-09-15",
      ),
    ).toEqual(["2026-09-15T01:00:00.000Z", "2026-09-15T02:00:00.000Z"]);
  });

  it("is empty when nothing is offered", () => {
    expect(slotsOnLocalDay([], "2026-09-15")).toEqual([]);
    expect(slotsOnLocalDay([[], []], "2026-09-15")).toEqual([]);
  });
});
