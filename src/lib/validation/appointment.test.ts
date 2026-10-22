import { describe, expect, it } from "vitest";

import { bookingFormSchema, type BookingFormValues } from "./appointment";

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
