import type { AppointmentRow } from "@/lib/api";
import { localStartDay } from "./month-grid";

/**
 * Where focus goes when an appointment's details close and the button that
 * opened them has left the screen; without somewhere to go, focus would fall
 * to `<body>`. In order: the appointment's own chip or block, if it is back
 * (after Undo, as a new element); else the "+N more" of the day it is filed
 * under; else null, and the caller keeps Base UI's default.
 *
 * Both views draw an appointment as `li[data-appointment-id] > button`: a
 * month chip, or a week or day block (for one cut at midnight, its first
 * part), so the first lookup serves every view. Only month view has "+N more"
 * (`[data-day] [data-day-more]`), where a cancel can move the chip behind it
 * (live appointments are listed first); in week and day view the second
 * lookup finds nothing.
 *
 * Appointment ids, seeded or booked, are a prefix and a nanoid
 * (`appt_` + `[0-9a-z]`), so they need no escaping inside a quoted attribute
 * selector.
 */
export function appointmentFocusFallback(
  root: ParentNode,
  appointment: Pick<AppointmentRow, "id" | "startAt">,
): HTMLElement | null {
  return (
    root.querySelector<HTMLElement>(
      `li[data-appointment-id="${appointment.id}"] > button`,
    ) ??
    root.querySelector<HTMLElement>(
      `[data-day="${localStartDay(appointment.startAt)}"] [data-day-more]`,
    )
  );
}
