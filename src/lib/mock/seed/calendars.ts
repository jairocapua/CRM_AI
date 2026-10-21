import type {
  Appointment,
  AppointmentStatus,
  AvailabilityRule,
  Calendar,
  Contact,
  User,
} from "@/types";
import { newId } from "../ids";
import {
  addDays,
  openSlots,
  zonedTime,
  type CalendarDay,
  type Interval,
} from "../slots";
import {
  REF_DATE,
  chance,
  int,
  pick,
  refDay,
  refPast,
  refPlusDays,
} from "./rng";

/** Mon–Fri 9-5, with a shorter Friday. Weekends off. */
function weekdayAvailability(endHour = "17:00"): AvailabilityRule[] {
  return ([0, 1, 2, 3, 4, 5, 6] as const).map((weekday) => ({
    weekday,
    enabled: weekday >= 1 && weekday <= 5,
    windows:
      weekday >= 1 && weekday <= 5
        ? [{ start: "09:00", end: weekday === 5 ? "15:00" : endHour }]
        : [],
  }));
}

export function seedCalendars(users: User[]): Calendar[] {
  const created = { createdAt: refPlusDays(-300), updatedAt: refPlusDays(-14) };
  return [
    {
      id: newId("cal"),
      name: "Discovery Call",
      description: "30-minute intro call for new leads.",
      type: "round_robin",
      color: "indigo",
      slug: "discovery",
      timezone: "America/Los_Angeles",
      slotDurationMin: 30,
      slotIntervalMin: 30,
      bufferBeforeMin: 0,
      bufferAfterMin: 10,
      minSchedulingNoticeHours: 4,
      dateRangeDays: 30,
      maxBookingsPerDay: 6,
      teamMemberIds: users.slice(1, 4).map((u) => u.id),
      availability: weekdayAvailability(),
      isActive: true,
      ...created,
    },
    {
      id: newId("cal"),
      name: "Strategy Session",
      description: "60-minute deep dive for qualified opportunities.",
      type: "simple",
      color: "teal",
      slug: "strategy",
      timezone: "America/Los_Angeles",
      slotDurationMin: 60,
      slotIntervalMin: 60,
      bufferBeforeMin: 10,
      bufferAfterMin: 15,
      minSchedulingNoticeHours: 24,
      dateRangeDays: 45,
      maxBookingsPerDay: 3,
      teamMemberIds: [users[1]!.id],
      availability: weekdayAvailability("16:00"),
      isActive: true,
      ...created,
    },
    {
      id: newId("cal"),
      name: "Onboarding Kickoff",
      description: "New client kickoff and asset handover.",
      type: "service",
      color: "violet",
      slug: "kickoff",
      timezone: "America/Los_Angeles",
      slotDurationMin: 45,
      slotIntervalMin: 45,
      bufferBeforeMin: 5,
      bufferAfterMin: 10,
      minSchedulingNoticeHours: 12,
      dateRangeDays: 21,
      teamMemberIds: [users[5]!.id, users[0]!.id],
      availability: weekdayAvailability(),
      isActive: true,
      ...created,
    },
    {
      id: newId("cal"),
      name: "Monthly Review",
      description: "Recurring reporting review for retainer clients.",
      type: "class",
      color: "amber",
      slug: "review",
      timezone: "America/Los_Angeles",
      slotDurationMin: 30,
      slotIntervalMin: 30,
      bufferBeforeMin: 0,
      bufferAfterMin: 0,
      minSchedulingNoticeHours: 48,
      dateRangeDays: 60,
      teamMemberIds: [users[5]!.id],
      availability: weekdayAvailability("15:00"),
      isActive: false,
      ...created,
    },
  ];
}

const LOCATIONS: Appointment["location"][] = [
  { type: "zoom", value: "https://zoom.us/j/5551234567" },
  { type: "google_meet", value: "https://meet.google.com/abc-defg-hij" },
  { type: "phone" },
  { type: "in_person", value: "1100 Mission St, San Francisco" },
];

/** How far placement may walk past a full or closed day before giving up. */
const MAX_WALK_DAYS = 21;

const hhmm = (hour: number, minute: number) =>
  `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

/**
 * Where an appointment drawn for `day` at wall-clock `time` actually goes:
 * the first slot at or after `time` that the booking engine would still
 * offer, else the day's first open slot, else the same search on the next
 * day, and so on. "Open" is `openSlots()`: on the calendar's grid, clear of
 * everything already placed with buffers applied both ways, on a day under its
 * cap. Notice and date range are left out; they describe "now", and most of
 * the seed is in the past. Makes no draws.
 */
function place(
  calendar: Calendar,
  day: CalendarDay,
  time: string,
  booked: readonly Interval[],
): { days: number; slot: Interval } {
  for (let days = 0; days < MAX_WALK_DAYS; days++) {
    const candidate = addDays(day, days);
    const open = openSlots(calendar, candidate, booked);
    const wish = zonedTime(candidate, time, calendar.timezone);
    const slot = open.find((s) => s.start >= wish) ?? open[0];
    if (slot) return { days, slot };
  }
  throw new Error(
    `seed: no free ${calendar.slug} slot within ${MAX_WALK_DAYS} days of ${day}`,
  );
}

export function seedAppointments(
  calendars: Calendar[],
  contacts: Contact[],
  users: User[],
  count: number,
): Appointment[] {
  const appointments: Appointment[] = [];
  const active = calendars.filter((c) => c.isActive);
  const pool = [...contacts].sort((a, b) => b.score - a.score).slice(0, 160);
  /** Everything placed so far, per calendar, so nothing is double-booked. */
  const placed = new Map<string, Interval[]>();

  for (let i = 0; i < count; i++) {
    const calendar = pick(active);
    const contact = pool[i % pool.length]!;

    // Spread across -45 to +30 days so month/week/day views all have content.
    // The draws are the same, in the same order, as before placement existed:
    // the faker stream that every later seeder reads is unchanged. Day and
    // hour are wall-clock values in the calendar's zone, and only a wish:
    // `place()` takes the first free slot from there (see its comment).
    const drawnOffset = int(-45, 30);
    const hour = int(9, 16);
    const minute = pick([0, 0, 30]);

    const booked = placed.get(calendar.id) ?? [];
    const { days, slot } = place(
      calendar,
      refDay(drawnOffset, calendar.timezone),
      hhmm(hour, minute),
      booked,
    );
    placed.set(calendar.id, [...booked, slot]);

    const dayOffset = drawnOffset + days;
    const startAt = new Date(slot.start).toISOString();
    const endAt = new Date(slot.end).toISOString();
    // Held means over, not merely started: nothing seeded straddles the
    // anchor (02:00 in Los Angeles), but the rule should not depend on that.
    const isPast = endAt <= REF_DATE.toISOString();

    const status: AppointmentStatus = isPast
      ? pick<AppointmentStatus>([
          "showed",
          "showed",
          "showed",
          "no_show",
          "cancelled",
        ])
      : chance(0.9)
        ? "confirmed"
        : "cancelled";

    const appointment: Appointment = {
      id: newId("appt"),
      calendarId: calendar.id,
      contactId: contact.id,
      assignedUserId: pick(calendar.teamMemberIds) ?? pick(users).id,
      title: `${calendar.name} - ${contact.firstName} ${contact.lastName}`,
      notes: chance(0.35)
        ? "Bring the latest performance snapshot."
        : undefined,
      startAt,
      endAt,
      timezone: calendar.timezone,
      status,
      location: pick(LOCATIONS),
      source: pick(["booking_widget", "booking_widget", "manual", "workflow"]),
      // Booked 1–14 days ahead of the slot, but never after "now": an upcoming
      // appointment was booked in the past, not on some future day.
      createdAt: refPast(Math.min(dayOffset, 0) - int(1, 14), int(8, 18)),
      updatedAt: refPast(dayOffset, int(8, 18)),
    };
    // `updatedAt` is drawn as a UTC hour on the appointment's day, which can
    // fall before a Los Angeles afternoon meeting ends. An outcome is recorded
    // once the meeting is over, never before it. Only held appointments have
    // an outcome, and they ended by the anchor, so this cannot date the past
    // after it.
    if (
      (status === "showed" || status === "no_show") &&
      appointment.updatedAt < endAt
    ) {
      appointment.updatedAt = endAt;
    }
    // Both can roll back a day independently; an edit never precedes the booking.
    if (appointment.updatedAt < appointment.createdAt) {
      appointment.updatedAt = appointment.createdAt;
    }
    appointments.push(appointment);
  }

  return appointments;
}
