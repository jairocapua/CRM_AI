import { isValid, parse } from "date-fns";
import { z } from "zod";

const DAY_INPUT = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Whether `value` is a real "YYYY-MM-DD" day, the format `<input type="date">`
 * writes. The pattern keeps out instants and unpadded dates; the parse keeps
 * out days that do not exist (2026-02-30), which date-fns rejects rather than
 * rolling over into March.
 */
function isDayInput(value: string): boolean {
  return (
    DAY_INPUT.test(value) && isValid(parse(value, "yyyy-MM-dd", new Date(0)))
  );
}

/**
 * The booking dialog's fields, in the order it asks for them. `day` is a
 * viewer-local calendar day; `startAt` is one of the instants
 * `api.calendars.availableSlots()` offered, as an ISO string. Whether that
 * instant is still free is the API's to say (`book()` answers 409), not the
 * form's.
 */
export const bookingFormSchema = z.object({
  calendarId: z.string().min(1, "Pick a calendar."),
  contactId: z.string().min(1, "Pick a contact."),
  day: z.string().refine(isDayInput, "Pick a day."),
  startAt: z.string().min(1, "Pick a time."),
});

export type BookingFormValues = z.infer<typeof bookingFormSchema>;
