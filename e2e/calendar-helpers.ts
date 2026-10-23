import type { Locator, Page } from "@playwright/test";

import { expect } from "./fixtures";

/**
 * Shared helpers for the calendars specs, contact-picker.spec.ts and
 * deal-form.spec.ts. Not a spec itself: Playwright only collects `*.spec.ts`.
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
  title: string;
  startAt: string;
  endAt: string;
  /** The appointment's own zone, an IANA name. */
  timezone: string;
  status: string;
  locationType: string | null;
  contactId: string;
  contactName: string;
  calendarId: string;
  calendarName: string;
  calendarColor: string;
  minSchedulingNoticeHours: number;
}

/** One weekday's hours as the store keeps them: "09:00"-"17:00" windows. */
export interface PersistedAvailabilityRule {
  weekday: number;
  enabled: boolean;
  windows: { start: string; end: string }[];
}

interface PersistedDb {
  state: {
    seededAt: string;
    appointments: Record<
      string,
      {
        id: string;
        calendarId: string;
        contactId: string;
        title: string;
        startAt: string;
        endAt: string;
        timezone: string;
        status: string;
        location?: { type: string };
      }
    >;
    calendars: Record<
      string,
      {
        name: string;
        color: string;
        minSchedulingNoticeHours: number;
        availability: PersistedAvailabilityRule[];
      }
    >;
    contacts: Record<
      string,
      {
        firstName: string;
        lastName: string;
        email?: string;
        phone?: string;
        companyName?: string;
        jobTitle?: string;
      }
    >;
    activities: Record<string, { contactId?: string; summary: string }>;
    opportunities: Record<
      string,
      { name: string; status: string; expectedCloseAt?: string }
    >;
  };
}

const DB_KEY = "nimbus-crm-db";

/**
 * The app's persisted database, read straight from localStorage as an oracle
 * independent of the UI and the API. Persist writes are debounced by 250ms,
 * so the key is polled for first. The shape is the mock store's internal one:
 * the readers below throw if it changes, rather than passing quietly.
 */
async function readPersistedDb(page: Page): Promise<PersistedDb["state"]> {
  const read = () => page.evaluate((key) => localStorage.getItem(key), DB_KEY);
  await expect.poll(read).not.toBeNull();
  return (JSON.parse((await read()) ?? "null") as PersistedDb).state;
}

/**
 * Every appointment in the persisted database, in the store's own order (the
 * order the API sorts from, so ties by start time come out the same).
 */
export async function readSeededAppointments(
  page: Page,
): Promise<SeededAppointment[]> {
  const { appointments, calendars, contacts } = await readPersistedDb(page);
  const rows = Object.values(appointments).map((a) => {
    const calendar = calendars[a.calendarId];
    if (!calendar) throw new Error(`No calendar ${a.calendarId}`);
    const contact = contacts[a.contactId];
    if (!contact) throw new Error(`No contact ${a.contactId}`);
    return {
      id: a.id,
      title: a.title,
      startAt: a.startAt,
      endAt: a.endAt,
      timezone: a.timezone,
      status: a.status,
      locationType: a.location?.type ?? null,
      contactId: a.contactId,
      contactName: `${contact.firstName} ${contact.lastName}`,
      calendarId: a.calendarId,
      calendarName: calendar.name,
      calendarColor: calendar.color,
      minSchedulingNoticeHours: calendar.minSchedulingNoticeHours,
    };
  });
  expect(rows.length, "the seed has appointments").toBeGreaterThan(0);
  return rows;
}

/** The seed's anchor, the demo clock's starting "now". */
export async function readSeededAt(page: Page): Promise<string> {
  const { seededAt } = await readPersistedDb(page);
  expect(Date.parse(seededAt), "the store has a seed anchor").not.toBeNaN();
  return seededAt;
}

/** One appointment's status as persisted, or null when it is not there. */
export async function readPersistedStatus(
  page: Page,
  id: string,
): Promise<string | null> {
  const { appointments } = await readPersistedDb(page);
  return appointments[id]?.status ?? null;
}

export interface SeededContact {
  id: string;
  /** "First Last", as the contact picker and the app print it. */
  name: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  companyName: string | null;
  jobTitle: string | null;
}

/** Every contact in the persisted database, in the store's own order. */
export async function readContacts(page: Page): Promise<SeededContact[]> {
  const { contacts } = await readPersistedDb(page);
  const rows = Object.entries(contacts).map(([id, contact]) => ({
    id,
    name: `${contact.firstName} ${contact.lastName}`,
    lastName: contact.lastName,
    email: contact.email ?? null,
    phone: contact.phone ?? null,
    companyName: contact.companyName ?? null,
    jobTitle: contact.jobTitle ?? null,
  }));
  expect(rows.length, "the seed has contacts").toBeGreaterThan(0);
  return rows;
}

export interface SeededDeal {
  id: string;
  name: string;
  status: string;
  /** As stored: a UTC ISO instant, or null when the deal has no date. */
  expectedCloseAt: string | null;
}

/** Every deal in the persisted database, in the store's own order. */
export async function readDeals(page: Page): Promise<SeededDeal[]> {
  const { opportunities } = await readPersistedDb(page);
  const rows = Object.entries(opportunities).map(([id, deal]) => ({
    id,
    name: deal.name,
    status: deal.status,
    expectedCloseAt: deal.expectedCloseAt ?? null,
  }));
  expect(rows.length, "the seed has deals").toBeGreaterThan(0);
  return rows;
}

/**
 * A contact no other contact shares a full name with, so `chooseContact` can
 * pick it by name. Throws when there is none.
 */
export function uniquelyNamedContact(
  contacts: readonly SeededContact[],
): SeededContact {
  const found = contacts.find(
    (contact) =>
      contacts.filter((other) => other.name === contact.name).length === 1,
  );
  if (!found) throw new Error("No contact with a unique name");
  return found;
}

/**
 * One calendar's weekly hours as persisted, found by name, in the store's
 * own order. Throws when no calendar has that name.
 */
export async function readCalendarAvailability(
  page: Page,
  calendarName: string,
): Promise<PersistedAvailabilityRule[]> {
  const { calendars } = await readPersistedDb(page);
  const calendar = Object.values(calendars).find(
    (c) => c.name === calendarName,
  );
  if (!calendar) throw new Error(`No calendar named ${calendarName}`);
  return calendar.availability;
}

/** The ids of every appointment persisted, cancelled ones included. */
export async function readAppointmentIds(page: Page): Promise<Set<string>> {
  const { appointments } = await readPersistedDb(page);
  return new Set(Object.keys(appointments));
}

/** The summaries of every activity persisted for one contact. */
export async function readContactActivitySummaries(
  page: Page,
  contactId: string,
): Promise<string[]> {
  const { activities } = await readPersistedDb(page);
  return Object.values(activities)
    .filter((activity) => activity.contactId === contactId)
    .map((activity) => activity.summary);
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

function zonedParts(zone: string, iso: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  return { hour: part("hour"), minute: part("minute") };
}

/** Wall-clock minutes since local midnight in `zone`: 01:30 is 90. */
export function localMinutesIn(zone: string, iso: string): number {
  const { hour, minute } = zonedParts(zone, iso);
  return hour * 60 + minute;
}

/**
 * "1:00 AM" for an instant in `zone`, as the calendar blocks print it. Built
 * from parts with a plain space: Intl's own en-US output puts a narrow
 * no-break space before "AM".
 */
export function localTimeIn(zone: string, iso: string): string {
  const { hour, minute } = zonedParts(zone, iso);
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}

/** One appointment's part of one local day, in minutes of that day. */
export interface DaySegmentOracle {
  row: SeededAppointment;
  day: string;
  start: number;
  end: number;
}

/**
 * Where a time grid should draw each row in `zone`, over `days` only: one
 * segment per local day the row occupies, from its local start day to the
 * local day of its last millisecond. A segment starts at the row's local start
 * time on its first day and at midnight after that, and ends at its local end
 * time on its last day and at midnight (1440) before that. Computed with Intl
 * alone, so it shares nothing with the app.
 */
export function segmentsIn(
  zone: string,
  rows: readonly SeededAppointment[],
  days: readonly string[],
): DaySegmentOracle[] {
  const segments: DaySegmentOracle[] = [];
  for (const row of rows) {
    const firstDay = localDayIn(zone, row.startAt);
    const lastMs = new Date(Date.parse(row.endAt) - 1).toISOString();
    const lastDay = localDayIn(zone, lastMs);
    for (const day of days) {
      if (day < firstDay || day > lastDay) continue;
      segments.push({
        row,
        day,
        start: day === firstDay ? localMinutesIn(zone, row.startAt) : 0,
        end:
          day === localDayIn(zone, row.endAt)
            ? localMinutesIn(zone, row.endAt)
            : 24 * 60,
      });
    }
  }
  return segments;
}

/** The "YYYY-MM-DD" days from `first` to `last`, inclusive, stepped in UTC. */
export function dayList(first: string, last: string): string[] {
  const days: string[] = [];
  for (
    let ms = Date.parse(`${first}T00:00:00Z`);
    ms <= Date.parse(`${last}T00:00:00Z`);
    ms += 86_400_000
  ) {
    days.push(new Date(ms).toISOString().slice(0, 10));
  }
  return days;
}

/** The booking dialog, opened from the toolbar or a contact's tab. */
export const bookingDialog = (page: Page) =>
  page.getByRole("dialog", { name: "Book appointment" });

/** The dialog's Time fieldset, the group the open times are listed in. */
export const timeGroup = (dialog: Locator) =>
  dialog.getByRole("group", { name: "Time", exact: true });

export async function chooseCalendar(
  page: Page,
  dialog: Locator,
  name: string,
) {
  const trigger = dialog.getByRole("combobox", { name: "Calendar" });
  await trigger.click();
  await page.getByRole("option", { name, exact: true }).click();
  // The select's label, not the trigger's whole text: Base UI's select icon
  // keeps a "▼" text node inside the chevron.
  await expect(trigger.locator('[data-slot="select-value"]')).toHaveText(name);
}

/**
 * The listed contact option whose name line is exactly `contact`'s full name
 * (its company, when it has one, is a second line).
 */
export const contactOption = (page: Page, contact: SeededContact) =>
  page
    .getByRole("option")
    .filter({ has: page.getByText(contact.name, { exact: true }) });

/**
 * Picks `contact` in a contact picker's `input`: types the full name, clicks
 * `contactOption`, and checks the input shows the name.
 *
 * The option is matched by name alone, so pass a contact no other contact
 * shares a full name with (`uniquelyNamedContact`). Two matches fail the click
 * as a strict-mode violation rather than pick either.
 */
export async function chooseContactIn(
  page: Page,
  input: Locator,
  contact: SeededContact,
) {
  await input.fill(contact.name);
  await contactOption(page, contact).click();
  await expect(input).toHaveValue(contact.name);
}

/**
 * Picks `contact` in the dialog's Contact combobox, through
 * `chooseContactIn` (same rules: pass a uniquely named contact).
 */
export async function chooseContact(
  page: Page,
  dialog: Locator,
  contact: SeededContact,
) {
  await chooseContactIn(
    page,
    dialog.getByRole("combobox", { name: "Contact" }),
    contact,
  );
}

/** How far ahead of the page's "now" `pauseTimers` stops the clock. */
const PAUSE_MARGIN_MS = 5_000;

/**
 * Stops the page's timers (`setTimeout`, `requestAnimationFrame`, `Date`)
 * until `page.clock.resume()`, after `page.clock.install()`.
 *
 * `pauseAt` cannot move the clock back, and until paused the clock keeps
 * the wall clock's pace, so it pauses `PAUSE_MARGIN_MS` ahead of the page's
 * `Date.now()`. Limits:
 * - It throws "Cannot fast-forward to the past" if more than the margin of
 *   page time passes between reading `Date.now()` and the pause. They are
 *   two back-to-back calls, so only a stalled machine gets there.
 * - Every timer due inside the margin fires at once on pause. So call it once
 *   the page has settled (no debounce or simulated fetch in flight), or that
 *   work completes before the pause instead of waiting for `resume()`.
 */
export async function pauseTimers(page: Page) {
  const now = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(now + PAUSE_MARGIN_MS);
}

export interface OpenTime {
  /** The radio's name, the viewer's local time: "12:00 AM". */
  label: string;
  /** The instant it books, as `availableSlots()` gave it. */
  start: string;
}

/**
 * The times the dialog lists once the list has settled for `day`: not busy,
 * at least one time, and every one of them on `day` in the viewer's `zone`,
 * so it is this day's list and not one still on screen from a previous
 * choice. Only then does an absence mean anything.
 */
export async function openTimes(
  dialog: Locator,
  day: string,
  zone: string,
): Promise<OpenTime[]> {
  const group = timeGroup(dialog);
  let times: OpenTime[] = [];
  await expect(async () => {
    expect(await group.getAttribute("aria-busy")).toBeNull();
    times = await group.getByRole("radio").evaluateAll((radios) =>
      radios.map((radio) => ({
        label: radio.closest("label")?.textContent?.trim() ?? "",
        start: radio.getAttribute("data-start") ?? "",
      })),
    );
    expect(times.length).toBeGreaterThan(0);
    expect(new Set(times.map((time) => localDayIn(zone, time.start)))).toEqual(
      new Set([day]),
    );
  }).toPass();
  return times;
}

export const timeRadio = (dialog: Locator, label: string) =>
  timeGroup(dialog).getByRole("radio", { name: label, exact: true });

/** A store table whose reads `failReads` can make fail. */
export type FaultTable = "appointments" | "calendars" | "contacts" | "tags";

/**
 * How `failReads` tells a table's records apart: every record of the table
 * has all of `has` and none of `lacks`, and no record of another table
 * matches both. An appointment also has a `timezone`, so the calendar shape
 * needs more than that one key. No other record has `dnd` or `score`, and
 * users have no `tagIds`. A tag has `name`, `slug` and `color`, and so does a
 * calendar, the only other record with a `slug` (src/types), so the tag
 * shape also requires no `timezone`, which every calendar has. If another
 * record type gains `name`, `slug` and `color` without a `timezone`, the tags
 * fault catches it too.
 */
const TABLE_SHAPES: Record<
  FaultTable,
  { has: readonly string[]; lacks?: readonly string[] }
> = {
  appointments: { has: ["calendarId", "contactId", "startAt", "endAt"] },
  calendars: { has: ["availability", "slotDurationMin", "timezone"] },
  contacts: { has: ["firstName", "lastName", "tagIds", "dnd", "score"] },
  tags: { has: ["name", "slug", "color"], lacks: ["timezone"] },
};

interface ReadFaultWindow {
  /** The table whose reads fail now, or null when none does. */
  __e2eReadFault?: {
    table: FaultTable;
    has: readonly string[];
    lacks: readonly string[];
  } | null;
  /** Set once `Object.values` has been wrapped in this document. */
  __e2eReadFaultInstalled?: boolean;
  /** How many reads the fault has failed in this document so far. */
  __e2eReadFaultThrows?: number;
}

/**
 * Makes every read of one store table fail until `restoreReads`, so a spec can
 * drive a load error and its Retry.
 *
 * Why: reads keep `canFail: false` (DECISIONS, P6; P10-T02 owns any change),
 * so the mock never fails a read, and there is no production fault switch.
 * This stands in for `page.route(...).abort()` until `http.ts` moves to
 * `fetch()`, when a spec should switch to that.
 *
 * How: it wraps the page's built-in `Object.values`, which the API uses to
 * read a table (`Object.values(db.getState().appointments)`). The wrapper
 * calls the real one, then throws when the fault is on and the first value
 * holds every key of the table's record shape, so other objects pass
 * through. The throw happens inside `simulate()`, so the read rejects with a
 * plain Error, and `useResource` reports it as "Something went wrong.".
 *
 * Limits: the wrapper lives in the current document only. It survives
 * client-side navigation but not `goto` or a reload, so install it after
 * `gotoApp` and trigger the read by a sidebar link, a step, a tab, a link or
 * opening a dialog. If the API stops reading tables through `Object.values`,
 * the error never appears and the specs fail loudly; they cannot pass
 * vacuously.
 *
 * The fault is not limited to the read under test: anything that reads the
 * table through `Object.values` while it is on throws too. For appointments
 * that includes two mutations in src/lib/api/calendars.ts: `book()`, which
 * always reads every appointment to check the slot (the booking dialog then
 * shows "Could not book the appointment."), and `setStatus()` when it moves a
 * cancelled appointment to another status. `cancel()` and every other status
 * change do not read the table. Calls outside calendars.ts are caught too:
 * template rendering (`render()` in src/lib/api/templates.ts reads
 * appointments and calendars), the dashboard's analytics (`summary()` in
 * analytics.ts reads appointments) and the settings integrity check
 * (`integrityReport()` in settings.ts reads appointments). For contacts it
 * catches every read of the whole table: the contacts list, the tag counts
 * (`list()` in tags.ts), the dashboard's analytics (analytics.ts) and the
 * contacts CSV export (contacts.ts). Contact writes and `contacts.get` read
 * by key and are unaffected. For tags it catches only `list()` in tags.ts
 * (`Object.values(tags)`, after its loop over the contacts, which passes):
 * tag create, update and remove, `contacts.list` and
 * `contacts.addTags`/`removeTags` do not read the tags table that way, so
 * they keep working. Restore reads before a step that reaches them.
 * `readFaultThrows` counts the reads the fault has failed.
 */
export async function failReads(page: Page, table: FaultTable): Promise<void> {
  await page.evaluate(
    ({ table, has, lacks }) => {
      const w = window as unknown as ReadFaultWindow;
      if (!w.__e2eReadFaultInstalled) {
        const real = Object.values;
        Object.values = function values(o: object) {
          const result = real(o);
          const fault = w.__e2eReadFault;
          const first: unknown = result[0];
          if (
            fault &&
            typeof first === "object" &&
            first !== null &&
            fault.has.every((key) => key in first) &&
            !fault.lacks.some((key) => key in first)
          ) {
            w.__e2eReadFaultThrows = (w.__e2eReadFaultThrows ?? 0) + 1;
            throw new Error(`e2e: reading ${fault.table} failed`);
          }
          return result;
        } as typeof Object.values;
        w.__e2eReadFaultInstalled = true;
      }
      w.__e2eReadFault = { table, has, lacks };
    },
    {
      table,
      has: TABLE_SHAPES[table].has,
      lacks: TABLE_SHAPES[table].lacks ?? [],
    },
  );
}

/**
 * How many reads `failReads` has failed in this document so far, 0 before
 * any. A spec polls it to know a read under a fault has run (and failed)
 * before it checks that nothing changed on screen, so an absence is not
 * checked too early to mean anything.
 */
export async function readFaultThrows(page: Page): Promise<number> {
  return page.evaluate(
    () => (window as unknown as ReadFaultWindow).__e2eReadFaultThrows ?? 0,
  );
}

/**
 * Ends the fault `failReads` started: reads succeed again.
 *
 * It only clears `__e2eReadFault`. The `Object.values` wrapper stays
 * installed in this document and passes every call through. That is safe
 * because each test gets a fresh page, and a tab opened with
 * `context.newPage()` is a separate document the wrapper never reaches (it
 * would need its own `failReads`).
 */
export async function restoreReads(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as ReadFaultWindow).__e2eReadFault = null;
  });
}

interface ContactFaultWindow {
  /** The contact whose read can be made to fail, or null when none. */
  __e2eContactFault?: {
    id: string;
    /** While true, reading the record by key throws. */
    failing: boolean;
    /** The store's contacts object and the record, once armed. */
    armed: { table: object; record: object } | null;
    /** True while `Object.values` reads the armed table. */
    listing: boolean;
  } | null;
  /** Set once `Object.values` has been wrapped for this fault. */
  __e2eContactFaultInstalled?: boolean;
}

/**
 * Prepares one contact's read to fail, so a spec can drive the contact page's
 * load error. `failContactRead` turns it on; `restoreContactRead` ends it.
 *
 * Why: `contacts.get` reads the record by key
 * (`db.getState().contacts[id]`), not through `Object.values`, so
 * `failReads` cannot reach it.
 *
 * How: it wraps the page's built-in `Object.values`, layered over whatever
 * is there, as `failReads` does. The first read of the store's contacts
 * object after this call (the contacts list, or the tag counts) runs as
 * normal, then swaps that one record's plain property for a getter. The
 * getter returns the record until `failContactRead`, and throws after it,
 * so `contacts.get` rejects with a plain Error, which `useResource` reports
 * as "Something went wrong.". Reads of the whole table through
 * `Object.values` never throw, so the contacts list keeps working.
 *
 * Arming: it needs one such read after the call, for example the contact
 * page's tag counts or opening the contacts list again by a client-side
 * link. `failContactRead` waits for it.
 *
 * Limits: the wrapper lives in the current document only, like `failReads`.
 * Any contact write copies the contacts object (`{ ...s.contacts }`), which
 * drops the fault, so the test then fails loudly, never quietly. While the
 * fault is on, every other by-key read of that record throws too: the
 * activity, appointment and conversation rows that look it up, the copy in
 * any contact write, and persist's `JSON.stringify` on any store write. So
 * turn it on only while the page is idle; the fixture's console watcher
 * turns any such throw outside a read into a test failure.
 */
export async function armContactFault(page: Page, id: string): Promise<void> {
  await page.evaluate((id) => {
    const w = window as unknown as ContactFaultWindow;
    if (!w.__e2eContactFaultInstalled) {
      const real = Object.values;
      Object.values = function values(o: object) {
        const fault = w.__e2eContactFault;
        if (fault?.armed && o === fault.armed.table) {
          fault.listing = true;
          try {
            return real(o);
          } finally {
            fault.listing = false;
          }
        }
        const result = real(o);
        // Only the contacts object has the contact's id as a key holding a
        // plain record with that id.
        const record: unknown =
          fault && !fault.armed && typeof o === "object" && o !== null
            ? Object.getOwnPropertyDescriptor(o, fault.id)?.value
            : undefined;
        if (
          fault &&
          typeof record === "object" &&
          record !== null &&
          (record as { id?: unknown }).id === fault.id
        ) {
          Object.defineProperty(o, fault.id, {
            enumerable: true,
            configurable: true,
            get() {
              if (fault.failing && !fault.listing) {
                throw new Error(`e2e: reading contact ${fault.id} failed`);
              }
              return record;
            },
            set(value: unknown) {
              Object.defineProperty(o, fault.id, {
                value,
                writable: true,
                enumerable: true,
                configurable: true,
              });
            },
          });
          fault.armed = { table: o, record };
        }
        return result;
      } as typeof Object.values;
      w.__e2eContactFaultInstalled = true;
    }
    w.__e2eContactFault = { id, failing: false, armed: null, listing: false };
  }, id);
}

/**
 * Turns the fault `armContactFault` prepared on: reading that contact by key
 * throws from now on. Waits until the fault is armed first.
 */
export async function failContactRead(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            !!(window as unknown as ContactFaultWindow).__e2eContactFault
              ?.armed,
        ),
      {
        message: "armContactFault was never armed: no contacts list read since",
      },
    )
    .toBe(true);
  await page.evaluate(() => {
    const fault = (window as unknown as ContactFaultWindow).__e2eContactFault;
    if (fault) fault.failing = true;
  });
}

/**
 * Ends the fault: the record is a plain property on the store's contacts
 * object again, and reads succeed. The `Object.values` wrapper stays
 * installed and passes every call through, as after `restoreReads`.
 */
export async function restoreContactRead(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as ContactFaultWindow;
    const fault = w.__e2eContactFault;
    // Only while the getter is still there: once the setter has run, the
    // property already holds a newer plain value.
    if (
      fault?.armed &&
      Object.getOwnPropertyDescriptor(fault.armed.table, fault.id)?.get
    ) {
      Object.defineProperty(fault.armed.table, fault.id, {
        value: fault.armed.record,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }
    w.__e2eContactFault = null;
  });
}

/**
 * The `LoadError` alert with this title. Filtered by text because Next's
 * route announcer also has role="alert".
 */
export const loadErrorAlert = (page: Page, title: string) =>
  page.getByRole("alert").filter({ hasText: title });
