import { describe, expect, it } from "vitest";

import type { AvailabilityRule } from "@/types";
import {
  WEEKDAY_LABELS,
  availabilitySchema,
  nextWindow,
  toAvailabilityForm,
  toAvailabilityPatch,
  type AvailabilityFormValues,
  type AvailabilitySettings,
} from "./availability";

/**
 * The availability editor's form rules and its converters to and from a
 * calendar. Windows are "HH:mm" wall-clock times; on an enabled day each one
 * must end after it starts and none may overlap another (touching is fine).
 * A disabled day's windows are not checked, since saving drops them. Each
 * error is pinned by its exact path and message, since that is what the
 * editor shows beside the field.
 */

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

/** Shaped like a seeded calendar: Mon–Fri 09:00–17:00, weekends off. */
const SEEDED: AvailabilitySettings = {
  availability: WEEKDAYS.map((weekday) => ({
    weekday,
    enabled: weekday >= 1 && weekday <= 5,
    windows:
      weekday >= 1 && weekday <= 5 ? [{ start: "09:00", end: "17:00" }] : [],
  })),
  slotDurationMin: 30,
  slotIntervalMin: 30,
  bufferBeforeMin: 0,
  bufferAfterMin: 10,
  minSchedulingNoticeHours: 4,
  dateRangeDays: 30,
};

const BASE = toAvailabilityForm(SEEDED);

/** The form with Tuesday's (weekday 2) rule replaced. */
function withTuesday(
  rule: Partial<AvailabilityRule>,
  values: AvailabilityFormValues = BASE,
): AvailabilityFormValues {
  return {
    ...values,
    availability: values.availability.map((r) =>
      r.weekday === 2 ? { ...r, ...rule } : r,
    ),
  };
}

const tuesdayWindows = (...windows: [string, string][]) =>
  withTuesday({
    enabled: true,
    windows: windows.map(([start, end]) => ({ start, end })),
  });

/** The messages zod reports, keyed by path. */
function errorsFor(values: unknown) {
  const result = availabilitySchema.safeParse(values);
  if (result.success) return {};
  return Object.fromEntries(
    result.error.issues.map((issue) => [issue.path.join("."), issue.message]),
  );
}

const REVERSED = "End time must be after the start time.";
const OVERLAP = "Overlaps another time window on this day.";

describe("availabilitySchema: windows", () => {
  it("accepts a seeded-style calendar as the editor loads it", () => {
    expect(availabilitySchema.safeParse(BASE)).toEqual({
      success: true,
      data: BASE,
    });
  });

  it("rejects a window that ends before it starts", () => {
    expect(errorsFor(tuesdayWindows(["17:00", "09:00"]))).toEqual({
      "availability.2.windows.0.end": REVERSED,
    });
  });

  it("rejects a zero-length window", () => {
    expect(errorsFor(tuesdayWindows(["09:00", "09:00"]))).toEqual({
      "availability.2.windows.0.end": REVERSED,
    });
  });

  it("rejects overlapping windows on one weekday", () => {
    expect(
      errorsFor(tuesdayWindows(["09:00", "12:00"], ["11:00", "13:00"])),
    ).toEqual({ "availability.2.windows.1.start": OVERLAP });
  });

  it("flags the later-starting window when the windows are listed out of order", () => {
    expect(
      errorsFor(tuesdayWindows(["11:00", "13:00"], ["09:00", "12:00"])),
    ).toEqual({ "availability.2.windows.0.start": OVERLAP });
  });

  it("flags a window nested in a long one even when the window between them does not overlap it", () => {
    // 12:00–13:00 clears 10:00–11:00 but sits inside 09:00–17:00.
    expect(
      errorsFor(
        tuesdayWindows(
          ["09:00", "17:00"],
          ["10:00", "11:00"],
          ["12:00", "13:00"],
        ),
      ),
    ).toEqual({
      "availability.2.windows.1.start": OVERLAP,
      "availability.2.windows.2.start": OVERLAP,
    });
  });

  it("flags only the second of two windows with the same start", () => {
    expect(
      errorsFor(tuesdayWindows(["09:00", "12:00"], ["09:00", "10:00"])),
    ).toEqual({ "availability.2.windows.1.start": OVERLAP });
  });

  it("reports a reversed window once, as reversed, not as an overlap too", () => {
    expect(
      errorsFor(tuesdayWindows(["09:00", "17:00"], ["12:00", "10:00"])),
    ).toEqual({ "availability.2.windows.1.end": REVERSED });
  });

  it("accepts touching windows", () => {
    expect(
      errorsFor(tuesdayWindows(["09:00", "12:00"], ["12:00", "17:00"])),
    ).toEqual({});
  });

  it("accepts the same hours on two different weekdays", () => {
    const values = withTuesday(
      { windows: [{ start: "08:00", end: "10:00" }] },
      {
        ...BASE,
        availability: BASE.availability.map((r) =>
          r.weekday === 3
            ? { ...r, windows: [{ start: "08:00", end: "10:00" }] }
            : r,
        ),
      },
    );
    expect(errorsFor(values)).toEqual({});
  });

  it("does not check a disabled day's windows", () => {
    expect(
      errorsFor(
        withTuesday({
          enabled: false,
          windows: [
            { start: "17:00", end: "09:00" },
            { start: "08:00", end: "18:00" },
            { start: "9:00", end: "" },
          ],
        }),
      ),
    ).toEqual({});
  });

  it.each([
    ["an unpadded hour", "9:00"],
    ["hour 24", "24:00"],
    ["minute 60", "12:60"],
    ["an empty time", ""],
    ["seconds", "09:00:00"],
  ])("rejects %s with 'Enter a time.'", (_, start) => {
    expect(errorsFor(tuesdayWindows([start, "17:00"]))).toEqual({
      "availability.2.windows.0.start": "Enter a time.",
    });
  });

  it("accepts the first and last minute of the day", () => {
    expect(errorsFor(tuesdayWindows(["00:00", "23:59"]))).toEqual({});
  });
});

describe("availabilitySchema: numbers", () => {
  it("rejects negative buffers, notice and range", () => {
    expect(
      errorsFor({
        ...BASE,
        bufferBeforeMin: -5,
        bufferAfterMin: -1,
        minSchedulingNoticeHours: -1,
        dateRangeDays: -1,
      }),
    ).toEqual({
      bufferBeforeMin: "Can't be negative.",
      bufferAfterMin: "Can't be negative.",
      minSchedulingNoticeHours: "Can't be negative.",
      dateRangeDays: "Can't be negative.",
    });
  });

  it("accepts zero buffers, notice and range", () => {
    expect(
      errorsFor({
        ...BASE,
        bufferBeforeMin: 0,
        bufferAfterMin: 0,
        minSchedulingNoticeHours: 0,
        dateRangeDays: 0,
      }),
    ).toEqual({});
  });

  it("rejects a zero slot duration and interval", () => {
    expect(
      errorsFor({ ...BASE, slotDurationMin: 0, slotIntervalMin: 0 }),
    ).toEqual({
      slotDurationMin: "Must be at least 1 minute.",
      slotIntervalMin: "Must be at least 1 minute.",
    });
  });

  it.each([
    ["an empty input (NaN)", Number.NaN],
    ["a fraction", 1.5],
  ])(
    "rejects %s in every number field with 'Enter a whole number.'",
    (_, n) => {
      expect(
        errorsFor({
          ...BASE,
          slotDurationMin: n,
          slotIntervalMin: n,
          bufferBeforeMin: n,
          bufferAfterMin: n,
          minSchedulingNoticeHours: n,
          dateRangeDays: n,
        }),
      ).toEqual({
        slotDurationMin: "Enter a whole number.",
        slotIntervalMin: "Enter a whole number.",
        bufferBeforeMin: "Enter a whole number.",
        bufferAfterMin: "Enter a whole number.",
        minSchedulingNoticeHours: "Enter a whole number.",
        dateRangeDays: "Enter a whole number.",
      });
    },
  );

  it("caps each number at a day, a year of hours and a year of days", () => {
    const atMost = {
      ...BASE,
      slotDurationMin: 1440,
      slotIntervalMin: 1440,
      bufferBeforeMin: 1440,
      bufferAfterMin: 1440,
      minSchedulingNoticeHours: 8760,
      dateRangeDays: 365,
    };
    expect(errorsFor(atMost)).toEqual({});
    expect(
      errorsFor({
        ...atMost,
        slotDurationMin: 1441,
        slotIntervalMin: 1441,
        bufferBeforeMin: 1441,
        bufferAfterMin: 1441,
        minSchedulingNoticeHours: 8761,
        dateRangeDays: 366,
      }),
    ).toEqual({
      slotDurationMin: "Can't be more than 1,440 minutes.",
      slotIntervalMin: "Can't be more than 1,440 minutes.",
      bufferBeforeMin: "Can't be more than 1,440 minutes.",
      bufferAfterMin: "Can't be more than 1,440 minutes.",
      minSchedulingNoticeHours: "Can't be more than 8,760 hours.",
      dateRangeDays: "Can't be more than 365 days.",
    });
  });
});

describe("toAvailabilityForm", () => {
  it("always gives seven rules, Sunday to Saturday, filling a missing weekday as disabled", () => {
    const form = toAvailabilityForm({
      ...SEEDED,
      // Out of order, and with no Sunday or Saturday at all.
      availability: [
        {
          weekday: 3,
          enabled: true,
          windows: [{ start: "10:00", end: "11:00" }],
        },
        {
          weekday: 1,
          enabled: true,
          windows: [{ start: "09:00", end: "17:00" }],
        },
      ],
    });
    expect(form.availability).toEqual([
      { weekday: 0, enabled: false, windows: [] },
      {
        weekday: 1,
        enabled: true,
        windows: [{ start: "09:00", end: "17:00" }],
      },
      { weekday: 2, enabled: false, windows: [] },
      {
        weekday: 3,
        enabled: true,
        windows: [{ start: "10:00", end: "11:00" }],
      },
      { weekday: 4, enabled: false, windows: [] },
      { weekday: 5, enabled: false, windows: [] },
      { weekday: 6, enabled: false, windows: [] },
    ]);
  });

  it("copies every number", () => {
    expect(toAvailabilityForm(SEEDED)).toMatchObject({
      slotDurationMin: 30,
      slotIntervalMin: 30,
      bufferBeforeMin: 0,
      bufferAfterMin: 10,
      minSchedulingNoticeHours: 4,
      dateRangeDays: 30,
    });
  });

  it("does not share window objects with the calendar", () => {
    const form = toAvailabilityForm(SEEDED);
    expect(form.availability[1]!.windows[0]).not.toBe(
      SEEDED.availability[1]!.windows[0],
    );
  });

  it("names the weekdays Sunday to Saturday, as the app's weeks run", () => {
    expect(WEEKDAY_LABELS).toEqual([
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ]);
  });
});

describe("toAvailabilityPatch", () => {
  it("round-trips a seeded calendar unchanged", () => {
    expect(toAvailabilityPatch(toAvailabilityForm(SEEDED))).toEqual(SEEDED);
  });

  it("drops a disabled day's windows and sorts an enabled day's by start", () => {
    const values: AvailabilityFormValues = {
      ...BASE,
      availability: BASE.availability.map((r) =>
        r.weekday === 1
          ? {
              ...r,
              enabled: false,
              windows: [{ start: "09:00", end: "17:00" }],
            }
          : r.weekday === 2
            ? {
                ...r,
                windows: [
                  { start: "13:00", end: "17:00" },
                  { start: "09:00", end: "12:00" },
                ],
              }
            : r,
      ),
      bufferAfterMin: 15,
    };
    const patch = toAvailabilityPatch(values);
    expect(patch.availability[1]).toEqual({
      weekday: 1,
      enabled: false,
      windows: [],
    });
    expect(patch.availability[2]).toEqual({
      weekday: 2,
      enabled: true,
      windows: [
        { start: "09:00", end: "12:00" },
        { start: "13:00", end: "17:00" },
      ],
    });
    expect(patch.bufferAfterMin).toBe(15);
  });
});

describe("nextWindow", () => {
  it("offers a working day on an empty day", () => {
    expect(nextWindow([])).toEqual({ start: "09:00", end: "17:00" });
  });

  it("starts an hour where the last window ends", () => {
    expect(nextWindow([{ start: "09:00", end: "12:00" }])).toEqual({
      start: "12:00",
      end: "13:00",
    });
  });

  it("starts after the latest end, whatever the order the windows are listed in", () => {
    expect(
      nextWindow([
        { start: "13:00", end: "15:00" },
        { start: "09:00", end: "12:00" },
      ]),
    ).toEqual({ start: "15:00", end: "16:00" });
  });

  it("stops at the last minute of the day", () => {
    expect(nextWindow([{ start: "20:00", end: "23:30" }])).toEqual({
      start: "23:30",
      end: "23:59",
    });
  });

  it("ignores windows whose end is not a time yet", () => {
    expect(nextWindow([{ start: "09:00", end: "" }])).toEqual({
      start: "09:00",
      end: "17:00",
    });
  });
});
