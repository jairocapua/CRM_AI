import { describe, expect, it } from "vitest";

import {
  bookingFormSchema,
  canMoveToStatus,
  hasEnded,
  type BookingFormValues,
} from "./appointment";

/**
 * The booking dialog's form rules: every field is required, and the day must
 * be a real "YYYY-MM-DD" date, as `<input type="date">` writes it. Each error
 * is pinned by its exact message, since that is what the dialog shows.
 */

const COMPLETE: BookingFormValues = {
  calendarId: "cal_1",
  contactId: "ct_1",
  day: "2026-09-09",
  startAt: "2026-09-08T16:00:00.000Z",
};

/** The messages zod reports, keyed by field. */
function errorsFor(values: BookingFormValues) {
  const result = bookingFormSchema.safeParse(values);
  if (result.success) return {};
  return Object.fromEntries(
    result.error.issues.map((issue) => [issue.path.join("."), issue.message]),
  );
}

describe("bookingFormSchema", () => {
  it("accepts a complete draft", () => {
    expect(bookingFormSchema.safeParse(COMPLETE)).toEqual({
      success: true,
      data: COMPLETE,
    });
  });

  it("rejects an empty calendar, contact and time with their messages", () => {
    expect(
      errorsFor({ ...COMPLETE, calendarId: "", contactId: "", startAt: "" }),
    ).toEqual({
      calendarId: "Pick a calendar.",
      contactId: "Pick a contact.",
      startAt: "Pick a time.",
    });
  });

  it.each([
    ["an empty day", ""],
    ["a day that does not exist", "2026-02-30"],
    ["a month that does not exist", "2026-13-01"],
    ["an instant rather than a day", "2026-09-09T00:00:00.000Z"],
    ["a day without zero padding", "2026-9-9"],
    ["a two-digit year that Date reads as 1999", "0099-01-01"],
    ["year zero", "0000-01-01"],
  ])("rejects %s with 'Pick a day.'", (_, day) => {
    expect(errorsFor({ ...COMPLETE, day })).toEqual({ day: "Pick a day." });
  });

  it("accepts a leap day only in a leap year", () => {
    expect(errorsFor({ ...COMPLETE, day: "2028-02-29" })).toEqual({});
    expect(errorsFor({ ...COMPLETE, day: "2026-02-29" })).toEqual({
      day: "Pick a day.",
    });
  });
});

/**
 * The P7-H3 status rule (DECISIONS 2026-10-23). The instants are written out
 * by hand around one end time, so nothing here shares arithmetic with the
 * rule: an appointment has ended once its end is strictly before now.
 */
const END = "2026-10-27T17:30:00.000Z";
const MINUTE_BEFORE_END = Date.parse("2026-10-27T17:29:00.000Z");
const AT_END = Date.parse("2026-10-27T17:30:00.000Z");
const MS_AFTER_END = Date.parse("2026-10-27T17:30:00.001Z");

describe("hasEnded", () => {
  it("is false while the appointment is still running", () => {
    expect(hasEnded(END, MINUTE_BEFORE_END)).toBe(false);
  });

  it("is false at the exact instant it ends", () => {
    expect(hasEnded(END, AT_END)).toBe(false);
  });

  it("is true a millisecond after it ends", () => {
    expect(hasEnded(END, MS_AFTER_END)).toBe(true);
  });
});

describe("canMoveToStatus", () => {
  it.each([
    {
      status: "confirmed",
      when: "at its end instant",
      now: AT_END,
      allowed: true,
    },
    {
      status: "showed",
      when: "at its end instant",
      now: AT_END,
      allowed: true,
    },
    {
      status: "no_show",
      when: "at its end instant",
      now: AT_END,
      allowed: true,
    },
    {
      status: "cancelled",
      when: "at its end instant",
      now: AT_END,
      allowed: true,
    },
    {
      status: "confirmed",
      when: "a millisecond after its end",
      now: MS_AFTER_END,
      allowed: false,
    },
    {
      status: "showed",
      when: "a millisecond after its end",
      now: MS_AFTER_END,
      allowed: true,
    },
    {
      status: "no_show",
      when: "a millisecond after its end",
      now: MS_AFTER_END,
      allowed: true,
    },
    {
      status: "cancelled",
      when: "a millisecond after its end",
      now: MS_AFTER_END,
      allowed: false,
    },
  ] as const)("allows $status $when: $allowed", ({ status, now, allowed }) => {
    expect(canMoveToStatus(END, status, now)).toBe(allowed);
  });
});
