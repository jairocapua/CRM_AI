import { z } from "zod";

import { isCalendarDay } from "@/lib/dates";

/**
 * The booking dialog's fields, in the order it asks for them. `day` is a
 * viewer-local calendar day; `startAt` is one of the instants
 * `api.calendars.availableSlots()` offered, as an ISO string. Whether that
 * instant is still free is the API's to say (`book()` answers 409), not the
 * form's.
 *
 * `day` is checked with `isCalendarDay`, the same rule the calendars page and
 * `availableSlots()` apply, so the form never accepts a day they refuse.
 */
export const bookingFormSchema = z.object({
  calendarId: z.string().min(1, "Pick a calendar."),
  contactId: z.string().min(1, "Pick a contact."),
  day: z.string().refine(isCalendarDay, "Pick a day."),
  startAt: z.string().min(1, "Pick a time."),
});

export type BookingFormValues = z.infer<typeof bookingFormSchema>;
