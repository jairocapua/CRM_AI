import { describe, expect, it, vi } from "vitest";

import type { Appointment, Calendar } from "@/types";
import { freshModules } from "../testing";

/**
 * The seeded appointments must be something the booking API could have
 * produced: no overlaps within a calendar, every one inside its calendar's
 * hours read in the calendar's zone (Los Angeles), no day over its cap, and
 * statuses that agree with whether the meeting has happened yet.
 *
 * The availability check reads wall-clock time through `Intl` with an explicit
 * `timeZone`, an oracle that shares nothing with the slot engine. Before P7 the
 * seed wrote UTC hours 09:00-16:30, which is 02:00-09:30 in Los Angeles.
 */

const ANCHOR = "2026-09-08T09:00:00.000Z";
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SOURCES: Appointment["source"][] = [
  "booking_widget",
  "manual",
  "workflow",
];

async function build(zone = "UTC") {
  vi.stubEnv("TZ", zone);
  await freshModules();
  const { buildDb } = await import("./index");
  const state = buildDb();
  return {
    calendars: state.calendars,
    appointments: Object.values(state.appointments),
  };
}

/** How an instant reads on a wall clock in `zone`. */
function wallClock(zone: string) {
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  return (iso: string) => {
    const parts = Object.fromEntries(
      format.formatToParts(Date.parse(iso)).map((p) => [p.type, p.value]),
    );
    return {
      date: `${parts.year}-${parts.month}-${parts.day}`,
      weekday: WEEKDAYS.indexOf(parts.weekday ?? ""),
      time: `${parts.hour}:${parts.minute}`,
    };
  };
}

const minutes = (hhmm: string) => {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

function byCalendar(appointments: Appointment[]) {
  const groups = new Map<string, Appointment[]>();
  for (const a of appointments) {
    groups.set(a.calendarId, [...(groups.get(a.calendarId) ?? []), a]);
  }
  return groups;
}

describe("seeded appointments", () => {
  it("are 120, some already held and some upcoming", async () => {
    const { appointments } = await build();
    expect(appointments).toHaveLength(120);
    expect(
      appointments.filter((a) => a.endAt <= ANCHOR).length,
    ).toBeGreaterThan(20);
    expect(
      appointments.filter((a) => a.startAt > ANCHOR).length,
    ).toBeGreaterThan(20);
  });

  it("never overlap within a calendar", async () => {
    const { appointments } = await build();
    const overlaps: string[] = [];
    for (const rows of byCalendar(appointments).values()) {
      const sorted = [...rows].sort((a, b) =>
        a.startAt.localeCompare(b.startAt),
      );
      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1]!;
        const next = sorted[i]!;
        if (next.startAt < prev.endAt) {
          overlaps.push(`${prev.startAt}-${prev.endAt} / ${next.startAt}`);
        }
      }
    }
    expect(overlaps).toEqual([]);
  });

  it("start and end inside an open window, in the calendar's zone", async () => {
    const { appointments, calendars } = await build();
    const outside: string[] = [];

    for (const a of appointments) {
      const calendar: Calendar = calendars[a.calendarId]!;
      expect(a.timezone).toBe(calendar.timezone);
      const read = wallClock(calendar.timezone);
      const start = read(a.startAt);
      const end = read(a.endAt);
      const rule = calendar.availability.find(
        (r) => r.weekday === start.weekday,
      );
      const inside =
        rule?.enabled === true &&
        start.date === end.date &&
        rule.windows.some(
          (w) =>
            w.start <= start.time &&
            end.time <= w.end &&
            // On the calendar's slot grid, as the booking API would offer.
            (minutes(start.time) - minutes(w.start)) %
              calendar.slotIntervalMin ===
              0,
        );
      if (!inside) {
        outside.push(
          `${calendar.slug} ${start.date} ${WEEKDAYS[start.weekday]} ${start.time}-${end.time}`,
        );
      }
    }

    expect(outside).toEqual([]);
  });

  it("last exactly one slot", async () => {
    const { appointments, calendars } = await build();
    for (const a of appointments) {
      const calendar = calendars[a.calendarId]!;
      expect(Date.parse(a.endAt) - Date.parse(a.startAt)).toBe(
        calendar.slotDurationMin * 60_000,
      );
    }
  });

  it("never put more on a day than the calendar's maxBookingsPerDay", async () => {
    const { appointments, calendars } = await build();
    const perDay = new Map<string, number>();
    for (const a of appointments) {
      const calendar = calendars[a.calendarId]!;
      const key = `${calendar.slug} ${wallClock(calendar.timezone)(a.startAt).date}`;
      perDay.set(key, (perDay.get(key) ?? 0) + 1);
    }

    const over = [...perDay].filter(([key, count]) => {
      const slug = key.split(" ")[0];
      const calendar = Object.values(calendars).find((c) => c.slug === slug)!;
      return (
        calendar.maxBookingsPerDay !== undefined &&
        count > calendar.maxBookingsPerDay
      );
    });
    expect(over).toEqual([]);
  });

  it("have statuses that agree with whether they have happened", async () => {
    const { appointments } = await build();
    for (const a of appointments) {
      const label = `${a.startAt} ${a.status}`;
      if (a.endAt <= ANCHOR) {
        expect(["showed", "no_show", "cancelled"], label).toContain(a.status);
      } else {
        // Nothing straddles the anchor (02:00 in Los Angeles).
        expect(a.startAt > ANCHOR, label).toBe(true);
        expect(["confirmed", "cancelled"], label).toContain(a.status);
      }
    }
  });

  it("record an outcome only after the meeting, and a booking before it", async () => {
    const { appointments } = await build();
    for (const a of appointments) {
      const label = `${a.startAt} ${a.status}`;
      expect(a.createdAt < a.startAt, `${label} createdAt`).toBe(true);
      expect(a.updatedAt >= a.createdAt, `${label} updatedAt`).toBe(true);
      if (a.status === "showed" || a.status === "no_show") {
        expect(a.updatedAt >= a.endAt, `${label} outcome`).toBe(true);
      }
    }
  });

  it("keep source an enum value, never a reference to a workflow", async () => {
    const { appointments } = await build();
    for (const a of appointments) {
      expect(SOURCES).toContain(a.source);
      expect(a).not.toHaveProperty("workflowId");
    }
    // Not vacuous: Phase 8 reads this value.
    expect(appointments.some((a) => a.source === "workflow")).toBe(true);
  });

  it("do not depend on the runtime's zone", async () => {
    const fingerprint = (appointments: Appointment[]) =>
      appointments.map((a) => `${a.startAt} ${a.endAt} ${a.status}`);
    const utc = fingerprint((await build("UTC")).appointments);
    const singapore = fingerprint((await build("Asia/Singapore")).appointments);
    expect(new Date(ANCHOR).getTimezoneOffset()).toBe(-480);
    expect(singapore).toEqual(utc);
  });
});
