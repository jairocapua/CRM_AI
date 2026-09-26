import type {
  Appointment,
  AppointmentStatus,
  AvailabilityRule,
  Calendar,
  Contact,
  User,
} from "@/types";
import { newId } from "../ids";
import { REF_DATE, chance, int, pick, refPlusDays } from "./rng";

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

/** Skip weekends so the calendar grid looks like a real working week. */
function nextWeekday(dayOffset: number): number {
  const d = new Date(REF_DATE);
  d.setUTCDate(d.getUTCDate() + dayOffset);
  const dow = d.getUTCDay();
  if (dow === 0) return dayOffset + 1;
  if (dow === 6) return dayOffset + 2;
  return dayOffset;
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

  for (let i = 0; i < count; i++) {
    const calendar = pick(active);
    const contact = pool[i % pool.length]!;

    // Spread across -45 to +30 days so month/week/day views all have content.
    const dayOffset = nextWeekday(int(-45, 30));
    const isPast = dayOffset < 0;

    const hour = int(9, 16);
    const minute = pick([0, 0, 30]);
    const startAt = refPlusDays(dayOffset, hour, minute);
    const endAt = new Date(
      new Date(startAt).getTime() + calendar.slotDurationMin * 60_000,
    ).toISOString();

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

    appointments.push({
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
      createdAt: refPlusDays(dayOffset - int(1, 14), int(8, 18)),
      updatedAt: refPlusDays(Math.min(dayOffset, 0), int(8, 18)),
    });
  }

  return appointments;
}
