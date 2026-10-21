import type { Page } from "@playwright/test";

import { expect } from "./fixtures";

/**
 * Shared helpers for the calendars specs. Not a spec itself: Playwright only
 * collects `*.spec.ts`.
 */

export type ViewName = "Month" | "Week" | "Day";

export const viewButton = (page: Page, name: ViewName) =>
  page
    .getByRole("group", { name: "Calendar view" })
    .getByRole("button", { name, exact: true });

/** The toolbar's range heading (the page title is the only h1). */
export const rangeHeading = (page: Page) =>
  page.getByRole("heading", { level: 2 });

/** The view's `<section>`, named "Month view", "Week view" or "Day view". */
export const viewRegion = (page: Page, view: ViewName) =>
  page.getByRole("region", { name: `${view} view`, exact: true });

export async function expectPosition(
  page: Page,
  view: ViewName,
  label: string,
) {
  await expect(viewButton(page, view)).toHaveAttribute("aria-pressed", "true");
  await expect(rangeHeading(page)).toHaveText(label);
}

/**
 * Waits until the current view has its data, so an absence is not vacuous.
 * While the next range loads, the previous view stays on screen marked
 * `aria-busy` (and keeps its own name, so a Week view still loading reads as
 * "Month view"): wait for the right name and for it to settle, after the
 * heading shows the new position.
 */
export async function expectViewLoaded(page: Page, view: ViewName) {
  await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0);
  const region = viewRegion(page, view);
  await expect(region).toBeVisible();
  await expect(region).not.toHaveAttribute("aria-busy", "true");
}

export interface SeededAppointment {
  id: string;
  startAt: string;
  status: string;
  calendarName: string;
  calendarColor: string;
}

interface PersistedDb {
  state: {
    appointments: Record<
      string,
      { id: string; calendarId: string; startAt: string; status: string }
    >;
    calendars: Record<string, { name: string; color: string }>;
  };
}

/**
 * Every appointment in the app's persisted database, read straight from
 * localStorage as an oracle independent of the UI and the API. Persist writes
 * are debounced by 250ms, so the key is polled for first. The shape is the
 * mock store's internal one: if it changes, this throws rather than passing
 * quietly.
 */
export async function readSeededAppointments(
  page: Page,
): Promise<SeededAppointment[]> {
  const read = () => page.evaluate(() => localStorage.getItem("nimbus-crm-db"));
  await expect.poll(read).not.toBeNull();

  const db = JSON.parse((await read()) ?? "null") as PersistedDb;
  const { appointments, calendars } = db.state;
  const rows = Object.values(appointments).map((a) => {
    const calendar = calendars[a.calendarId];
    if (!calendar) throw new Error(`No calendar ${a.calendarId}`);
    return {
      id: a.id,
      startAt: a.startAt,
      status: a.status,
      calendarName: calendar.name,
      calendarColor: calendar.color,
    };
  });
  expect(rows.length, "the seed has appointments").toBeGreaterThan(0);
  return rows;
}

/** The "YYYY-MM-DD" day an instant falls on in `zone`. */
export function localDayIn(zone: string, iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/** "Tuesday, September 1, 2026" for "2026-09-01", the day cells' names. */
export function longDayLabel(day: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${day}T00:00:00Z`));
}
