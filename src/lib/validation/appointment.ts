import { z } from "zod";

import type { AppointmentStatus, ISODate } from "@/types";
import { isCalendarDay } from "@/lib/dates";

/**
 * Appointment rules shared by the UI and the API: the booking form's fields,
 * and which statuses an appointment can still be moved to (P7-H3), which
 * `api.calendars.setStatus()` enforces and the details dialog offers.
 */

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

/**
 * Whether an appointment is over: its end is strictly before `nowMs`. One that
 * is still running, or exactly at its end instant, has not ended.
 *
 * `nowMs` must come from the demo clock (`apiNowMs()` / `apiNow()`), never
 * `new Date()`: seeded appointments are placed around the seed's anchor.
 */
export function hasEnded(endAt: ISODate, nowMs: number): boolean {
  return Date.parse(endAt) < nowMs;
}

/**
 * Whether an appointment can be moved to `status` (P7-H3, DECISIONS
 * 2026-10-23). Until it has ended (see `hasEnded`) any status is allowed; once
 * it has, only Showed and No Show are: a past appointment can no longer be
 * confirmed or cancelled. The rule names target statuses only, so an ended
 * appointment that was cancelled can still be marked Showed or No Show.
 *
 * `nowMs` must come from the demo clock, as for `hasEnded`.
 */
export function canMoveToStatus(
  endAt: ISODate,
  status: AppointmentStatus,
  nowMs: number,
): boolean {
  return !hasEnded(endAt, nowMs) || status === "showed" || status === "no_show";
}
