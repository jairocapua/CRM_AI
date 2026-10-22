import type { Locator, Page } from "@playwright/test";

import {
  expectPosition,
  expectViewLoaded,
  localDayIn,
  localTimeIn,
  longDayLabel,
  readContactActivitySummaries,
  readPersistedStatus,
  readSeededAppointments,
  readSeededAt,
  segmentsIn,
  viewRegion,
  type SeededAppointment,
} from "./calendar-helpers";
import { expect, test } from "./fixtures";

/**
 * Appointment details: a chip or block opens a dialog with the contact, the
 * time in the viewer's zone and in the calendar's, the calendar, location and
 * status. The status changes there and the appointment can be cancelled.
 * Within a day, live appointments are listed before cancelled ones in every
 * view, so a cancellation never pushes a live booking behind "+N more".
 *
 * Checked against an oracle the UI does not share: the persisted database.
 * The viewer is in Singapore while every seeded calendar is in Los Angeles,
 * so "your time" and "calendar time" always differ.
 */

const ZONE = "Asia/Singapore";
const MONTH_URL = "/calendars?view=month&date=2026-09-08";
const GRID_FIRST = "2026-08-30";
const GRID_LAST = "2026-10-03";
const HOUR_MS = 3_600_000;

/** The labels the details print for a location type. */
const LOCATION_LABELS: Record<string, string> = {
  zoom: "Zoom",
  phone: "Phone",
  in_person: "In person",
  google_meet: "Google Meet",
};

test.use({ timezoneId: ZONE, locale: "en-US" });

const isCancelled = (row: SeededAppointment) => row.status === "cancelled";

/** By start time, ties kept in the store's order, as the API sorts. */
const byStart = (rows: readonly SeededAppointment[]) =>
  [...rows].sort((a, b) => a.startAt.localeCompare(b.startAt));

/** The order a day should list its rows in: live by start, then cancelled. */
function liveFirstOrder(rows: readonly SeededAppointment[]) {
  const sorted = byStart(rows);
  return [
    ...sorted.filter((row) => !isCancelled(row)),
    ...sorted.filter(isCancelled),
  ];
}

/** The September grid's rows by local day in `ZONE`, in the store's order. */
function septemberByDay(rows: readonly SeededAppointment[]) {
  const byDay = new Map<string, SeededAppointment[]>();
  for (const row of rows) {
    const day = localDayIn(ZONE, row.startAt);
    if (day < GRID_FIRST || day > GRID_LAST) continue;
    byDay.set(day, [...(byDay.get(day) ?? []), row]);
  }
  return byDay;
}

/**
 * A future live appointment shown as a chip on a crowded day, which a cancel
 * pushes behind "+N more": its day has four or more rows and three or more
 * live ones, and it is one of the first two live ones. Future, so its details
 * offer Cancel. Fails loudly if the seed has none, so no test passes
 * vacuously.
 */
async function chipThatCancelHides(page: Page) {
  const rows = await readSeededAppointments(page);
  const seededAt = await readSeededAt(page);
  for (const [day, dayRows] of septemberByDay(rows)) {
    const live = byStart(dayRows.filter((row) => !isCancelled(row)));
    if (dayRows.length < 4 || live.length < 3) continue;
    const target = live.slice(0, 2).find((row) => row.startAt > seededAt);
    if (!target) continue;

    // `includeHidden`: while the modal is open the page behind it is
    // aria-hidden, and a plain role locator would match nothing there, so a
    // count of 0 would pass vacuously.
    const grid = page.getByRole("region", {
      name: "Month view",
      exact: true,
      includeHidden: true,
    });
    const chip = grid.locator(`li[data-appointment-id="${target.id}"]`);
    return {
      target,
      chip,
      chipButton: chip.locator("button"),
      more: grid
        .getByRole("group", { name: longDayLabel(day), exact: true })
        .getByRole("button", {
          name: `+${dayRows.length - 2} more`,
          exact: true,
        }),
    };
  }
  throw new Error("No future chip in September that a cancel would hide");
}

/** Opens the details from a month chip and cancels the appointment. */
async function cancelFromChip(
  page: Page,
  { target, chip, chipButton }: Awaited<ReturnType<typeof chipThatCancelHides>>,
) {
  await chipButton.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading")).toHaveText(target.title);
  await dialog.getByRole("button", { name: "Cancel appointment" }).click();
  await expect(
    page.getByText("Appointment cancelled", { exact: true }),
  ).toBeVisible();
  // The refetch has landed: the dialog's row reads cancelled.
  await expect(
    dialog.getByRole("button", { name: "Cancel appointment" }),
  ).toHaveCount(0);
  await expect
    .poll(() => readPersistedStatus(page, target.id))
    .toBe("cancelled");
  // Listed after the day's live ones now, so behind "+N more": the button
  // that opened the dialog has left the page.
  await expect(chip).toHaveCount(0);
  return dialog;
}

/** The value next to a term in the details' description list. */
const detail = (dialog: Locator, term: string) =>
  dialog
    .locator("dt", { hasText: new RegExp(`^${term}$`) })
    .locator("xpath=following-sibling::dd[1]");

/**
 * The label a select shows. Not the trigger's whole text: Base UI's select
 * icon keeps a "▼" text node inside the chevron SVG.
 */
const selectedLabel = (trigger: Locator) =>
  trigger.locator('[data-slot="select-value"]');

/** Opens an appointment's details from its block in day view. */
async function openFromDayView(page: Page, row: SeededAppointment) {
  const day = localDayIn(ZONE, row.startAt);
  await expectPosition(page, "Day", longDayLabel(day));
  await expectViewLoaded(page, "Day");
  await viewRegion(page, "Day")
    .locator(`li[data-appointment-id="${row.id}"]`)
    .getByRole("button")
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading")).toHaveText(row.title);
  return dialog;
}

test("live appointments are listed before cancelled ones and stay above +N more", async ({
  page,
  gotoApp,
}) => {
  await gotoApp(MONTH_URL);
  await expectPosition(page, "Month", "September 2026");
  await expectViewLoaded(page, "Month");

  const rows = await readSeededAppointments(page);
  const byDay = septemberByDay(rows);

  // Never vacuous: a crowded day where start order alone would put a
  // cancelled chip among the two shown while live ones went behind "+N more".
  const crowded = [...byDay].filter(
    ([, dayRows]) =>
      dayRows.length > 3 &&
      dayRows.filter((row) => !isCancelled(row)).length >= 2 &&
      byStart(dayRows).slice(0, 2).some(isCancelled),
  );
  expect(crowded.length).toBeGreaterThan(0);

  // Every cell shows exactly the oracle's chips, in its order: all of them up
  // to three, else the first two and "+N more".
  const cells = viewRegion(page, "Month").locator("[data-day]");
  const shown = await cells.evaluateAll((elements) =>
    elements.map((cell) => [
      cell.getAttribute("data-day") ?? "",
      [...cell.querySelectorAll("li[data-appointment-id]")].map(
        (li) => li.getAttribute("data-appointment-id") ?? "",
      ),
    ]),
  );
  expect(shown).toHaveLength(35);
  expect(Object.fromEntries(shown)).toEqual(
    Object.fromEntries(
      shown.map(([day]) => {
        const ordered = liveFirstOrder(byDay.get(day as string) ?? []);
        const visible = ordered.length <= 3 ? ordered : ordered.slice(0, 2);
        return [day, visible.map((row) => row.id)];
      }),
    ),
  );

  // On a crowded day the chips shown are live, and "+N more" counts the rest.
  const [day, dayRows] = crowded[0] as [string, SeededAppointment[]];
  const cell = viewRegion(page, "Month").getByRole("group", {
    name: longDayLabel(day),
    exact: true,
  });
  const chips = cell.getByRole("listitem");
  await expect(chips).toHaveCount(2);
  for (const chip of await chips.all()) {
    await expect(chip).not.toHaveAttribute("data-status", "cancelled");
  }
  await cell
    .getByRole("button", { name: `+${dayRows.length - 2} more`, exact: true })
    .click();

  // The day view lists them live first too, and still shows the cancelled
  // ones, struck through.
  await expectPosition(page, "Day", longDayLabel(day));
  await expectViewLoaded(page, "Day");
  const blocks = viewRegion(page, "Day").locator("li[data-appointment-id]");
  const onDay = segmentsIn(ZONE, rows, [day]).map((segment) => segment.row);
  await expect(blocks).toHaveCount(onDay.length);
  const order = await blocks.evaluateAll((elements) =>
    elements.map((li) => ({
      id: li.getAttribute("data-appointment-id") ?? "",
      status: li.getAttribute("data-status") ?? "",
    })),
  );
  expect(order.map((block) => block.id)).toEqual(
    liveFirstOrder(onDay).map((row) => row.id),
  );
  const firstCancelled = order.findIndex(
    (block) => block.status === "cancelled",
  );
  expect(firstCancelled).toBeGreaterThan(0);
  expect(
    order.slice(firstCancelled).every((block) => block.status === "cancelled"),
  ).toBe(true);
  await expect(
    viewRegion(page, "Day")
      .locator('li[data-status="cancelled"]')
      .first()
      .locator("span")
      .first(),
  ).toHaveCSS("text-decoration-line", "line-through");
});

test("cancelling removes it from the Upcoming card and frees its slot", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/dashboard");
  const rows = await readSeededAppointments(page);
  const seededAt = await readSeededAt(page);

  // The card lists the next six confirmed bookings from the demo's "now".
  const upcoming = byStart(
    rows.filter((row) => row.status === "confirmed" && row.startAt >= seededAt),
  );
  // A seventh must step up once one is cancelled.
  expect(upcoming.length).toBeGreaterThan(6);
  const card = page
    .locator('[data-slot="card"]')
    .filter({ has: page.getByText("Upcoming appointments", { exact: true }) });
  const cardRows = card.locator("li[data-appointment-id]");
  await expect(cardRows).toHaveCount(6);
  const cardIds = () =>
    cardRows.evaluateAll((elements) =>
      elements.map((li) => li.getAttribute("data-appointment-id")),
    );
  expect(await cardIds()).toEqual(upcoming.slice(0, 6).map((row) => row.id));

  // One whose start is well past its calendar's minimum notice, so the
  // booking engine can offer its time again once it is cancelled.
  const target = upcoming
    .slice(0, 6)
    .find(
      (row) =>
        Date.parse(row.startAt) - Date.parse(seededAt) >
        (row.minSchedulingNoticeHours + 2) * HOUR_MS,
    );
  if (!target) throw new Error("No upcoming appointment outside its notice");

  await gotoApp(`/calendars?view=day&date=${localDayIn(ZONE, target.startAt)}`);
  const dialog = await openFromDayView(page, target);

  // The details: contact, both zones' times, calendar, location, status.
  await expect(
    detail(dialog, "Contact").getByRole("link", {
      name: target.contactName,
      exact: true,
    }),
  ).toHaveAttribute("href", `/contacts/${target.contactId}`);
  await expect(detail(dialog, "Your time")).toContainText(
    `${localTimeIn(ZONE, target.startAt)} – ${localTimeIn(ZONE, target.endAt)}`,
  );
  await expect(detail(dialog, "Your time")).toContainText(
    "Asia/Singapore · GMT+8",
  );
  await expect(detail(dialog, "Calendar time")).toContainText(
    `${localTimeIn(target.timezone, target.startAt)} – ${localTimeIn(
      target.timezone,
      target.endAt,
    )}`,
  );
  await expect(detail(dialog, "Calendar time")).toContainText(
    `${target.timezone} · GMT-7`,
  );
  await expect(dialog).toContainText(target.calendarName);
  expect(target.locationType).not.toBeNull();
  await expect(detail(dialog, "Location")).toContainText(
    LOCATION_LABELS[target.locationType ?? ""] ?? "unknown location",
  );
  const status = dialog.getByRole("combobox", { name: "Status" });
  await expect(selectedLabel(status)).toHaveText("Confirmed");

  await dialog.getByRole("button", { name: "Cancel appointment" }).click();
  await expect(
    page.getByText("Appointment cancelled", { exact: true }),
  ).toBeVisible();
  await expect(selectedLabel(status)).toHaveText("Cancelled");
  // Read from the booking engine's own slots for that calendar day: it says
  // "no longer offered" if cancelling did not give the time back.
  await expect(
    dialog.getByText("This time is open for booking again.", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Cancel appointment" }),
  ).toHaveCount(0);
  await expect
    .poll(() => readPersistedStatus(page, target.id))
    .toBe("cancelled");

  // It stays on the calendar, struck through.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(
    viewRegion(page, "Day").locator(`li[data-appointment-id="${target.id}"]`),
  ).toHaveAttribute("data-status", "cancelled");

  // And leaves the Upcoming card, where the next booking takes its place.
  await page
    .locator('[data-slot="sidebar"]')
    .getByRole("link", { name: "Dashboard", exact: true })
    .click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(cardRows).toHaveCount(6);
  await expect(
    card.locator(`li[data-appointment-id="${target.id}"]`),
  ).toHaveCount(0);
  expect(await cardIds()).toEqual(
    upcoming
      .filter((row) => row.id !== target.id)
      .slice(0, 6)
      .map((row) => row.id),
  );
});

test("a status change appears on the contact's activity timeline", async ({
  page,
  gotoApp,
}) => {
  const SUMMARY = "Appointment marked no show";

  await gotoApp(MONTH_URL);
  await expectViewLoaded(page, "Month");
  const rows = await readSeededAppointments(page);
  const seededAt = await readSeededAt(page);

  // A held appointment in September that the contact showed up to.
  const target = byStart(
    rows.filter(
      (row) =>
        row.status === "showed" &&
        row.endAt <= seededAt &&
        localDayIn(ZONE, row.startAt).startsWith("2026-09"),
    ),
  ).at(-1);
  if (!target) throw new Error("No showed appointment in September");
  const before = (
    await readContactActivitySummaries(page, target.contactId)
  ).filter((summary) => summary === SUMMARY).length;

  await gotoApp(`/calendars?view=day&date=${localDayIn(ZONE, target.startAt)}`);
  const dialog = await openFromDayView(page, target);

  const status = dialog.getByRole("combobox", { name: "Status" });
  await expect(selectedLabel(status)).toHaveText("Showed");
  await status.click();
  await page.getByRole("option", { name: "No Show", exact: true }).click();
  await expect(selectedLabel(status)).toHaveText("No Show");
  await expect(page.getByText("Marked No Show", { exact: true })).toBeVisible();
  await expect.poll(() => readPersistedStatus(page, target.id)).toBe("no_show");

  // The contact link leads to their record and closes the dialog.
  await detail(dialog, "Contact")
    .getByRole("link", { name: target.contactName, exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/contacts/${target.contactId}$`));
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // The Activity tab, newest first: the change is on top.
  const titles = page.locator('[data-slot="item-title"]');
  await expect(titles.first()).toHaveText(SUMMARY);
  await expect(page.getByText(SUMMARY, { exact: true })).toHaveCount(
    before + 1,
  );
});

test("Undo in the toast restores a cancelled appointment", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/dashboard");
  const rows = await readSeededAppointments(page);
  const seededAt = await readSeededAt(page);
  const [target] = byStart(
    rows.filter((row) => row.status === "confirmed" && row.startAt >= seededAt),
  );
  if (!target) throw new Error("No upcoming confirmed appointment");

  await gotoApp(`/calendars?view=day&date=${localDayIn(ZONE, target.startAt)}`);
  const dialog = await openFromDayView(page, target);
  const status = dialog.getByRole("combobox", { name: "Status" });
  await dialog.getByRole("button", { name: "Cancel appointment" }).click();
  await expect(selectedLabel(status)).toHaveText("Cancelled");
  await expect
    .poll(() => readPersistedStatus(page, target.id))
    .toBe("cancelled");

  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByText("Appointment restored", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => readPersistedStatus(page, target.id))
    .toBe("confirmed");

  // The dialog stays open and shows it live again, cancellable once more.
  await expect(selectedLabel(status)).toHaveText("Confirmed");
  await expect(
    dialog.getByRole("button", { name: "Cancel appointment" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  const block = viewRegion(page, "Day").locator(
    `li[data-appointment-id="${target.id}"]`,
  );
  await expect(block).toHaveAttribute("data-status", "confirmed");
  // Focus is back on the block that opened the details.
  await expect(block.locator("button")).toBeFocused();
});

test("closing the details returns focus to the chip, or to +N more once a cancel hides it", async ({
  page,
  gotoApp,
}) => {
  await gotoApp(MONTH_URL);
  await expectPosition(page, "Month", "September 2026");
  await expectViewLoaded(page, "Month");
  const found = await chipThatCancelHides(page);
  const dialog = page.getByRole("dialog");

  // Nothing changed: focus goes back to the chip that opened the details.
  await found.chipButton.click();
  await expect(dialog.getByRole("heading")).toHaveText(found.target.title);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(found.chipButton).toBeFocused();

  // Cancelled, the chip is behind "+N more", and focus goes there instead of
  // falling to <body>.
  await cancelFromChip(page, found);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(found.more).toBeFocused();
});

test("after Undo, closing the details focuses the restored chip", async ({
  page,
  gotoApp,
}) => {
  await gotoApp(MONTH_URL);
  await expectPosition(page, "Month", "September 2026");
  await expectViewLoaded(page, "Month");
  const found = await chipThatCancelHides(page);
  const dialog = await cancelFromChip(page, found);

  // Undo with the dialog still open brings the chip back, as a new element.
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByText("Appointment restored", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => readPersistedStatus(page, found.target.id))
    .toBe(found.target.status);
  await expect(found.chip).toHaveCount(1);
  await expect(dialog).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(found.chipButton).toBeFocused();
});
