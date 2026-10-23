import type { Page } from "@playwright/test";

import { readCalendarAvailability } from "./calendar-helpers";
import { expect, test } from "./fixtures";

/**
 * The availability editor's two safety rules (P7-T20).
 *
 * - Unsaved edits are not dropped without asking. With the form dirty,
 *   choosing another calendar in the Calendar select, or following "Back to
 *   calendars", opens a "Discard unsaved changes?" alert dialog: Keep editing
 *   (or Escape) changes nothing and puts focus back on the control used;
 *   Discard changes goes ahead. A clean form (just loaded, discarded or
 *   saved) never asks. Only those two controls are guarded: the sidebar,
 *   browser back/forward and reload are not, so they are not tested here.
 * - An open day always has hours. Removing an enabled day's last window
 *   switches the day off ("Unavailable") and moves focus to its switch, so
 *   the editor can never save `{ enabled: true, windows: [] }`.
 *
 * The dialog is modal, so while it is open Base UI hides the page behind it
 * from the accessibility tree (LEARNINGS P7-T14): checks on the page made
 * then pass `includeHidden: true`, and "no dialog" checks come after a URL
 * change that only the unguarded path makes, so they cannot pass vacuously.
 *
 * Seed facts this relies on, pinned by tripwires below so a seed change fails
 * loudly instead of passing trivially: the picker opens on Discovery Call,
 * the first calendar by name, whose Tuesday is 09:00–17:00 with 30-minute
 * slots; Strategy Session (`?calendar=strategy`) keeps Tuesday 09:00–16:00
 * with 60-minute slots.
 */

const PATH = "/calendars/availability";
const FIRST = "Discovery Call";
const OTHER = "Strategy Session";
const TUESDAY = 2;
const DIALOG_TITLE = "Discard unsaved changes?";

/** Cross-route navigations can be slow on a loaded machine (LEARNINGS
 *  P7-T15/T16). */
const NAVIGATION = { timeout: 15_000 };

/** For checks on the page while the modal dialog hides it. */
const HIDDEN = { includeHidden: true };

const calendarSelect = (
  page: Page,
  options: { includeHidden?: boolean } = {},
) => page.getByRole("combobox", { name: "Calendar", ...options });

/** The select's label, not the trigger's whole text: Base UI's select icon
 *  keeps a "▼" text node inside the chevron. */
const selectValue = (page: Page, options: { includeHidden?: boolean } = {}) =>
  calendarSelect(page, options).locator('[data-slot="select-value"]');

const tuesday = (page: Page, options: { includeHidden?: boolean } = {}) =>
  page.getByRole("group", { name: "Tuesday", exact: true, ...options });

const windowEdge = (
  page: Page,
  edge: "Start" | "End",
  n: number,
  options: { includeHidden?: boolean } = {},
) =>
  tuesday(page, options).getByLabel(`${edge} of window ${n}`, { exact: true });

const tuesdaySwitch = (page: Page) =>
  page.getByRole("switch", { name: "Available on Tuesday" });

const leaveDialog = (page: Page) =>
  page.getByRole("alertdialog", { name: DIALOG_TITLE });

/** Any alert dialog at all, hidden or not. */
const anyAlertDialog = (page: Page) =>
  page.getByRole("alertdialog", { includeHidden: true });

const backLink = (page: Page) =>
  page.getByRole("link", { name: "Back to calendars" });

const slotDuration = (page: Page) =>
  page.getByLabel("Slot duration", { exact: true });

/** The form's own Discard changes: the dialog has a button of that name too. */
const formDiscard = (page: Page) =>
  page.locator("form").getByRole("button", { name: "Discard changes" });

const saveButton = (page: Page) =>
  page.getByRole("button", { name: "Save availability" });

/** Opens the Calendar select and picks `name`, whatever happens next. */
async function pickCalendar(page: Page, name: string) {
  await calendarSelect(page).click();
  await page.getByRole("option", { name, exact: true }).click();
}

async function openEditor(
  page: Page,
  gotoApp: (path: string) => Promise<void>,
) {
  await gotoApp(PATH);
  // Tripwire: the editor opens on the first calendar by name.
  await expect(selectValue(page)).toHaveText(FIRST);
}

test("switching calendars with unsaved edits asks first; Keep editing and Escape keep them", async ({
  page,
  gotoApp,
}) => {
  await openEditor(page, gotoApp);
  await expect(windowEdge(page, "End", 1)).toHaveValue("17:00");
  await windowEdge(page, "End", 1).fill("12:00");

  await pickCalendar(page, OTHER);
  const dialog = leaveDialog(page);
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(FIRST);
  await expect(dialog).toContainText(OTHER);
  // The safe choice has focus.
  await expect(
    dialog.getByRole("button", { name: "Keep editing" }),
  ).toBeFocused();
  // Nothing has switched while the question is open.
  await expect(page).toHaveURL(/\/calendars\/availability$/);
  await expect(selectValue(page, HIDDEN)).toHaveText(FIRST);
  await expect(windowEdge(page, "End", 1, HIDDEN)).toHaveValue("12:00");

  async function expectEditKept() {
    await expect(leaveDialog(page)).toBeHidden();
    await expect(page).toHaveURL(/\/calendars\/availability$/);
    await expect(selectValue(page)).toHaveText(FIRST);
    await expect(windowEdge(page, "End", 1)).toHaveValue("12:00");
    await expect(formDiscard(page)).toBeEnabled();
    await expect(calendarSelect(page)).toBeFocused();
  }

  await dialog.getByRole("button", { name: "Keep editing" }).click();
  await expectEditKept();

  // Escape is the same as Keep editing.
  await pickCalendar(page, OTHER);
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expectEditKept();
});

test("Discard changes switches calendars and drops the unsaved edit", async ({
  page,
  gotoApp,
}) => {
  await openEditor(page, gotoApp);
  const saved = await readCalendarAvailability(page, FIRST);
  // Tripwires: the two calendars' saved Tuesdays differ.
  expect(saved.find((rule) => rule.weekday === TUESDAY)).toEqual({
    weekday: TUESDAY,
    enabled: true,
    windows: [{ start: "09:00", end: "17:00" }],
  });
  expect(
    (await readCalendarAvailability(page, OTHER)).find(
      (rule) => rule.weekday === TUESDAY,
    ),
  ).toEqual({
    weekday: TUESDAY,
    enabled: true,
    windows: [{ start: "09:00", end: "16:00" }],
  });

  await windowEdge(page, "End", 1).fill("12:00");
  await pickCalendar(page, OTHER);
  const dialog = leaveDialog(page);
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Discard changes" }).click();

  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\?calendar=strategy$/);
  await expect(selectValue(page)).toHaveText(OTHER);
  await expect(windowEdge(page, "Start", 1)).toHaveValue("09:00");
  await expect(windowEdge(page, "End", 1)).toHaveValue("16:00");
  await expect(formDiscard(page)).toBeDisabled();
  await expect(calendarSelect(page)).toBeFocused();
  // The edit was dropped, not saved.
  expect(await readCalendarAvailability(page, FIRST)).toEqual(saved);

  // The new calendar's form is clean: going back asks nothing.
  await pickCalendar(page, FIRST);
  await expect(page).toHaveURL(/\?calendar=discovery$/);
  await expect(anyAlertDialog(page)).toHaveCount(0);
  await expect(selectValue(page)).toHaveText(FIRST);
  await expect(windowEdge(page, "End", 1)).toHaveValue("17:00");
});

test("Back to calendars with unsaved edits asks first, by keyboard and pointer", async ({
  page,
  gotoApp,
}) => {
  await openEditor(page, gotoApp);
  // Tripwire: Discovery Call's slots are 30 minutes long.
  await expect(slotDuration(page)).toHaveValue("30");
  await slotDuration(page).fill("45");

  // By keyboard: Enter on the focused link.
  const link = backLink(page);
  await link.focus();
  await page.keyboard.press("Enter");
  const dialog = leaveDialog(page);
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(FIRST);
  await expect(page).toHaveURL(/\/calendars\/availability$/);

  await dialog.getByRole("button", { name: "Keep editing" }).click();
  await expect(dialog).toBeHidden();
  await expect(link).toBeFocused();
  await expect(slotDuration(page)).toHaveValue("45");
  await expect(page).toHaveURL(/\/calendars\/availability$/);

  // By pointer, and this time leave.
  await link.click();
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/\/calendars\/availability$/);
  await dialog.getByRole("button", { name: "Discard changes" }).click();
  await expect(page).toHaveURL(/\/calendars$/, NAVIGATION);

  // Nothing was saved.
  await page.getByRole("link", { name: "Availability", exact: true }).click();
  await expect(page).toHaveURL(/\/calendars\/availability$/, NAVIGATION);
  await expect(selectValue(page)).toHaveText(FIRST);
  await expect(slotDuration(page)).toHaveValue("30");
  await expect(anyAlertDialog(page)).toHaveCount(0);
});

test("a clean editor switches and leaves without asking", async ({
  page,
  gotoApp,
}) => {
  await openEditor(page, gotoApp);

  // Just loaded.
  await pickCalendar(page, OTHER);
  await expect(page).toHaveURL(/\?calendar=strategy$/);
  await expect(anyAlertDialog(page)).toHaveCount(0);
  await expect(selectValue(page)).toHaveText(OTHER);

  // After the form's own Discard changes.
  // Tripwire: Strategy Session's slots are 60 minutes long.
  await expect(slotDuration(page)).toHaveValue("60");
  await slotDuration(page).fill("90");
  await expect(formDiscard(page)).toBeEnabled();
  await formDiscard(page).click();
  await expect(slotDuration(page)).toHaveValue("60");
  await expect(formDiscard(page)).toBeDisabled();
  await pickCalendar(page, FIRST);
  await expect(page).toHaveURL(/\?calendar=discovery$/);
  await expect(anyAlertDialog(page)).toHaveCount(0);
  await expect(selectValue(page)).toHaveText(FIRST);

  // After a save.
  await slotDuration(page).fill("45");
  await saveButton(page).click();
  await expect(
    page.getByText("Availability saved", { exact: true }),
  ).toBeVisible();
  await expect(formDiscard(page)).toBeDisabled();
  await backLink(page).click();
  await expect(page).toHaveURL(/\/calendars$/, NAVIGATION);
  await expect(anyAlertDialog(page)).toHaveCount(0);
});

test("removing a day's last window switches the day off", async ({
  page,
  gotoApp,
}) => {
  await openEditor(page, gotoApp);
  const saved = await readCalendarAvailability(page, FIRST);
  const day = tuesday(page);
  const toggle = tuesdaySwitch(page);
  await expect(toggle).toBeChecked();
  await expect(windowEdge(page, "Start", 1)).toHaveValue("09:00");
  await expect(windowEdge(page, "End", 1)).toHaveValue("17:00");

  // Of two windows, removing one keeps the day open with the other.
  await day.getByRole("button", { name: "Add hours on Tuesday" }).click();
  await expect(windowEdge(page, "Start", 2)).toHaveValue("17:00");
  await expect(windowEdge(page, "End", 2)).toHaveValue("18:00");
  const removeFirst = day.getByRole("button", {
    name: "Remove window 1 on Tuesday",
    exact: true,
  });
  await removeFirst.click();
  await expect(toggle).toBeChecked();
  await expect(windowEdge(page, "Start", 1)).toHaveValue("17:00");
  await expect(windowEdge(page, "Start", 2)).toHaveCount(0);

  // Removing the last one switches the day off.
  await removeFirst.click();
  await expect(toggle).not.toBeChecked();
  await expect(day).toContainText("Unavailable");
  await expect(
    day.getByRole("button", { name: "Add hours on Tuesday" }),
  ).toHaveCount(0);
  await expect(toggle).toBeFocused();
  await expect(formDiscard(page)).toBeEnabled();

  // It saves as a day off, and nothing else changes.
  await saveButton(page).click();
  await expect(
    page.getByText("Availability saved", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => readCalendarAvailability(page, FIRST))
    .toEqual(
      saved.map((rule) =>
        rule.weekday === TUESDAY
          ? { weekday: TUESDAY, enabled: false, windows: [] }
          : rule,
      ),
    );

  // Switching it back on offers the usual hours.
  await toggle.click();
  await expect(toggle).toBeChecked();
  await expect(windowEdge(page, "Start", 1)).toHaveValue("09:00");
  await expect(windowEdge(page, "End", 1)).toHaveValue("17:00");
});
