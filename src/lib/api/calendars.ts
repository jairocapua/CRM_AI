import type { Activity, Appointment, Calendar, ID, ISODate } from "@/types";
import { db } from "@/lib/mock/db";
import { newId } from "@/lib/mock/ids";
import {
  freeSlots,
  hasRoomFor,
  intervalOf,
  isCalendarDay,
  liveBookings,
  zonedDay,
} from "@/lib/mock/slots";
import { invalidate } from "./cache";
import { ApiError, apiNowMs, notFound, nowIso, simulate } from "./http";

export async function list(): Promise<Calendar[]> {
  return simulate(
    () =>
      Object.values(db.getState().calendars).sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    { canFail: false },
  );
}

export async function get(id: ID): Promise<Calendar> {
  return simulate(
    () => db.getState().calendars[id] ?? notFound("Calendar", id),
    { canFail: false },
  );
}

export async function update(
  id: ID,
  patch: Partial<Calendar>,
): Promise<Calendar> {
  const calendar = await simulate(() => {
    const prev = db.getState().calendars[id] ?? notFound("Calendar", id);
    const next: Calendar = { ...prev, ...patch, id, updatedAt: nowIso() };
    db.setState((s) => ({ calendars: { ...s.calendars, [id]: next } }));
    return next;
  });
  invalidate("calendars", "appointments");
  return calendar;
}

export interface AppointmentRow extends Appointment {
  contactName: string;
  calendarName: string;
  calendarColor: Calendar["color"];
}

function decorate(appointments: Appointment[]): AppointmentRow[] {
  const { contacts, calendars } = db.getState();
  return appointments.map((a) => {
    const contact = contacts[a.contactId];
    const calendar = calendars[a.calendarId];
    return {
      ...a,
      contactName: contact
        ? `${contact.firstName} ${contact.lastName}`
        : "Unknown contact",
      calendarName: calendar?.name ?? "Calendar",
      calendarColor: calendar?.color ?? "slate",
    };
  });
}

/** Appointments overlapping [from, to). Both bounds are ISO strings. */
export async function listAppointments(range: {
  from: ISODate;
  to: ISODate;
  calendarIds?: ID[];
}): Promise<AppointmentRow[]> {
  return simulate(
    () => {
      const rows = Object.values(db.getState().appointments).filter((a) => {
        if (a.startAt >= range.to || a.endAt <= range.from) return false;
        if (range.calendarIds && !range.calendarIds.includes(a.calendarId)) {
          return false;
        }
        return true;
      });
      return decorate(rows).sort((a, b) => a.startAt.localeCompare(b.startAt));
    },
    { canFail: false },
  );
}

export async function listUpcoming(limit = 6): Promise<AppointmentRow[]> {
  return simulate(
    () => {
      // `apiNowMs`, not `nowIso`: a read must not advance the clock's
      // persisted high-water mark.
      const from = new Date(apiNowMs()).toISOString();
      const rows = Object.values(db.getState().appointments)
        .filter((a) => a.startAt >= from && a.status === "confirmed")
        .sort((a, b) => a.startAt.localeCompare(b.startAt))
        .slice(0, limit);
      return decorate(rows);
    },
    { canFail: false },
  );
}

export async function listForContact(contactId: ID): Promise<AppointmentRow[]> {
  return simulate(
    () => {
      const rows = Object.values(db.getState().appointments)
        .filter((a) => a.contactId === contactId)
        .sort((a, b) => b.startAt.localeCompare(a.startAt));
      return decorate(rows);
    },
    { canFail: false },
  );
}

/**
 * What a caller supplies to book a slot. The rest is derived: a booking always
 * lasts the calendar's slot length, in the calendar's zone, and starts out
 * confirmed. `source` is an enum value and stays one; a booking made by an
 * automation says `"workflow"` and carries no reference to the workflow.
 */
export type AppointmentDraft = Pick<
  Appointment,
  "calendarId" | "contactId" | "startAt"
> &
  Partial<
    Pick<
      Appointment,
      "title" | "notes" | "location" | "assignedUserId" | "source"
    >
  >;

/**
 * Books one of the calendar's free slots. `startAt` must be exactly one of
 * the instants `availableSlots()` offers for that day (any ISO spelling of
 * it); anything else is a 409. With the matching check in `setStatus()`, a
 * double booking cannot happen through the API, and neither can a booking
 * inside another's buffers, in whichever order the two were made.
 */
export async function book(draft: AppointmentDraft): Promise<Appointment> {
  const appointment = await simulate(
    () => {
      const state = db.getState();
      const calendar =
        state.calendars[draft.calendarId] ??
        notFound("Calendar", draft.calendarId);

      const startMs = Date.parse(draft.startAt);
      if (Number.isNaN(startMs)) {
        throw new ApiError(
          `"${draft.startAt}" is not a date and time.`,
          422,
          "INVALID_START",
        );
      }
      const startAt = new Date(startMs).toISOString();

      // The check and the write below run in one synchronous block, so two
      // bookings racing for the same slot cannot both pass it.
      const offered = freeSlots({
        calendar,
        day: zonedDay(startMs, calendar.timezone),
        appointments: Object.values(state.appointments),
        nowMs: apiNowMs(),
      });
      if (!offered.includes(startAt)) {
        throw new ApiError(
          "That time is not an open slot on this calendar. Pick another one.",
          409,
          "SLOT_UNAVAILABLE",
        );
      }

      const contact = state.contacts[draft.contactId];
      const at = nowIso();

      // Field by field, never a spread of the draft: a caller must not be able
      // to set the id, the status or the end time.
      const record: Appointment = {
        id: newId("appt"),
        calendarId: calendar.id,
        contactId: draft.contactId,
        assignedUserId:
          draft.assignedUserId ??
          calendar.teamMemberIds[0] ??
          state.currentUserId,
        title:
          draft.title ??
          `${calendar.name} - ${contact?.firstName ?? ""} ${contact?.lastName ?? ""}`.trim(),
        ...(draft.notes ? { notes: draft.notes } : {}),
        startAt,
        endAt: new Date(
          startMs + calendar.slotDurationMin * 60_000,
        ).toISOString(),
        timezone: calendar.timezone,
        status: "confirmed",
        ...(draft.location ? { location: draft.location } : {}),
        source: draft.source ?? "manual",
        createdAt: at,
        updatedAt: at,
      };

      const activity: Activity = {
        id: newId("act"),
        type: "appointment.booked",
        at,
        contactId: record.contactId,
        appointmentId: record.id,
        actorId: state.currentUserId,
        summary: `Booked "${record.title}"`,
      };

      db.setState((s) => ({
        appointments: { ...s.appointments, [record.id]: record },
        activities: { ...s.activities, [activity.id]: activity },
      }));

      return record;
    },
    { ms: 420 },
  );

  invalidate("appointments", "activities", "analytics");
  return appointment;
}

/**
 * Moves an appointment to `status`. Moving a cancelled one to any other status
 * takes its time back, so it is a 409 if another booking has taken that time
 * (or filled that day) since: the collision and daily-cap rules `book()`
 * applies. Its hours, notice and booking range are not rechecked.
 */
export async function setStatus(
  id: ID,
  status: Appointment["status"],
): Promise<Appointment> {
  const appointment = await simulate(() => {
    const state = db.getState();
    const prev = state.appointments[id] ?? notFound("Appointment", id);

    // Checked in the same synchronous block as the write, as in `book()`.
    if (prev.status === "cancelled" && status !== "cancelled") {
      const calendar =
        state.calendars[prev.calendarId] ??
        notFound("Calendar", prev.calendarId);
      const booked = liveBookings(
        calendar.id,
        Object.values(state.appointments),
      );
      if (!hasRoomFor(calendar, intervalOf(prev), booked)) {
        throw new ApiError(
          "Another booking has taken this time since it was cancelled. Book a new slot instead.",
          409,
          "SLOT_UNAVAILABLE",
        );
      }
    }

    const at = nowIso();
    const next: Appointment = { ...prev, status, updatedAt: at };

    const activity: Activity = {
      id: newId("act"),
      type: "appointment.status_changed",
      at,
      contactId: next.contactId,
      appointmentId: next.id,
      actorId: state.currentUserId,
      summary: `Appointment marked ${status.replace("_", " ")}`,
    };

    db.setState((s) => ({
      appointments: { ...s.appointments, [id]: next },
      activities: { ...s.activities, [activity.id]: activity },
    }));
    return next;
  });

  invalidate("appointments", "activities", "analytics");
  return appointment;
}

export async function cancel(id: ID): Promise<Appointment> {
  return setStatus(id, "cancelled");
}

/**
 * The start times a calendar offers on one day, as ISO strings: its
 * availability windows for that weekday, minus every slot that collides with
 * a live booking (buffers apply both ways, so neighbours keep a gap of the
 * larger buffer whichever was booked first), minus the minimum scheduling
 * notice, and nothing beyond `dateRangeDays`. See `@/lib/mock/slots` for the
 * time model.
 *
 * `day` is a calendar date, "YYYY-MM-DD", in the calendar's own timezone, not
 * the viewer's: from Asia one local day spans two Los Angeles dates, so the
 * caller maps the day it shows onto the calendar's dates. Anything that is not
 * a real "YYYY-MM-DD" date is rejected with a 422.
 */
export async function availableSlots(
  calendarId: ID,
  day: string,
): Promise<string[]> {
  return simulate(
    () => {
      const state = db.getState();
      const calendar =
        state.calendars[calendarId] ?? notFound("Calendar", calendarId);
      if (!isCalendarDay(day)) {
        throw new ApiError(
          `"${day}" is not a calendar day (expected YYYY-MM-DD).`,
          422,
          "INVALID_DAY",
        );
      }

      return freeSlots({
        calendar,
        day,
        appointments: Object.values(state.appointments),
        // A read: `apiNowMs`, never `nowIso`, which advances the high-water mark.
        nowMs: apiNowMs(),
      });
    },
    { canFail: false },
  );
}
