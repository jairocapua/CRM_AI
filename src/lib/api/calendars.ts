import type { Activity, Appointment, Calendar, ID, ISODate } from "@/types";
import { db } from "@/lib/mock/db";
import { newId } from "@/lib/mock/ids";
import { invalidate } from "./cache";
import { apiNowMs, notFound, nowIso, simulate } from "./http";

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
      const from = nowIso();
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

export type AppointmentDraft = Partial<Appointment> &
  Pick<Appointment, "calendarId" | "contactId" | "startAt">;

export async function book(draft: AppointmentDraft): Promise<Appointment> {
  const appointment = await simulate(
    () => {
      const state = db.getState();
      const calendar =
        state.calendars[draft.calendarId] ??
        notFound("Calendar", draft.calendarId);
      const contact = state.contacts[draft.contactId];
      const at = nowIso();

      const endAt =
        draft.endAt ??
        new Date(
          new Date(draft.startAt).getTime() + calendar.slotDurationMin * 60_000,
        ).toISOString();

      const record: Appointment = {
        id: newId("appt"),
        title:
          draft.title ??
          `${calendar.name} - ${contact?.firstName ?? ""} ${contact?.lastName ?? ""}`.trim(),
        timezone: calendar.timezone,
        status: "confirmed",
        source: "manual",
        assignedUserId: calendar.teamMemberIds[0] ?? state.currentUserId,
        createdAt: at,
        updatedAt: at,
        ...draft,
        endAt,
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

export async function setStatus(
  id: ID,
  status: Appointment["status"],
): Promise<Appointment> {
  const appointment = await simulate(() => {
    const prev = db.getState().appointments[id] ?? notFound("Appointment", id);
    const at = nowIso();
    const next: Appointment = { ...prev, status, updatedAt: at };

    const activity: Activity = {
      id: newId("act"),
      type: "appointment.status_changed",
      at,
      contactId: next.contactId,
      appointmentId: next.id,
      actorId: db.getState().currentUserId,
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
 * Free slots for one day: the calendar's availability windows for that weekday,
 * minus existing bookings, minus buffers, minus the minimum scheduling notice.
 */
export async function availableSlots(
  calendarId: ID,
  dayIso: ISODate,
): Promise<string[]> {
  return simulate(
    () => {
      const state = db.getState();
      const calendar =
        state.calendars[calendarId] ?? notFound("Calendar", calendarId);

      const day = new Date(dayIso);
      day.setHours(0, 0, 0, 0);
      const weekday = day.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
      const rule = calendar.availability.find((r) => r.weekday === weekday);
      if (!rule?.enabled) return [];

      const dayStart = day.getTime();
      const dayEnd = dayStart + 86_400_000;
      const taken = Object.values(state.appointments).filter(
        (a) =>
          a.calendarId === calendarId &&
          a.status !== "cancelled" &&
          new Date(a.startAt).getTime() < dayEnd &&
          new Date(a.endAt).getTime() > dayStart,
      );

      if (
        calendar.maxBookingsPerDay &&
        taken.length >= calendar.maxBookingsPerDay
      ) {
        return [];
      }

      const notBefore =
        apiNowMs() + calendar.minSchedulingNoticeHours * 3_600_000;
      const slots: string[] = [];

      for (const window of rule.windows) {
        const [startHour = 9, startMinute = 0] = window.start
          .split(":")
          .map(Number);
        const [endHour = 17, endMinute = 0] = window.end.split(":").map(Number);

        let cursor = new Date(day);
        cursor.setHours(startHour, startMinute, 0, 0);
        const windowEnd = new Date(day);
        windowEnd.setHours(endHour, endMinute, 0, 0);

        while (
          cursor.getTime() + calendar.slotDurationMin * 60_000 <=
          windowEnd.getTime()
        ) {
          const slotStart = cursor.getTime();
          const slotEnd = slotStart + calendar.slotDurationMin * 60_000;

          const blocked = taken.some((a) => {
            const bookedStart =
              new Date(a.startAt).getTime() - calendar.bufferBeforeMin * 60_000;
            const bookedEnd =
              new Date(a.endAt).getTime() + calendar.bufferAfterMin * 60_000;
            return slotStart < bookedEnd && slotEnd > bookedStart;
          });

          if (!blocked && slotStart >= notBefore) {
            slots.push(new Date(slotStart).toISOString());
          }

          cursor = new Date(slotStart + calendar.slotIntervalMin * 60_000);
        }
      }

      return slots;
    },
    { canFail: false },
  );
}
