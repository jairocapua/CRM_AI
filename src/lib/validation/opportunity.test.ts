import { describe, expect, it, vi } from "vitest";

import {
  buildOpportunityFormSchema,
  dateInputToIso,
  isoToDateInput,
  type OpportunityFormValues,
} from "./opportunity";

/**
 * The deal form's Expected close field. `<input type="date">` writes
 * "YYYY-MM-DD"; the store holds an `ISODate`. A day is valid by the one shared
 * rule in `@/lib/dates` (the booking form and the calendars use it too), and
 * it is stored as the viewer's local midnight so that every screen shows the
 * day that was typed. The setup file runs in UTC; the zone cases set their own
 * with `vi.stubEnv("TZ", ...)` and first prove it took.
 */

function inZone(zone: string, offset: number) {
  vi.stubEnv("TZ", zone);
  // A TZ override that silently failed would run every case in UTC.
  expect(new Date("2026-09-08T00:00:00Z").getTimezoneOffset()).toBe(offset);
}

const ZONES: [string, number][] = [
  ["UTC", 0],
  ["Asia/Singapore", -480],
  ["America/Los_Angeles", 420],
];

describe("dateInputToIso", () => {
  it("treats an empty input as no date", () => {
    expect(dateInputToIso("")).toBeUndefined();
  });

  it.each([
    "0099-01-01",
    "0000-01-01",
    "26-09-08",
    "2026-9-8",
    "2026-09-08 ",
    "2026-02-30",
    "10000-01-01",
    "banana",
  ])("returns undefined for a day the shared rule refuses: %j", (value) => {
    expect(dateInputToIso(value)).toBeUndefined();
  });

  it.each<[string, number, Record<string, string>]>([
    [
      "UTC",
      0,
      {
        "2026-09-08": "2026-09-08T00:00:00.000Z",
        "2026-03-08": "2026-03-08T00:00:00.000Z",
        "2026-11-01": "2026-11-01T00:00:00.000Z",
      },
    ],
    [
      "Asia/Singapore",
      -480,
      {
        "2026-09-08": "2026-09-07T16:00:00.000Z",
        "2026-03-08": "2026-03-07T16:00:00.000Z",
        "2026-11-01": "2026-10-31T16:00:00.000Z",
      },
    ],
    [
      "America/Los_Angeles",
      420,
      {
        "2026-09-08": "2026-09-08T07:00:00.000Z",
        // The two 2026 daylight-saving days: midnight comes before the 02:00
        // switch, so it is still standard time in March and daylight time in
        // November.
        "2026-03-08": "2026-03-08T08:00:00.000Z",
        "2026-11-01": "2026-11-01T07:00:00.000Z",
      },
    ],
  ])("reads the day as local midnight in %s", (zone, offset, expected) => {
    inZone(zone, offset);
    for (const [day, iso] of Object.entries(expected)) {
      expect(dateInputToIso(day), day).toBe(iso);
    }
  });

  it.each(ZONES)("round-trips through isoToDateInput in %s", (zone, offset) => {
    inZone(zone, offset);
    // 0100-01-01 is asserted only as a round trip: before 1883 the zones ran
    // on local mean time (Los Angeles was -7:52:58), so its exact ISO is odd.
    for (const day of [
      "2026-09-08",
      "2028-02-29",
      "2026-03-08",
      "2026-11-01",
      "0100-01-01",
      "9999-12-31",
    ]) {
      expect(isoToDateInput(dateInputToIso(day)), day).toBe(day);
    }
  });

  it("keeps a seeded 17:00Z close on its day when re-saved east of UTC", () => {
    inZone("Asia/Singapore", -480);
    // 17:00Z on 5 November is 01:00 on 6 November in Singapore, so the form
    // shows the 6th. Reading the UTC date instead used to move it back a day
    // on every save.
    const shown = isoToDateInput("2026-11-05T17:00:00.000Z");
    expect(shown).toBe("2026-11-06");

    const firstSave = dateInputToIso(shown);
    expect(firstSave).toBe("2026-11-05T16:00:00.000Z");
    expect(isoToDateInput(firstSave)).toBe("2026-11-06");

    const secondSave = dateInputToIso(isoToDateInput(firstSave));
    expect(secondSave).toBe(firstSave);
  });
});

describe("buildOpportunityFormSchema expectedCloseAt", () => {
  const schema = buildOpportunityFormSchema([]);

  const COMPLETE: OpportunityFormValues = {
    name: "Renewal",
    contactId: "ct_1",
    pipelineId: "pl_1",
    stageId: "st_1",
    value: "",
    status: "open",
    source: "manual",
    ownerId: "",
    tagIds: [],
    expectedCloseAt: "",
    lostReason: "",
    customFields: {},
  };

  /** The messages zod reports, keyed by field. */
  function errorsFor(values: OpportunityFormValues) {
    const result = schema.safeParse(values);
    if (result.success) return {};
    return Object.fromEntries(
      result.error.issues.map((issue) => [issue.path.join("."), issue.message]),
    );
  }

  it("accepts a complete draft", () => {
    expect(schema.safeParse(COMPLETE)).toEqual({
      success: true,
      data: COMPLETE,
    });
  });

  it.each(["", "2026-12-01", "2028-02-29", "0100-01-01"])(
    "accepts no date and real days: %j",
    (expectedCloseAt) => {
      expect(errorsFor({ ...COMPLETE, expectedCloseAt })).toEqual({});
    },
  );

  // Each of these would otherwise reach `dateInputToIso`, come back undefined
  // and save as "no date": the user's typed day silently cleared.
  it.each(["0099-01-01", "0000-01-01", "2026-02-30", "10000-01-01"])(
    "rejects %j with 'Enter a valid date.'",
    (expectedCloseAt) => {
      expect(errorsFor({ ...COMPLETE, expectedCloseAt })).toEqual({
        expectedCloseAt: "Enter a valid date.",
      });
    },
  );
});
