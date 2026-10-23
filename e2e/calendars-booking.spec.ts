import type { Locator, Page } from "@playwright/test";

import {
  bookingDialog,
  chooseCalendar,
  expectPosition,
  expectViewLoaded,
  localDayIn,
  localTimeIn,
  longDayLabel,
  openTimes,
  readAppointmentIds,
  readContacts,
  readPersistedStatus,
  readSeededAppointments,
  readSeededAt,
  timeGroup,
  timeRadio,
  viewButton,
  viewRegion,
  type SeededAppointment,
  type SeededContact,
} from "./calendar-helpers";
import { expect, test } from "./fixtures";

/**
 * Booking: the dialog opened from the Calendars toolbar or from a contact's
 * Appointments tab. It lists the times a calendar offers on a viewer-local
 * day and books one through the API, and the booking then shows up wherever
 * appointments are shown. This is the phase's exit check.
 *
 * Checked against an oracle the UI does not share: the persisted database.
 * The viewer is in Singapore while every seeded calendar is in Los Angeles,
 * so one local day is two calendar dates, and a day mapped by its UTC date
 * or passed straight through would list the wrong times.
 *
 * Seed facts these tests rely on (pinned by tripwires below, so a seed change
 * fails loudly instead of passing trivially): at the anchor, 2026-09-08 09:00
 * UTC, Discovery Call offers all sixteen of its Tuesday slots, 09:00 to 16:30
 * PDT, which are 00:00 to 07:30 on Wednesday 9 September in Singapore. The
 * first of them comes before every confirmed booking ahead, so it heads the
 * dashboard's Upcoming card, and 9 September holds two appointments, so a
 * third still shows in its month cell without "+N more".
 */

const ZONE = "Asia/Singapore";
const CALENDAR = "Discovery Call";
/** Wednesday in Singapore: Discovery Call's Tuesday in Los Angeles. */
const DAY = "2026-09-09";
const HOUR_MS = 3_600_000;

test.use({ timezoneId: ZONE, locale: "en-US" });

/** By start time, ties kept in the store's order, as the API sorts. */
const byStart = (rows: readonly SeededAppointment[]) =>
  [...rows].sort((a, b) => a.startAt.localeCompare(b.startAt));

/**
 * A contact no other contact shares a name with, for `chooseContact`. The
 * picker searches the full name as a substring, so typing "Ana Garcia" may
 * also list "Diana Garcia"; the option is then clicked by its exact name. The
 * unique last name is no longer needed for the search, but the rule stays so
 * these specs keep picking the same seeded contacts as before.
 */
function uniqueContact(
  contacts: readonly SeededContact[],
  skip: (contact: SeededContact) => boolean = () => false,
): SeededContact {
  const shared = (key: "name" | "lastName", value: string) =>
    contacts.filter((other) => other[key] === value).length > 1;
  const found = contacts.find(
    (contact) =>
      !skip(contact) &&
      !shared("name", contact.name) &&
      !shared("lastName", contact.lastName),
  );
  if (!found) throw new Error("No contact with a unique name");
  return found;
}

async function chooseContact(
  page: Page,
  dialog: Locator,
  contact: SeededContact,
) {
  const input = dialog.getByRole("combobox", { name: "Contact" });
  // The full name, so every booking flow searches by it.
  await input.fill(contact.name);
  await page
    .getByRole("option")
    .filter({ has: page.getByText(contact.name, { exact: true }) })
    .click();
  await expect(input).toHaveValue(contact.name);
}

/**
 * Fills the open booking dialog, books its first open time and returns the
 * new appointment's id with the time booked. Without `contact` the contact
 * is left as the dialog filled it.
 */
async function bookViaDialog(
  page: Page,
  options: {
    calendar: string;
    day: string;
    contact?: SeededContact;
  },
) {
  const dialog = bookingDialog(page);
  await expect(dialog).toBeVisible();
  const before = await readAppointmentIds(page);

  await chooseCalendar(page, dialog, options.calendar);
  if (options.contact !== undefined) {
    await chooseContact(page, dialog, options.contact);
  }
  await dialog.getByLabel("Day", { exact: true }).fill(options.day);

  const [first] = await openTimes(dialog, options.day, ZONE);
  if (!first) throw new Error("No open time");
  await timeRadio(dialog, first.label).click();
  await expect(timeRadio(dialog, first.label)).toHaveAttribute(
    "aria-checked",
    "true",
  );

  await dialog.getByRole("button", { name: "Book appointment" }).click();
  await expect(
    page.getByText("Appointment booked", { exact: true }),
  ).toBeVisible();
  await expect(dialog).toBeHidden();

  // Exactly one new appointment reaches the store.
  let added: string[] = [];
  await expect
    .poll(async () => {
      added = [...(await readAppointmentIds(page))].filter(
        (id) => !before.has(id),
      );
      return added.length;
    })
    .toBe(1);
  return { id: added[0] as string, ...first };
}

/** The persisted row for one appointment id. */
async function readAppointment(page: Page, id: string) {
  const row = (await readSeededAppointments(page)).find((r) => r.id === id);
  if (!row) throw new Error(`No appointment ${id}`);
  return row;
}

test("a booking appears in every view, on the timeline and the dashboard, and its slot is no longer offered", async ({
  page,
  gotoApp,
}) => {
  // About 7s alone on one worker, but about 28s in a full run on 16 workers,
  // close to Playwright's old 30s default. slow() triples the 60s budget.
  test.slow();
  await gotoApp(`/calendars?view=month&date=${DAY}`);
  await expectPosition(page, "Month", "September 2026");
  await expectViewLoaded(page, "Month");

  const seeded = await readSeededAppointments(page);
  const seededAt = await readSeededAt(page);
  // Tripwire: the day's month cell shows every chip up to three.
  const onDay = seeded.filter((row) => localDayIn(ZONE, row.startAt) === DAY);
  expect(onDay.length + 1).toBeLessThanOrEqual(3);
  const contact = uniqueContact(await readContacts(page), (c) =>
    seeded.some((row) => row.contactId === c.id),
  );

  await page.getByRole("button", { name: "Book", exact: true }).click();
  // The dialog opens on the day in view.
  await expect(
    bookingDialog(page).getByLabel("Day", { exact: true }),
  ).toHaveValue(DAY);
  const booked = await bookViaDialog(page, {
    calendar: CALENDAR,
    day: DAY,
    contact,
  });

  // What was stored is what was picked, on the day and at the time shown.
  const row = await readAppointment(page, booked.id);
  expect(row).toMatchObject({
    calendarName: CALENDAR,
    contactId: contact.id,
    status: "confirmed",
  });
  expect(Date.parse(row.startAt)).toBe(Date.parse(booked.start));
  expect(localDayIn(ZONE, row.startAt)).toBe(DAY);
  expect(localTimeIn(ZONE, row.startAt)).toBe(booked.label);

  // Tripwire: the booking is among the next six confirmed, so the
  // dashboard card lists it.
  const upcoming = byStart(
    (await readSeededAppointments(page)).filter(
      (r) => r.status === "confirmed" && r.startAt >= seededAt,
    ),
  )
    .slice(0, 6)
    .map((r) => r.id);
  expect(upcoming).toContain(booked.id);

  // The booked time is no longer offered for that calendar and day.
  await page.getByRole("button", { name: "Book", exact: true }).click();
  const dialog = bookingDialog(page);
  await chooseCalendar(page, dialog, CALENDAR);
  await expect(dialog.getByLabel("Day", { exact: true })).toHaveValue(DAY);
  const offered = await openTimes(dialog, DAY, ZONE);
  expect(offered.map((time) => time.start)).not.toContain(booked.start);
  await expect(timeRadio(dialog, booked.label)).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // Month, week and day views.
  const chip = (view: "Month" | "Week" | "Day") =>
    viewRegion(page, view).locator(`li[data-appointment-id="${booked.id}"]`);
  await expect(chip("Month")).toBeVisible();
  await viewButton(page, "Week").click();
  await expectPosition(page, "Week", "Sep 6 – 12, 2026");
  await expectViewLoaded(page, "Week");
  await expect(chip("Week")).toBeVisible();
  await viewButton(page, "Day").click();
  await expectPosition(page, "Day", longDayLabel(DAY));
  await expectViewLoaded(page, "Day");
  await expect(chip("Day")).toBeVisible();

  // The contact's activity timeline, newest first.
  await chip("Day").getByRole("button").click();
  const details = page.getByRole("dialog");
  await expect(details.getByRole("heading")).toHaveText(row.title);
  await details.getByRole("link", { name: contact.name, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/contacts/${contact.id}$`));
  await expect(page.locator('[data-slot="item-title"]').first()).toHaveText(
    `Booked "${row.title}"`,
  );

  // The dashboard's Upcoming card.
  await page
    .locator('[data-slot="sidebar"]')
    .getByRole("link", { name: "Dashboard", exact: true })
    .click();
  await expect(page).toHaveURL(/\/dashboard$/);
  const card = page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByText("Upcoming appointments", { exact: true }) });
  await expect(card.locator("li[data-appointment-id]")).toHaveCount(6);
  expect(
    await card
      .locator("li[data-appointment-id]")
      .evaluateAll((items) =>
        items.map((li) => li.getAttribute("data-appointment-id")),
      ),
  ).toEqual(upcoming);
});

test("booking from the contact page pre-fills the contact", async ({
  page,
  gotoApp,
}) => {
  const OTHER_DAY = "2026-09-11";

  await gotoApp("/dashboard");
  const seeded = await readSeededAppointments(page);
  const seededAt = await readSeededAt(page);
  const [target] = byStart(
    seeded.filter((r) => r.status === "confirmed" && r.startAt >= seededAt),
  );
  if (!target) throw new Error("No upcoming confirmed appointment");
  // Newest first, as the tab lists them.
  const theirs = byStart(
    seeded.filter((r) => r.contactId === target.contactId),
  ).reverse();

  await gotoApp(`/contacts/${target.contactId}`);
  await page.getByRole("tab", { name: "Appointments", exact: true }).click();
  const panel = page.getByRole("tabpanel");
  const listed = panel.locator("li[data-appointment-id]");
  await expect(listed).toHaveCount(theirs.length);
  expect(
    await listed.evaluateAll((items) =>
      items.map((li) => li.getAttribute("data-appointment-id")),
    ),
  ).toEqual(theirs.map((r) => r.id));
  // Each row links to its day on the calendar and prints the local time.
  const first = listed.first();
  await expect(first).toContainText(target.title);
  await expect(first).toContainText(localTimeIn(ZONE, target.startAt));
  await expect(first.getByRole("link")).toHaveAttribute(
    "href",
    `/calendars?view=day&date=${localDayIn(ZONE, target.startAt)}`,
  );

  await panel.getByRole("button", { name: "Book", exact: true }).click();
  const dialog = bookingDialog(page);
  await expect(dialog.getByRole("combobox", { name: "Contact" })).toHaveValue(
    target.contactName,
  );

  // Booked without touching Contact.
  const booked = await bookViaDialog(page, {
    calendar: CALENDAR,
    day: OTHER_DAY,
  });
  const row = await readAppointment(page, booked.id);
  expect(row.contactId).toBe(target.contactId);
  expect(localDayIn(ZONE, row.startAt)).toBe(OTHER_DAY);

  await expect(
    panel.locator(`li[data-appointment-id="${booked.id}"]`),
  ).toBeVisible();
  await expect(listed).toHaveCount(theirs.length + 1);
});

test("a booked slot is not offered until its appointment is cancelled", async ({
  page,
  gotoApp,
}) => {
  // About 6s alone on one worker, but about 27s in a full run on 16 workers,
  // close to Playwright's old 30s default. slow() triples the 60s budget.
  test.slow();
  const LATER_DAY = "2026-09-10";

  await gotoApp(`/calendars?view=day&date=${LATER_DAY}`);
  await expectPosition(page, "Day", longDayLabel(LATER_DAY));
  await expectViewLoaded(page, "Day");
  const seeded = await readSeededAppointments(page);
  const seededAt = await readSeededAt(page);
  const notice = seeded.find(
    (r) => r.calendarName === CALENDAR,
  )?.minSchedulingNoticeHours;
  if (notice === undefined) throw new Error(`No ${CALENDAR} appointment`);
  const contact = uniqueContact(await readContacts(page));

  const reopen = async () => {
    await page.getByRole("button", { name: "Book", exact: true }).click();
    const dialog = bookingDialog(page);
    await chooseCalendar(page, dialog, CALENDAR);
    await expect(dialog.getByLabel("Day", { exact: true })).toHaveValue(
      LATER_DAY,
    );
    return { dialog, offered: await openTimes(dialog, LATER_DAY, ZONE) };
  };

  await page.getByRole("button", { name: "Book", exact: true }).click();
  const booked = await bookViaDialog(page, {
    calendar: CALENDAR,
    day: LATER_DAY,
    contact,
  });
  // Well outside the notice, so cancelling gives the time back.
  expect(Date.parse(booked.start) - Date.parse(seededAt)).toBeGreaterThan(
    (notice + 12) * HOUR_MS,
  );

  // Booked: not offered.
  const taken = await reopen();
  expect(taken.offered.map((time) => time.start)).not.toContain(booked.start);
  await expect(timeRadio(taken.dialog, booked.label)).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(taken.dialog).toBeHidden();

  // Cancel it from its details.
  await viewRegion(page, "Day")
    .locator(`li[data-appointment-id="${booked.id}"]`)
    .getByRole("button")
    .click();
  const details = page.getByRole("dialog");
  await details.getByRole("button", { name: "Cancel appointment" }).click();
  await expect(
    page.getByText("Appointment cancelled", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => readPersistedStatus(page, booked.id))
    .toBe("cancelled");
  await page.keyboard.press("Escape");
  await expect(details).toBeHidden();

  // Cancelled: offered again, read from the booking dialog's own list.
  const freed = await reopen();
  expect(freed.offered.map((time) => time.start)).toContain(booked.start);
  await expect(timeRadio(freed.dialog, booked.label)).toBeVisible();
});

test("a slot that stops being offered while the dialog is open shows the API error", async ({
  page,
  gotoApp,
}) => {
  // The demo clock runs from the seed anchor at the moment the app loads
  // (src/lib/mock/clock.ts): apiNow() = seededAt + (Date.now() - load time).
  // The load time is bracketed by the wall clock either side of loading.
  const loadFrom = Date.now();
  await gotoApp(`/calendars?view=day&date=${DAY}`);
  const loadTo = Date.now();
  expect(loadTo - loadFrom).toBeLessThan(60_000);
  await expectViewLoaded(page, "Day");
  const seeded = await readSeededAppointments(page);
  const seededAt = Date.parse(await readSeededAt(page));
  const notice = seeded.find(
    (r) => r.calendarName === CALENDAR,
  )?.minSchedulingNoticeHours;
  if (notice === undefined) throw new Error(`No ${CALENDAR} appointment`);
  const contact = uniqueContact(await readContacts(page));
  const before = await readAppointmentIds(page);

  await page.getByRole("button", { name: "Book", exact: true }).click();
  const dialog = bookingDialog(page);
  await chooseCalendar(page, dialog, CALENDAR);
  await chooseContact(page, dialog, contact);
  const [slot, next] = await openTimes(dialog, DAY, ZONE);
  if (!slot || !next) throw new Error("Fewer than two open times");
  await timeRadio(dialog, slot.label).click();

  // The demo clock moves on until the slot is a quarter of an hour inside the
  // calendar's notice: still listed, no longer bookable, while the next time
  // (half an hour later) is still outside it. The quarter hour dwarfs the
  // load-time bracket. The fake clock goes in only now, after the app has
  // loaded: @date-fns/tz's TZDate subclasses whatever `Date` is global when
  // it loads, and a subclass of Playwright's fake Date loses its zone.
  const demoNow = Date.parse(slot.start) - notice * HOUR_MS + 15 * 60_000;
  expect(Date.parse(next.start) - demoNow).toBeGreaterThan(notice * HOUR_MS);
  await page.clock.setFixedTime(
    new Date(demoNow - seededAt + (loadFrom + loadTo) / 2),
  );
  await dialog.getByRole("button", { name: "Book appointment" }).click();

  await expect(dialog.getByRole("alert")).toHaveText(
    "That time is not an open slot on this calendar. Pick another one.",
  );
  await expect(dialog).toBeVisible();
  // The list is read again and the slot drops out of it.
  await expect(
    timeGroup(dialog).locator(`[data-start="${slot.start}"]`),
  ).toHaveCount(0);
  const offered = (await openTimes(dialog, DAY, ZONE)).map(
    (time) => time.start,
  );
  expect(offered).not.toContain(slot.start);
  expect(offered).toContain(next.start);
  // Nothing was stored.
  expect(await readAppointmentIds(page)).toEqual(before);
});
