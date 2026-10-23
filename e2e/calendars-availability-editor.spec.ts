import type { Page } from "@playwright/test";

import { readCalendarAvailability } from "./calendar-helpers";
import { expect, NAVIGATION, test, waitForBoot } from "./fixtures";

/**
 * The availability editor's two safety rules (P7-T20, widened app-wide in
 * P7-T33).
 *
 * - Unsaved edits are not dropped without asking. With the form dirty,
 *   choosing another calendar in the Calendar select opens the editor's own
 *   "Discard unsaved changes?" alert dialog, and every link out of the page
 *   (Back to calendars, the sidebar's 7 nav links, the user menu's My
 *   profile and Team settings) opens the same question from
 *   `UnsavedChangesProvider`. Keep editing (or Escape) changes nothing and
 *   puts focus back on the control used; Discard changes goes ahead, and
 *   releases the guard before it navigates. A reload or a closed tab gets
 *   the browser's own `beforeunload` prompt. A clean form (just loaded,
 *   discarded or saved) never asks, by any of those ways. The browser's Back
 *   is not guarded: a test pins that it leaves no stale question behind.
 * - An open day always has hours. Removing an enabled day's last window
 *   switches the day off ("Unavailable") and moves focus to its switch, so
 *   the editor can never save `{ enabled: true, windows: [] }`.
 *
 * The dialog is modal, so while it is open Base UI hides the page behind it
 * from the accessibility tree (LEARNINGS P7-T14): checks on the page made
 * then pass `includeHidden: true`, and "no dialog" checks come after a URL
 * change that only the unguarded path makes, so they cannot pass vacuously.
 *
 * Chromium shows a `beforeunload` prompt only on a page the viewer has
 * interacted with, and `fill()` alone does not count, so a test that needs
 * the prompt clicks the field before it types (`editSlotDuration`). The
 * prompt's own checks use `beforeUnloadPrevented`, which dispatches a
 * cancelable `beforeunload` and reports whether a listener cancelled it.
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

/** The sidebar's own links: its 7 nav items. The user menu's links live in
 *  a popup outside it. */
const sidebarLinks = (page: Page) =>
  page.locator('[data-slot="sidebar"]').getByRole("link");

const sidebarLink = (page: Page, name: string) =>
  page
    .locator('[data-slot="sidebar"]')
    .getByRole("link", { name, exact: true });

/** The sidebar footer's user menu trigger. */
const userMenu = (page: Page) =>
  page.getByRole("button", { name: /Jordan Reyes/ });

/** Opens the Calendar select and picks `name`, whatever happens next. */
async function pickCalendar(page: Page, name: string) {
  await calendarSelect(page).click();
  await page.getByRole("option", { name, exact: true }).click();
}

/** Clicks Slot duration, then types `value`. The click is the interaction
 *  Chromium needs before it lets the page show a `beforeunload` prompt. */
async function editSlotDuration(page: Page, value: string) {
  await slotDuration(page).click();
  await slotDuration(page).fill(value);
}

/** Whether a `beforeunload` listener would ask: dispatches a cancelable one
 *  and reports whether it was cancelled. Nothing unloads. The listener comes
 *  and goes a few effects after the form's dirty state changes, so read it
 *  through `expect.poll`, never once. */
const beforeUnloadPrevented = (page: Page) =>
  page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });

/**
 * Starts watching for any alert dialog, however briefly it is in the DOM,
 * and returns a reader for whether one has appeared since. Start it with no
 * alert dialog on the page.
 */
async function watchAlertDialogs(page: Page): Promise<() => Promise<boolean>> {
  await page.evaluate(() => {
    const flags = window as Window & { e2eSawAlertDialog?: boolean };
    flags.e2eSawAlertDialog = false;
    const look = () => {
      if (document.querySelector('[role="alertdialog"]')) {
        flags.e2eSawAlertDialog = true;
      }
    };
    look();
    new MutationObserver(look).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["role"],
    });
  });
  return () =>
    page.evaluate(
      () =>
        (window as Window & { e2eSawAlertDialog?: boolean })
          .e2eSawAlertDialog === true,
    );
}

/**
 * Holds every route-data request for /calendars (a client navigation's
 * `?_rsc=` fetch, prefetches included) until `release()`, so a navigation
 * there stays in flight. The page itself is not held: a document load has no
 * `_rsc`. Returns `release` and `navigations()`, how many held requests were
 * navigations rather than prefetches (Next marks a prefetch with a
 * `next-router-prefetch` header).
 */
async function holdCalendarsRsc(page: Page) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let navigations = 0;
  await page.route(
    (url) => url.pathname === "/calendars" && url.searchParams.has("_rsc"),
    async (route) => {
      if (!route.request().headers()["next-router-prefetch"]) navigations += 1;
      await gate;
      // The page may have moved on and aborted the request meanwhile.
      await route.continue().catch(() => {});
    },
  );
  return { release, navigations: () => navigations };
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

test("every sidebar link asks before dropping unsaved edits", async ({
  page,
  gotoApp,
  consoleProblems,
}) => {
  await openEditor(page, gotoApp);
  // Tripwire: Discovery Call's slots are 30 minutes long.
  await expect(slotDuration(page)).toHaveValue("30");
  await editSlotDuration(page, "45");

  const links = sidebarLinks(page);
  // Tripwire: the sidebar has its 7 nav links, so the loop covers them all.
  await expect(links).toHaveCount(7);
  const dialog = leaveDialog(page);
  const keepEditing = dialog.getByRole("button", { name: "Keep editing" });

  async function expectAsked() {
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(FIRST);
    await expect(dialog).toContainText("Leaving this page will discard them.");
    await expect(keepEditing).toBeFocused();
    await expect(page).toHaveURL(/\/calendars\/availability$/);
  }

  async function expectEditKept() {
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/calendars\/availability$/);
    await expect(slotDuration(page)).toHaveValue("45");
    await expect(formDiscard(page)).toBeEnabled();
  }

  for (let i = 0; i < 7; i += 1) {
    const link = links.nth(i);
    await link.click();
    await expectAsked();
    // Escape and Keep editing take turns: both keep the edit.
    if (i % 2 === 0) await page.keyboard.press("Escape");
    else await keepEditing.click();
    await expectEditKept();
    await expect(link).toBeFocused();
  }

  // The user menu's links ask too. Focus is not checked on the way back:
  // the menu item that asked is gone by then.
  for (const name of ["My profile", "Team settings"]) {
    await userMenu(page).click();
    await page.getByRole("menuitem", { name, exact: true }).click();
    await expectAsked();
    await page.keyboard.press("Escape");
    await expectEditKept();
  }

  // Discard changes leaves at once and drops the edit.
  await sidebarLink(page, "Contacts").click();
  await expectAsked();
  await dialog.getByRole("button", { name: "Discard changes" }).click();
  await expect(page).toHaveURL(/\/contacts$/, NAVIGATION);
  await expect(anyAlertDialog(page)).toHaveCount(0);

  await sidebarLink(page, "Calendars").click();
  await expect(page).toHaveURL(/\/calendars$/, NAVIGATION);
  await page.getByRole("link", { name: "Availability", exact: true }).click();
  await expect(page).toHaveURL(/\/calendars\/availability$/, NAVIGATION);
  await expect(selectValue(page)).toHaveText(FIRST);
  await expect(slotDuration(page)).toHaveValue("30");
  await expect(anyAlertDialog(page)).toHaveCount(0);

  excuseTeamSettingsPrefetch(consoleProblems);
});

/**
 * /settings/team has no page until Phase 9, and Next prefetches the user
 * menu's Team settings link as soon as the menu opens, so the browser logs a
 * 404 for its route data. Removes exactly that console problem, and nothing
 * else, from the fixture's list; drop this once the page exists. Called as
 * the test's last step, so a test that fails earlier also lists that 404
 * beside its real failure.
 */
function excuseTeamSettingsPrefetch(problems: string[]) {
  const teamPrefetch =
    /^console\.error: Failed to load resource: the server responded with a status of 404 \(Not Found\) \(https?:\/\/[^/]+\/settings\/team\?_rsc=[^)]*\)$/;
  const kept = problems.filter((problem) => !teamPrefetch.test(problem));
  problems.splice(0, problems.length, ...kept);
}

test("reload and tab close with unsaved edits get the browser's prompt", async ({
  page,
  gotoApp,
}) => {
  await openEditor(page, gotoApp);
  await expect(slotDuration(page)).toHaveValue("30");
  await editSlotDuration(page, "45");
  await expect.poll(() => beforeUnloadPrevented(page)).toBe(true);

  // Survives only if this document is never unloaded.
  await page.evaluate(() => {
    (window as Window & { e2eMarker?: string }).e2eMarker = "kept";
  });
  const marker = () =>
    page.evaluate(() => (window as Window & { e2eMarker?: string }).e2eMarker);

  const dialogs: string[] = [];
  let answer: "dismiss" | "accept" = "dismiss";
  page.on("dialog", async (dialog) => {
    dialogs.push(dialog.type());
    if (answer === "accept") await dialog.accept();
    else await dialog.dismiss();
  });

  // A reload, refused at the prompt: the page and the edit stay. Started
  // from a timer, so the evaluate returns before the unload begins.
  await page.evaluate(() => {
    setTimeout(() => location.reload(), 0);
  });
  await expect.poll(() => dialogs).toEqual(["beforeunload"]);
  expect(await marker()).toBe("kept");
  await expect(slotDuration(page)).toHaveValue("45");

  // Closing the tab, refused at the prompt: the tab stays open.
  await page.close({ runBeforeUnload: true });
  await expect.poll(() => dialogs).toEqual(["beforeunload", "beforeunload"]);
  expect(page.isClosed()).toBe(false);
  expect(await marker()).toBe("kept");
  await expect(slotDuration(page)).toHaveValue("45");

  // A reload, accepted: the edit is gone, as nothing was saved.
  answer = "accept";
  await page.reload();
  await waitForBoot(page);
  expect(dialogs).toEqual(["beforeunload", "beforeunload", "beforeunload"]);
  expect(await marker()).toBeUndefined();
  await expect(selectValue(page)).toHaveText(FIRST);
  await expect(slotDuration(page)).toHaveValue("30");
});

test("Discard releases the guard first: a second Back click during a slow push asks nothing", async ({
  page,
  gotoApp,
}) => {
  const rsc = await holdCalendarsRsc(page);
  try {
    await openEditor(page, gotoApp);
    await editSlotDuration(page, "45");
    await backLink(page).click();
    const dialog = leaveDialog(page);
    await expect(dialog).toBeVisible();
    expect(rsc.navigations()).toBe(0);
    await dialog.getByRole("button", { name: "Discard changes" }).click();
    await expect(anyAlertDialog(page)).toHaveCount(0);
    // Discard's push is in flight and held: the page has not moved, so the
    // next click lands while it loads.
    await expect.poll(() => rsc.navigations()).toBe(1);
    await expect(page).toHaveURL(/\/calendars\/availability$/);

    const sawAlertDialog = await watchAlertDialogs(page);
    await backLink(page).click();
    // The second click went straight through: it started its own navigation.
    await expect.poll(() => rsc.navigations()).toBe(2);
    rsc.release();
    await expect(page).toHaveURL(/\/calendars$/, NAVIGATION);
    expect(await sawAlertDialog()).toBe(false);
  } finally {
    rsc.release();
  }
});

test("the browser's Back is not guarded and closes an open question", async ({
  page,
  gotoApp,
}) => {
  // Reached by a client navigation, so the browser's Back stays in this
  // document and no beforeunload runs.
  await gotoApp("/calendars");
  await page.getByRole("link", { name: "Availability", exact: true }).click();
  await expect(page).toHaveURL(/\/calendars\/availability$/, NAVIGATION);
  await expect(selectValue(page)).toHaveText(FIRST);
  await editSlotDuration(page, "45");

  await sidebarLink(page, "Dashboard").click();
  await expect(leaveDialog(page)).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/calendars$/, NAVIGATION);
  // The page with the edits is gone, and so is its question and its guard.
  await expect(anyAlertDialog(page)).toHaveCount(0);
  await expect.poll(() => beforeUnloadPrevented(page)).toBe(false);
});

/** The ways a form ends up clean. */
const CLEAN_STATES = [
  "just loaded",
  "after Discard changes",
  "after Save",
] as const;

/**
 * Brings the open calendar's form to `state`. Anything but "just loaded"
 * first changes Slot duration by 15 minutes, then discards or saves it.
 */
async function reach(
  page: Page,
  state: (typeof CLEAN_STATES)[number],
  calendar: string,
) {
  await expect(selectValue(page)).toHaveText(calendar);
  const field = slotDuration(page);
  await expect(field).not.toHaveValue("");
  if (state !== "just loaded") {
    const before = await field.inputValue();
    await editSlotDuration(page, String(Number(before) + 15));
    await expect(formDiscard(page)).toBeEnabled();
    if (state === "after Discard changes") {
      await formDiscard(page).click();
      await expect(field).toHaveValue(before);
    } else {
      await saveButton(page).click();
      // This calendar's toast: an earlier save's may still be on screen.
      await expect(
        page
          .locator("[data-sonner-toast]")
          .filter({ hasText: "Availability saved" })
          .filter({ hasText: calendar }),
      ).toBeVisible();
      await expect(field).toHaveValue(String(Number(before) + 15));
    }
  }
  await expect(formDiscard(page)).toBeDisabled();
}

for (const state of CLEAN_STATES) {
  test(`a clean editor (${state}) switches calendars, goes back and follows the sidebar without asking`, async ({
    page,
    gotoApp,
  }) => {
    await openEditor(page, gotoApp);
    await reach(page, state, FIRST);
    await expect.poll(() => beforeUnloadPrevented(page)).toBe(false);
    if (state === "after Save") {
      // A real reload too, after the clicks that let a page prompt: none
      // comes.
      const dialogs: string[] = [];
      page.on("dialog", async (dialog) => {
        dialogs.push(dialog.type());
        await dialog.accept();
      });
      await page.reload();
      await waitForBoot(page);
      expect(dialogs).toEqual([]);
    }

    // The calendar switch.
    await pickCalendar(page, OTHER);
    await expect(page).toHaveURL(/\?calendar=strategy$/);
    await expect(anyAlertDialog(page)).toHaveCount(0);
    await expect(selectValue(page)).toHaveText(OTHER);

    // Back to calendars.
    await reach(page, state, OTHER);
    await backLink(page).click();
    await expect(page).toHaveURL(/\/calendars$/, NAVIGATION);
    await expect(anyAlertDialog(page)).toHaveCount(0);

    // A sidebar link.
    await openEditor(page, gotoApp);
    await reach(page, state, FIRST);
    await sidebarLink(page, "Contacts").click();
    await expect(page).toHaveURL(/\/contacts$/, NAVIGATION);
    await expect(anyAlertDialog(page)).toHaveCount(0);
  });
}

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
