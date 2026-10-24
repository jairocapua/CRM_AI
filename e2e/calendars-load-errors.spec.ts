import type { Locator, Page } from "@playwright/test";

import {
  armContactFault,
  bookingDialog,
  chooseCalendar,
  chooseContact,
  expectPosition,
  expectViewLoaded,
  failContactRead,
  failReads,
  loadErrorAlert,
  openTimes,
  readContacts,
  readDeals,
  readFaultThrows,
  readSeededAppointments,
  readTagNames,
  restoreContactRead,
  restoreReads,
  timeGroup,
  timeRadio,
  uniquelyNamedContact,
  viewRegion,
} from "./calendar-helpers";
import { expect, NAVIGATION, test } from "./fixtures";

/**
 * A read that fails with nothing on screen shows an error with Retry, never a
 * skeleton that stays forever or an empty state that is not true: on the
 * calendars page (the first load, a step to a new range, and its calendar
 * list), on a contact's page and its Appointments tab, on the availability
 * page, in the booking dialog's calendar list and open times, and on the
 * contacts list (the first load, a failed page change, and a failed re-read
 * that keeps the rows on screen; here, like the contact page's tests, because
 * they share this spec's fault helpers and Retry watch) and its tag read (a
 * failed tag read with the rows on screen, which also empties the toolbar's
 * tag filter, a failed tag re-read that keeps the badges, and a page change,
 * whose skeleton the tags alert never sits above). The tag read fails the
 * same way on the other screens that draw tags: a contact's Tags card, the
 * opportunity board and a deal's details panel, and the toolbar's tag filter,
 * whose own Retry re-reads every tags reader on the page, and the pickers in
 * the contact and deal sheets and the bulk Tags popover, whose inline alert
 * gives Retry a keyboard path that hands focus back to the input (only after
 * that picker's own Retry, never after a read started elsewhere). A contact that
 * does not exist keeps its "Contact not found" state, not the load error. A
 * re-read that fails with a list already on screen keeps the list, with no
 * error in its place (the booking dialog's open-times test and the contacts
 * list's re-read tests). The dialog's calendar list has no such test: nothing
 * refetches it while the dialog is open, so that case holds by construction
 * (DECISIONS P7-T36).
 *
 * The mock never fails a read, so `failReads` makes one fail from the page,
 * and `armContactFault` makes one contact's read fail where `failReads`
 * cannot reach it (see calendar-helpers.ts). `failReads(page, "tags")` fails
 * only the tag read, not the contacts list; a contacts fault fails both,
 * since the tag counts read the contacts table. Both can be switched off, so
 * each test proves both halves: the error appears, and once the fault is off,
 * Retry brings the data back. The fault is a plain Error, which
 * `useResource` reports as "Something went wrong.".
 *
 * Pinned to Singapore and en-US, like the other calendar specs: the demo
 * clock's today is 2026-09-08, so the default month is September 2026. The
 * booking dialog test relies on one seed fact (LEARNINGS P7-T09): Discovery
 * Call offers sixteen times on Wednesday 9 September in Singapore, the first
 * at 12:00 AM.
 */
const ZONE = "Asia/Singapore";
test.use({ timezoneId: ZONE, locale: "en-US" });

const APPOINTMENTS_ERROR = "Could not load appointments";
const CALENDARS_ERROR = "Could not load calendars";
const SLOTS_ERROR = "Could not load the open times";
const CONTACT_ERROR = "Could not load the contact";
const CONTACTS_ERROR = "Could not load contacts";
const FAULT_MESSAGE = "Something went wrong.";
/** The calendar list's column, tagged by the calendar-list test. */
const CALENDAR_COLUMN = "[data-e2e-calendar-column]";

interface RetryWatch {
  /**
   * The Retry button of an alert inside the alert scope was seen with
   * aria-disabled="true".
   */
  sawBusy: boolean;
  /** A skeleton appeared inside the skeleton scope. */
  sawSkeleton: boolean;
  /** While busy, something in the button still carried an aria-label. */
  sawLabelledSpinner: boolean;
}

/**
 * Records, at every DOM change from now on, whether the Retry button of an
 * alert inside `alertScope` went busy and whether a skeleton appeared inside
 * `skeletonScope` (both CSS selectors; the skeleton scope defaults to the
 * alert scope). The watch reads the first alert in its alert scope, so that
 * scope must hold only the alert under test; the skeleton scope can be wider.
 * Returns a reader for the flags.
 */
async function watchRetry(
  page: Page,
  alertScope: string,
  skeletonScope: string = alertScope,
) {
  await page.evaluate(
    ({ alertScope, skeletonScope }) => {
      const flags: RetryWatch = {
        sawBusy: false,
        sawSkeleton: false,
        sawLabelledSpinner: false,
      };
      const check = () => {
        if (document.querySelector(`${skeletonScope} [data-slot="skeleton"]`)) {
          flags.sawSkeleton = true;
        }
        const button = document.querySelector(
          `${alertScope} [data-slot="alert"] [data-slot="button"]`,
        );
        if (button?.getAttribute("aria-disabled") === "true") {
          flags.sawBusy = true;
          if (button.querySelector('[aria-label]:not([aria-hidden="true"])')) {
            flags.sawLabelledSpinner = true;
          }
        }
      };
      new MutationObserver(check).observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
      });
      Object.assign(window, { __retryWatch: flags });
    },
    { alertScope, skeletonScope },
  );
  return () =>
    page.evaluate(
      () => (window as unknown as { __retryWatch: RetryWatch }).__retryWatch,
    );
}

test("calendars page: a failed first load shows the error and Retry loads the month", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/contacts");
  await failReads(page, "appointments");
  // Client-side navigation, so the fault survives.
  await page
    .locator('[data-slot="sidebar"]')
    .getByRole("link", { name: "Calendars", exact: true })
    .click();
  await expect(page).toHaveURL(/\/calendars$/, NAVIGATION);
  await expectPosition(page, "Month", "September 2026");

  const alert = loadErrorAlert(page, APPOINTMENTS_ERROR);
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(FAULT_MESSAGE);
  // The view area holds the error: no skeleton, and no view drawn empty.
  await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0);
  await expect(viewRegion(page, "Month")).toHaveCount(0);

  // A Retry that fails again: the button goes busy, and no skeleton appears.
  const readWatch = await watchRetry(page, "main");

  const retry = alert.getByRole("button", { name: "Retry", exact: true });
  await retry.click();
  await expect.poll(async () => (await readWatch()).sawBusy).toBe(true);
  await expect(retry).toBeEnabled();
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(FAULT_MESSAGE);
  expect(await readWatch()).toEqual({
    sawBusy: true,
    sawSkeleton: false,
    sawLabelledSpinner: false,
  });

  // The fault clears, and Retry loads the month.
  await restoreReads(page);
  await retry.click();
  await expectPosition(page, "Month", "September 2026");
  await expectViewLoaded(page, "Month");
  await expect(alert).toHaveCount(0);
});

test("calendars page: a step whose range fails shows the error, not the previous grid", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/calendars?view=month&date=2026-09-08");
  await expectViewLoaded(page, "Month");

  await failReads(page, "appointments");
  await page.getByRole("button", { name: "Next month" }).click();
  await expectPosition(page, "Month", "October 2026");

  const alert = loadErrorAlert(page, APPOINTMENTS_ERROR);
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(FAULT_MESSAGE);
  // September's grid is gone, not left under October's label.
  await expect(viewRegion(page, "Month")).toHaveCount(0);
  await expect(page.locator("[data-day]")).toHaveCount(0);

  await restoreReads(page);
  await alert.getByRole("button", { name: "Retry", exact: true }).click();
  await expectViewLoaded(page, "Month");
  await expect(alert).toHaveCount(0);
  // October's grid: Sunday 27 September to Saturday 31 October.
  const days = await viewRegion(page, "Month")
    .locator("[data-day]")
    .evaluateAll((cells) => cells.map((cell) => cell.getAttribute("data-day")));
  expect(days).toHaveLength(35);
  expect(days.at(0)).toBe("2026-09-27");
  expect(days.at(-1)).toBe("2026-10-31");
});

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The element's box on the page; throws when it is not laid out. */
async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  if (!box) throw new Error("The element is not laid out");
  return box;
}

/** Whether two boxes share any area (touching edges do not count). */
function intersects(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

test("calendars page: a failed calendar list shows the error in its column and Retry lists the calendars", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/contacts");
  await failReads(page, "calendars");
  // Client-side navigation, so the fault survives.
  await page
    .locator('[data-slot="sidebar"]')
    .getByRole("link", { name: "Calendars", exact: true })
    .click();
  await expect(page).toHaveURL(/\/calendars$/, NAVIGATION);
  await expectPosition(page, "Month", "September 2026");

  const alert = loadErrorAlert(page, CALENDARS_ERROR);
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(FAULT_MESSAGE);
  // The column holds the error: no list drawn empty, no toggles.
  const list = page.getByRole("group", { name: "Calendars", exact: true });
  await expect(list).toHaveCount(0);
  await expect(page.getByRole("checkbox")).toHaveCount(0);

  // The view does not wait on the list: the month draws its appointments (no
  // skeleton anywhere, which expectViewLoaded checks), and nothing is hidden.
  await expectViewLoaded(page, "Month");
  const month = viewRegion(page, "Month");
  const chips = month.getByRole("listitem");
  const chipCount = await chips.count();
  expect(chipCount).toBeGreaterThan(0);
  await expect(loadErrorAlert(page, APPOINTMENTS_ERROR)).toHaveCount(0);

  // The alert fits its 14rem column: Retry covers neither the title nor the
  // message, and the alert neither spills into the view nor scrolls sideways.
  const retry = alert.getByRole("button", { name: "Retry", exact: true });
  const [titleBox, messageBox, retryBox, alertBox, monthBox] =
    await Promise.all([
      boxOf(alert.locator('[data-slot="alert-title"]')),
      boxOf(alert.locator('[data-slot="alert-description"]')),
      boxOf(retry),
      boxOf(alert),
      boxOf(month),
    ]);
  expect(intersects(retryBox, titleBox), "Retry covers the title").toBe(false);
  expect(intersects(retryBox, messageBox), "Retry covers the message").toBe(
    false,
  );
  expect(alertBox.x + alertBox.width).toBeLessThanOrEqual(monthBox.x);
  expect(await alert.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );

  // A Retry that fails again: the button goes busy, and no skeleton appears.
  // The watch reads the first alert in its alert scope, and the view beside
  // the column can hold an alert of its own, so it reads the alert inside the
  // calendar column only. Skeletons are watched across all of main, so
  // neither the column nor the view may blank during Retry. The column has no
  // hook of its own, so the test tags it: LoadError's root is the Alert,
  // whose parent is the column's `<div>` (calendars-workspace.tsx).
  await alert.evaluate((el) =>
    el.parentElement?.setAttribute("data-e2e-calendar-column", ""),
  );
  const column = page.locator(CALENDAR_COLUMN);
  await expect(column).toHaveCount(1);
  // One alert in the column (a second would fail strict mode): this one.
  await expect(column.getByRole("alert")).toContainText(CALENDARS_ERROR);
  await expect(
    column.getByRole("region", { name: "Month view", exact: true }),
  ).toHaveCount(0);
  const readWatch = await watchRetry(page, CALENDAR_COLUMN, "main");
  await retry.click();
  await expect.poll(async () => (await readWatch()).sawBusy).toBe(true);
  await expect(retry).toBeEnabled();
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(FAULT_MESSAGE);
  expect(await readWatch()).toEqual({
    sawBusy: true,
    sawSkeleton: false,
    sawLabelledSpinner: false,
  });

  // The fault clears, and Retry lists the four calendars, all shown: the
  // month keeps every chip it drew while the list was down.
  await restoreReads(page);
  await retry.click();
  const toggles = list.getByRole("checkbox");
  await expect(toggles).toHaveCount(4);
  for (const toggle of await toggles.all()) await expect(toggle).toBeChecked();
  await expect(alert).toHaveCount(0);
  await expect(month).toBeVisible();
  await expect(chips).toHaveCount(chipCount);
  // The tag sat on the column, and the list replaced the alert inside it.
  await expect(
    column.getByRole("group", { name: "Calendars", exact: true }),
  ).toHaveCount(1);
});

test("contact Appointments tab: a failed load shows the error, not an empty list", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/contacts");
  const [row] = await readSeededAppointments(page);
  if (!row) throw new Error("The seed has no appointments");

  await gotoApp(`/contacts/${row.contactId}`);
  const tab = page.getByRole("tab", { name: "Appointments", exact: true });
  await expect(tab).toBeVisible();

  // Base UI mounts a tab's panel only when it is active, so the read runs on
  // the click, after the fault is on.
  await failReads(page, "appointments");
  await tab.click();
  const panel = page.getByRole("tabpanel");
  const alert = panel
    .getByRole("alert")
    .filter({ hasText: APPOINTMENTS_ERROR });
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(FAULT_MESSAGE);
  await expect(panel.getByText("No appointments yet.")).toHaveCount(0);

  await restoreReads(page);
  await alert.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(
    panel.locator(`li[data-appointment-id="${row.id}"]`),
  ).toBeVisible();
  await expect(alert).toHaveCount(0);
});

test("contact page: a failed load shows the error and Retry loads the contact", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/contacts");
  const main = page.locator("main");
  const href = await main
    .locator('a[href^="/contacts/"]')
    .first()
    .getAttribute("href");
  const id = href?.split("/").at(-1);
  if (!id) throw new Error("The contacts list has no contact link");
  const contact = (await readContacts(page)).find((c) => c.id === id);
  if (!contact) throw new Error(`No persisted contact ${id}`);

  const heading = page.getByRole("heading", {
    level: 1,
    name: contact.name,
    exact: true,
  });
  const back = main.getByRole("link", { name: "Contacts", exact: true });
  const row = main.locator(`a[href="/contacts/${id}"]`).first();

  // The page works before the fault. The next read of the whole contacts
  // table (the page's tag counts, or the list opened again by its link) arms
  // the fault. Those reads never throw, and the list reads no contact by key,
  // so the fault can go on once the list's row shows.
  await armContactFault(page, id);
  await row.click();
  await expect(heading).toBeVisible(NAVIGATION);
  await back.click();
  await expect(page).toHaveURL(/\/contacts$/, NAVIGATION);
  await expect(row).toBeVisible();
  await failContactRead(page);
  await row.click();
  await expect(page).toHaveURL(new RegExp(`/contacts/${id}$`), NAVIGATION);

  // The error stands alone: the back link, and no skeleton, no not-found
  // state, no contact header and no tabs.
  const alert = loadErrorAlert(page, CONTACT_ERROR);
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(FAULT_MESSAGE);
  await expect(back).toBeVisible();
  await expect(main.locator('[data-slot="skeleton"]')).toHaveCount(0);
  await expect(page.getByText("Contact not found")).toHaveCount(0);
  await expect(heading).toHaveCount(0);
  await expect(page.getByRole("tab")).toHaveCount(0);

  // A Retry that fails again: the button goes busy, and no skeleton appears.
  // The load error is the only alert in main.
  const readWatch = await watchRetry(page, "main");
  const retry = alert.getByRole("button", { name: "Retry", exact: true });
  await retry.click();
  await expect.poll(async () => (await readWatch()).sawBusy).toBe(true);
  await expect(retry).toBeEnabled();
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(FAULT_MESSAGE);
  expect(await readWatch()).toEqual({
    sawBusy: true,
    sawSkeleton: false,
    sawLabelledSpinner: false,
  });

  // The fault clears, and Retry shows the contact.
  await restoreContactRead(page);
  await retry.click();
  await expect(heading).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Activity", exact: true }),
  ).toBeVisible();
  await expect(alert).toHaveCount(0);
});

test("contact page: a contact that does not exist shows Contact not found, not the load error", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/contacts/e2e-no-such-contact");
  const main = page.locator("main");
  await expect(
    page.getByText("Contact not found", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("It may have been deleted.", { exact: true }),
  ).toBeVisible();
  await expect(
    main.getByRole("link", { name: "Contacts", exact: true }),
  ).toBeVisible();
  await expect(loadErrorAlert(page, CONTACT_ERROR)).toHaveCount(0);
  await expect(main.locator('[data-slot="skeleton"]')).toHaveCount(0);
});

test("availability page: a failed calendars load offers Retry", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/calendars?view=month&date=2026-09-08");
  // Every read on this page has settled before the fault goes on.
  await expectViewLoaded(page, "Month");

  await failReads(page, "calendars");
  await page.getByRole("link", { name: "Availability", exact: true }).click();
  await expect(page).toHaveURL(/\/calendars\/availability$/, NAVIGATION);

  const alert = loadErrorAlert(page, CALENDARS_ERROR);
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(FAULT_MESSAGE);
  await expect(
    page.getByRole("link", { name: "Back to calendars", exact: true }),
  ).toBeVisible();
  // An error, not the empty state, and no editor.
  await expect(page.getByText("No calendars", { exact: true })).toHaveCount(0);
  const picker = page.getByRole("combobox", { name: "Calendar" });
  await expect(picker).toHaveCount(0);

  await restoreReads(page);
  await alert.getByRole("button", { name: "Retry", exact: true }).click();
  // The editor opens on the first calendar by name.
  await expect(picker.locator('[data-slot="select-value"]')).toHaveText(
    "Discovery Call",
  );
  await expect(
    page.getByRole("group", { name: "Tuesday", exact: true }),
  ).toBeVisible();
  await expect(alert).toHaveCount(0);
});

test("booking dialog: a failed open-times load shows the error and Retry lists the times", async ({
  page,
  gotoApp,
}) => {
  const DAY = "2026-09-09";
  await gotoApp(`/calendars?view=month&date=${DAY}`);
  await expectViewLoaded(page, "Month");

  await page.getByRole("button", { name: "Book", exact: true }).click();
  const dialog = bookingDialog(page);
  await expect(dialog.getByLabel("Day", { exact: true })).toHaveValue(DAY);
  // The page's own reads have settled; the next appointments read is the
  // dialog's, for the open times of the calendar chosen below.
  await failReads(page, "appointments");
  await chooseCalendar(page, dialog, "Discovery Call");

  const group = timeGroup(dialog);
  const alert = group.getByRole("alert").filter({ hasText: SLOTS_ERROR });
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(FAULT_MESSAGE);
  // The error stands alone: no times, no skeleton, no empty state.
  await expect(group.getByRole("radio")).toHaveCount(0);
  await expect(group.getByText("No open times on this day.")).toHaveCount(0);
  await expect(dialog.locator('[data-slot="skeleton"]')).toHaveCount(0);

  // A Retry that fails again: busy, never a skeleton, then enabled again.
  const readWatch = await watchRetry(page, '[data-slot="dialog-content"]');
  const retry = alert.getByRole("button", { name: "Retry", exact: true });
  await retry.click();
  await expect.poll(async () => (await readWatch()).sawBusy).toBe(true);
  await expect(retry).toBeEnabled();
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(FAULT_MESSAGE);
  expect(await readWatch()).toEqual({
    sawBusy: true,
    sawSkeleton: false,
    sawLabelledSpinner: false,
  });

  // The fault clears, and Retry lists the day's times.
  await restoreReads(page);
  await retry.click();
  const times = await openTimes(dialog, DAY, ZONE);
  expect(times).toHaveLength(16);
  expect(times[0]?.label).toBe("12:00 AM");
  await expect(alert).toHaveCount(0);
});

test("booking dialog: a failed calendar list shows the error and Retry lists the calendars", async ({
  page,
  gotoApp,
}) => {
  const DAY = "2026-09-09";
  await gotoApp(`/calendars?view=month&date=${DAY}`);
  // The page's own calendar read has settled; the next one is the dialog's,
  // which mounts its form when it opens.
  await expectViewLoaded(page, "Month");
  await failReads(page, "calendars");

  await page.getByRole("button", { name: "Book", exact: true }).click();
  const dialog = bookingDialog(page);
  await expect(dialog.getByLabel("Day", { exact: true })).toHaveValue(DAY);

  const alert = dialog.getByRole("alert").filter({ hasText: CALENDARS_ERROR });
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(FAULT_MESSAGE);
  // The field keeps its select, disabled and empty, and nothing else in the
  // dialog pretends to load.
  const select = dialog.getByRole("combobox", {
    name: "Calendar",
    exact: true,
  });
  await expect(select).toBeDisabled();
  await expect(select.locator('[data-slot="select-value"]')).toHaveText(
    "Pick a calendar",
  );
  await expect(
    timeGroup(dialog).getByText("Pick a calendar to see open times.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(dialog.locator('[data-slot="skeleton"]')).toHaveCount(0);

  // The alert fits the dialog: Retry covers neither the title nor the
  // message, and the alert does not scroll sideways.
  const retry = alert.getByRole("button", { name: "Retry", exact: true });
  const [titleBox, messageBox, retryBox] = await Promise.all([
    boxOf(alert.locator('[data-slot="alert-title"]')),
    boxOf(alert.locator('[data-slot="alert-description"]')),
    boxOf(retry),
  ]);
  expect(intersects(retryBox, titleBox), "Retry covers the title").toBe(false);
  expect(intersects(retryBox, messageBox), "Retry covers the message").toBe(
    false,
  );
  expect(await alert.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );

  // A Retry that fails again: busy, never a skeleton, then enabled again.
  // The skeleton watch covers only the dialog: it is modal, and the page
  // behind it does not refetch while it is open.
  const readWatch = await watchRetry(page, '[data-slot="dialog-content"]');
  await retry.click();
  await expect.poll(async () => (await readWatch()).sawBusy).toBe(true);
  await expect(retry).toBeEnabled();
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(FAULT_MESSAGE);
  expect(await readWatch()).toEqual({
    sawBusy: true,
    sawSkeleton: false,
    sawLabelledSpinner: false,
  });

  // The fault clears, and Retry lists the calendars: one can be chosen, and
  // its open times load.
  await restoreReads(page);
  await retry.click();
  await expect(alert).toHaveCount(0);
  await expect(select).toBeEnabled();
  await chooseCalendar(page, dialog, "Discovery Call");
  const times = await openTimes(dialog, DAY, ZONE);
  expect(times).toHaveLength(16);
  expect(times[0]?.label).toBe("12:00 AM");
});

test("booking dialog: a failed re-read of the open times keeps the list on screen", async ({
  page,
  gotoApp,
}) => {
  const DAY = "2026-09-09";
  await gotoApp(`/calendars?view=month&date=${DAY}`);
  await expectViewLoaded(page, "Month");
  const contact = uniquelyNamedContact(await readContacts(page));

  await page.getByRole("button", { name: "Book", exact: true }).click();
  const dialog = bookingDialog(page);
  await expect(dialog.getByLabel("Day", { exact: true })).toHaveValue(DAY);
  await chooseCalendar(page, dialog, "Discovery Call");
  const times = await openTimes(dialog, DAY, ZONE);
  expect(times).toHaveLength(16);
  // Any contact will do: the booking fails either way.
  await chooseContact(page, dialog, contact);
  const [first] = times;
  if (!first) throw new Error("No open time");
  await timeRadio(dialog, first.label).click();
  await expect(timeRadio(dialog, first.label)).toHaveAttribute(
    "aria-checked",
    "true",
  );

  // Notes a busy spell of the Time group ending, so the test knows the times
  // were read again, rather than passing because nothing happened. It reads
  // the mutation records, not the live attribute, so a spell that starts and
  // ends between two callbacks still counts: its last record's old value is
  // "true". The group must not be busy when the observer goes in, or the end
  // of a spell already running would count. openTimes waited for that, but
  // chooseContact and the radio click ran since, so the check below enforces
  // it.
  const group = timeGroup(dialog);
  await expect(group).not.toHaveAttribute("aria-busy", "true");
  await group.evaluate((fieldset) => {
    const w = window as unknown as { __timesBusySpellEnded?: boolean };
    w.__timesBusySpellEnded = false;
    new MutationObserver((records) => {
      if (records.some((record) => record.oldValue === "true")) {
        w.__timesBusySpellEnded = true;
      }
    }).observe(fieldset, {
      attributes: true,
      attributeFilter: ["aria-busy"],
      attributeOldValue: true,
    });
  });

  // book() reads the appointments to check the slot is still open, so it
  // fails, and so does the re-read of the times that its failure starts.
  await failReads(page, "appointments");
  await dialog.getByRole("button", { name: "Book appointment" }).click();
  await expect(
    dialog
      .getByRole("alert")
      .filter({ hasText: "Could not book the appointment." }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __timesBusySpellEnded?: boolean })
            .__timesBusySpellEnded,
      ),
    )
    .toBe(true);
  await expect(group).not.toHaveAttribute("aria-busy", "true");

  // The re-read failed with the times on screen: they stay, with no error in
  // their place.
  await expect(group.getByRole("radio")).toHaveCount(16);
  await expect(
    group.getByRole("alert").filter({ hasText: SLOTS_ERROR }),
  ).toHaveCount(0);
  await expect(dialog).toBeVisible();

  await restoreReads(page);
});

const PAGE_SIZE = 25;
const TAGS_ERROR = "Could not load tags";
/** What a `TagPicker` lists in place of its tags after a failed read. */
const TAG_PICKER_ERROR = "Could not load tags.";

/** The contacts table's row checkboxes, one per row on screen. */
const contactRows = (page: Page) =>
  page.locator("main").getByRole("checkbox", { name: "Select row" });

/** The contacts footer's pager text, "Page 2 of 10". */
const pagerText = (page: Page) =>
  page.locator("main").getByText(/^Page \d+ of \d+$/);

/**
 * The tag badges in the contacts table. Column 4 is Tags (select, contact,
 * status, tags in columns.tsx); the column number keeps the status badges
 * out. A column reorder makes this match nothing, and the tests that wait for
 * a badge fail loudly rather than pass.
 */
const tagBadges = (page: Page) =>
  page
    .locator("main")
    .getByRole("table")
    .locator('tbody td:nth-child(4) [data-slot="badge"]');

/** The toolbar's tag filter, a `TagPicker`. */
const tagFilter = (page: Page) =>
  page
    .locator("main")
    .getByRole("combobox", { name: "Filter by tags", exact: true });

/**
 * Opens the toolbar's tag filter, checks it lists tags (or, with `failed`,
 * that it says its read failed and lists nothing), then closes it.
 */
async function expectTagFilter(page: Page, { failed = false } = {}) {
  await tagFilter(page).click();
  const error = page.getByText(TAG_PICKER_ERROR, { exact: true });
  if (failed) {
    await expect(error).toBeVisible();
    await expect(page.getByRole("option")).toHaveCount(0);
  } else {
    await expect(page.getByRole("option").first()).toBeVisible();
    await expect(error).toHaveCount(0);
  }
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
}

test("contacts list: a failed first load shows the error and Retry lists the contacts", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/calendars");
  await expectViewLoaded(page, "Month");
  const total = (await readContacts(page)).length;
  await failReads(page, "contacts");
  // Client-side navigation, so the fault survives.
  await page
    .locator('[data-slot="sidebar"]')
    .getByRole("link", { name: "Contacts", exact: true })
    .click();
  await expect(page).toHaveURL(/\/contacts$/, NAVIGATION);

  const main = page.locator("main");
  const alert = loadErrorAlert(page, CONTACTS_ERROR);
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(FAULT_MESSAGE);
  // The error stands in for the table and its footer: no table, no empty
  // state, no skeleton, and no count or pager that would not be true.
  await expect(main.getByRole("table")).toHaveCount(0);
  await expect(main.getByText("No contacts found")).toHaveCount(0);
  await expect(main.locator('[data-slot="skeleton"]')).toHaveCount(0);
  await expect(main.getByText("0 contacts", { exact: true })).toHaveCount(0);
  await expect(pagerText(page)).toHaveCount(0);
  // The toolbar stays.
  await expect(main.getByPlaceholder("Search contacts…")).toBeVisible();
  await expect(
    main.getByRole("button", { name: "Add contact", exact: true }),
  ).toBeVisible();

  // tags.list counts tags through the contacts table, so the fault failed
  // the tag read too. One fault, one alert: the tags error is not shown
  // beside the contacts error.
  await expect(loadErrorAlert(page, TAGS_ERROR)).toHaveCount(0);

  // A Retry that fails again: the button goes busy, and no skeleton appears.
  // The load error is the only alert in main.
  const readWatch = await watchRetry(page, "main");
  const retry = alert.getByRole("button", { name: "Retry", exact: true });
  await retry.click();
  await expect.poll(async () => (await readWatch()).sawBusy).toBe(true);
  await expect(retry).toBeEnabled();
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(FAULT_MESSAGE);
  expect(await readWatch()).toEqual({
    sawBusy: true,
    sawSkeleton: false,
    sawLabelledSpinner: false,
  });
  await expect(loadErrorAlert(page, TAGS_ERROR)).toHaveCount(0);

  // The fault clears, and Retry lists the first page. The same Retry re-reads
  // the tags: the table's badges and the toolbar filter's tags come back.
  await restoreReads(page);
  await retry.click();
  await expect(contactRows(page)).toHaveCount(PAGE_SIZE);
  await expect(
    main.getByText(`${total} contacts`, { exact: true }),
  ).toBeVisible();
  await expect(pagerText(page)).toHaveText(
    `Page 1 of ${Math.ceil(total / PAGE_SIZE)}`,
  );
  await expect(alert).toHaveCount(0);
  await expect(tagBadges(page).first()).toBeVisible();
  await expect(loadErrorAlert(page, TAGS_ERROR)).toHaveCount(0);
  await expectTagFilter(page);
});

test("contacts list: a failed tag read shows its error and Retry brings back the badges and the tag filter", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/calendars");
  await expectViewLoaded(page, "Month");
  const total = (await readContacts(page)).length;
  await failReads(page, "tags");
  // Client-side navigation, so the fault survives.
  await page
    .locator('[data-slot="sidebar"]')
    .getByRole("link", { name: "Contacts", exact: true })
    .click();
  await expect(page).toHaveURL(/\/contacts$/, NAVIGATION);

  // The contacts list does not read the tags table: its rows and footer
  // stay, with the tags error above them and no badge in the Tags column.
  const main = page.locator("main");
  await expect(contactRows(page)).toHaveCount(PAGE_SIZE);
  await expect(
    main.getByText(`${total} contacts`, { exact: true }),
  ).toBeVisible();
  const alert = loadErrorAlert(page, TAGS_ERROR);
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(FAULT_MESSAGE);
  await expect(loadErrorAlert(page, CONTACTS_ERROR)).toHaveCount(0);
  await expect(tagBadges(page)).toHaveCount(0);

  // The tag filter says its read failed, not "No tags found.", and offers
  // nothing to pick or create.
  await expectTagFilter(page, { failed: true });

  // A Retry that fails again: the button goes busy, and no skeleton appears.
  // The tags error is the only alert in main.
  const readWatch = await watchRetry(page, "main");
  const retry = alert.getByRole("button", { name: "Retry", exact: true });
  await retry.click();
  await expect.poll(async () => (await readWatch()).sawBusy).toBe(true);
  await expect(retry).toBeEnabled();
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(FAULT_MESSAGE);
  expect(await readWatch()).toEqual({
    sawBusy: true,
    sawSkeleton: false,
    sawLabelledSpinner: false,
  });

  // The fault clears, and Retry brings back the badges and the filter's tags:
  // the toolbar's TagPicker holds its own read, and Retry re-reads it too.
  await restoreReads(page);
  await retry.click();
  await expect(alert).toHaveCount(0);
  await expect(tagBadges(page).first()).toBeVisible();
  await expectTagFilter(page);
});

// A regression guard: it passes without P7-T47's fix too, because
// `loadErrorOf` already hides an error while data is on screen. It pins that
// behaviour, so a future change to the tags alert's gate cannot drop the
// badges or put an alert over them.
test("contacts list: a failed tag re-read with badges on screen keeps them", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/contacts");
  const main = page.locator("main");
  await expect(contactRows(page)).toHaveCount(PAGE_SIZE);
  await expect(tagBadges(page).first()).toBeVisible();

  // The bulk Tags popover's picker loads its tags before the fault goes on.
  await contactRows(page).first().check();
  await main.getByRole("button", { name: "Tags", exact: true }).click();
  const popover = page.locator('[data-slot="popover-content"]');
  await popover.getByRole("combobox", { name: "Tags", exact: true }).click();
  await page.getByRole("option").first().click();
  // While its list is open, the combobox hides the rest of the popover from
  // the accessibility tree, Add included: close the list first.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  const add = popover.getByRole("button", { name: "Add", exact: true });
  await expect(add).toBeEnabled();

  // Notes any alert appearing in main from now on, however briefly, so a
  // check made after the failed re-read has rendered cannot miss one.
  await page.evaluate(() => {
    const w = window as unknown as { __sawTagsAlert?: boolean };
    w.__sawTagsAlert = false;
    new MutationObserver(() => {
      if (document.querySelector('main [data-slot="alert"]')) {
        w.__sawTagsAlert = true;
      }
    }).observe(document.body, { subtree: true, childList: true });
  });

  // addTags writes the contacts by spread, so it succeeds, then invalidates
  // "contacts" and "tags": the tag re-reads go through Object.values and fail.
  await failReads(page, "tags");
  const throwsBefore = await readFaultThrows(page);
  await add.click();
  await expect(page.getByText("Tags added", { exact: true })).toBeVisible();
  await expect
    .poll(() => readFaultThrows(page), {
      message: "the tags were never read again under the fault",
    })
    .toBeGreaterThan(throwsBefore);
  // Let React commit the rejected re-read before checking nothing changed.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => setTimeout(resolve, 50)),
        ),
      ),
  );

  expect(
    await page.evaluate(
      () => (window as unknown as { __sawTagsAlert?: boolean }).__sawTagsAlert,
    ),
  ).toBe(false);
  await expect(loadErrorAlert(page, TAGS_ERROR)).toHaveCount(0);
  await expect(tagBadges(page).first()).toBeVisible();
  await expect(contactRows(page)).toHaveCount(PAGE_SIZE);

  await restoreReads(page);
});

test("contacts list: a failed page change shows the error, not the previous page", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/contacts");
  const total = (await readContacts(page)).length;
  expect(total, "the seed has more than one page").toBeGreaterThan(PAGE_SIZE);
  await expect(contactRows(page)).toHaveCount(PAGE_SIZE);
  await expect(pagerText(page)).toHaveText(/^Page 1 of /);

  await failReads(page, "contacts");
  await page
    .locator("main")
    .getByRole("button", { name: "Next", exact: true })
    .click();

  const alert = loadErrorAlert(page, CONTACTS_ERROR);
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(FAULT_MESSAGE);
  // Page 1's rows are gone, not left under page 2, and so is the pager.
  await expect(contactRows(page)).toHaveCount(0);
  await expect(pagerText(page)).toHaveCount(0);

  await restoreReads(page);
  await alert.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(pagerText(page)).toHaveText(
    `Page 2 of ${Math.ceil(total / PAGE_SIZE)}`,
  );
  await expect(contactRows(page)).toHaveCount(PAGE_SIZE);
  await expect(alert).toHaveCount(0);
});

test("contacts list: a failed re-read with rows on screen keeps them", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/contacts");
  const total = (await readContacts(page)).length;
  const main = page.locator("main");
  const count = main.getByText(`${total} contacts`, { exact: true });
  await expect(contactRows(page)).toHaveCount(PAGE_SIZE);
  await expect(count).toBeVisible();
  await contactRows(page).first().check();

  // Notes any alert appearing in main from now on, however briefly, so a
  // check made after the failed re-read has rendered cannot miss one.
  await page.evaluate(() => {
    const w = window as unknown as { __sawContactsAlert?: boolean };
    w.__sawContactsAlert = false;
    new MutationObserver(() => {
      if (document.querySelector('main [data-slot="alert"]')) {
        w.__sawContactsAlert = true;
      }
    }).observe(document.body, { subtree: true, childList: true });
  });

  // The owner change writes contacts by key, so it succeeds, then invalidates
  // "contacts": the list's re-read goes through Object.values and fails.
  await failReads(page, "contacts");
  const throwsBefore = await readFaultThrows(page);
  await main.getByRole("button", { name: "Owner", exact: true }).click();
  await page.getByRole("combobox", { name: "Assign owner" }).click();
  await page.getByRole("option", { name: "Unassigned", exact: true }).click();
  await expect(page.getByText("Owner cleared", { exact: true })).toBeVisible();
  await expect
    .poll(() => readFaultThrows(page), {
      message: "the contacts list was never read again under the fault",
    })
    .toBeGreaterThan(throwsBefore);
  // Let React commit the rejected re-read before checking nothing changed.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => setTimeout(resolve, 50)),
        ),
      ),
  );

  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __sawContactsAlert?: boolean })
          .__sawContactsAlert,
    ),
  ).toBe(false);
  await expect(loadErrorAlert(page, CONTACTS_ERROR)).toHaveCount(0);
  await expect(contactRows(page)).toHaveCount(PAGE_SIZE);
  await expect(count).toBeVisible();

  await restoreReads(page);
});

/**
 * Clicks the alert's Retry while the fault is still on, and checks the
 * LoadError contract: the button goes busy and comes back, the alert stays
 * with its message, no skeleton appears in main and the busy button carries
 * no labelled spinner. The alert must be the only one in main.
 */
async function retryFailsAgain(page: Page, alert: Locator) {
  const readWatch = await watchRetry(page, "main");
  const retry = alert.getByRole("button", { name: "Retry", exact: true });
  await retry.click();
  await expect.poll(async () => (await readWatch()).sawBusy).toBe(true);
  await expect(retry).toBeEnabled();
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(FAULT_MESSAGE);
  expect(await readWatch()).toEqual({
    sawBusy: true,
    sawSkeleton: false,
    sawLabelledSpinner: false,
  });
  return retry;
}

/** How many badges in main are tag badges, told apart by the tags' names. */
async function countTagBadges(page: Page, tagNames: readonly string[]) {
  return page
    .locator('main [data-slot="badge"]')
    .evaluateAll(
      (badges, names) =>
        badges.filter((badge) => names.includes(badge.textContent.trim()))
          .length,
      tagNames,
    );
}

test("contacts list: the tags error waits for the rows, on the first load and a page change", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/calendars");
  await expectViewLoaded(page, "Month");
  const total = (await readContacts(page)).length;
  expect(total, "the seed has more than one page").toBeGreaterThan(PAGE_SIZE);

  // Notes, at every DOM change from now on, a tags alert in main while a
  // skeleton is there too. Installed before the contacts page mounts, so its
  // first load counts as well as the page change below.
  await page.evaluate(() => {
    const w = window as unknown as { __sawTagsAlertOverSkeleton?: boolean };
    w.__sawTagsAlertOverSkeleton = false;
    new MutationObserver(() => {
      const skeleton = document.querySelector('main [data-slot="skeleton"]');
      const tagsAlert = [
        ...document.querySelectorAll('main [data-slot="alert"]'),
      ].some((alert) => alert.textContent.includes("Could not load tags"));
      if (skeleton && tagsAlert) w.__sawTagsAlertOverSkeleton = true;
    }).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
    });
  });
  const sawAlertOverSkeleton = () =>
    page.evaluate(
      () =>
        (window as unknown as { __sawTagsAlertOverSkeleton?: boolean })
          .__sawTagsAlertOverSkeleton,
    );

  await failReads(page, "tags");
  // Client-side navigation, so the fault survives.
  await page
    .locator('[data-slot="sidebar"]')
    .getByRole("link", { name: "Contacts", exact: true })
    .click();
  await expect(page).toHaveURL(/\/contacts$/, NAVIGATION);
  const alert = loadErrorAlert(page, TAGS_ERROR);
  await expect(contactRows(page)).toHaveCount(PAGE_SIZE);
  await expect(alert).toBeVisible();

  // A page change: the table shows its skeleton, and the tags alert waits
  // for page 2's rows.
  await page
    .locator("main")
    .getByRole("button", { name: "Next", exact: true })
    .click();
  await expect(pagerText(page)).toHaveText(
    `Page 2 of ${Math.ceil(total / PAGE_SIZE)}`,
  );
  await expect(contactRows(page)).toHaveCount(PAGE_SIZE);
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(FAULT_MESSAGE);
  expect(await sawAlertOverSkeleton()).toBe(false);

  await restoreReads(page);
});

test("contact page: a failed tag read shows its error in the Tags card and Retry brings back the badges", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/contacts");
  const main = page.locator("main");
  await expect(contactRows(page)).toHaveCount(PAGE_SIZE);
  await expect(tagBadges(page).first()).toBeVisible();
  // A contact that has tags: the first row showing a badge.
  const href = await main
    .getByRole("table")
    .locator("tbody tr")
    .filter({ has: page.locator('td:nth-child(4) [data-slot="badge"]') })
    .first()
    .locator('a[href^="/contacts/"]')
    .first()
    .getAttribute("href");
  const id = href?.split("/").at(-1);
  if (!id) throw new Error("No contact row with tags");
  const contact = (await readContacts(page)).find((c) => c.id === id);
  if (!contact) throw new Error(`No persisted contact ${id}`);
  expect(contact.tagIds.length, "the contact has tags").toBeGreaterThan(0);

  await failReads(page, "tags");
  // A client-side link, so the fault survives.
  await main.locator(`a[href="/contacts/${id}"]`).first().click();
  await expect(
    page.getByRole("heading", { level: 1, name: contact.name, exact: true }),
  ).toBeVisible(NAVIGATION);

  const card = main.locator('[data-slot="card"]').filter({
    has: page.locator('[data-slot="card-title"]', { hasText: /^Tags$/ }),
  });
  await expect(card).toHaveCount(1);
  const alert = card.getByRole("alert").filter({ hasText: TAGS_ERROR });
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(FAULT_MESSAGE);
  // The error, not "No tags", which would not be true.
  await expect(card.getByText("No tags", { exact: true })).toHaveCount(0);
  await expect(card.locator('[data-slot="badge"]')).toHaveCount(0);
  // The page has settled, so a skeleton during Retry would be Retry's.
  await expect(main.locator('[data-slot="skeleton"]')).toHaveCount(0);

  const retry = await retryFailsAgain(page, alert);

  // The fault clears, and Retry brings back the contact's badges.
  await restoreReads(page);
  await retry.click();
  await expect(alert).toHaveCount(0);
  await expect(card.locator('[data-slot="badge"]').first()).toBeVisible();
});

test("contact page: a contact with no tags still reads No tags while the tag read fails", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/contacts");
  const main = page.locator("main");
  await expect(contactRows(page)).toHaveCount(PAGE_SIZE);
  await expect(tagBadges(page).first()).toBeVisible();
  // A contact with no tags: a row on screen whose persisted tagIds is empty.
  const tagless = new Set(
    (await readContacts(page))
      .filter((c) => c.tagIds.length === 0)
      .map((c) => c.id),
  );
  const hrefs = await main
    .getByRole("table")
    .locator('tbody tr a[href^="/contacts/"]')
    .evaluateAll((links) => links.map((a) => a.getAttribute("href") ?? ""));
  const id = hrefs
    .map((href) => href.split("/").at(-1) ?? "")
    .find((candidate) => tagless.has(candidate));
  if (!id) throw new Error("No contact without tags on the first page");
  const contact = (await readContacts(page)).find((c) => c.id === id);
  if (!contact) throw new Error(`No persisted contact ${id}`);

  const throwsBefore = await readFaultThrows(page);
  await failReads(page, "tags");
  // A client-side link, so the fault survives.
  await main.locator(`a[href="/contacts/${id}"]`).first().click();
  await expect(
    page.getByRole("heading", { level: 1, name: contact.name, exact: true }),
  ).toBeVisible(NAVIGATION);
  // The tag read has run and failed, and React has rendered its result, so
  // the absence of the alert below means something.
  await expect.poll(() => readFaultThrows(page)).toBeGreaterThan(throwsBefore);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(main.locator('[data-slot="skeleton"]')).toHaveCount(0);

  const card = main.locator('[data-slot="card"]').filter({
    has: page.locator('[data-slot="card-title"]', { hasText: /^Tags$/ }),
  });
  await expect(card).toHaveCount(1);
  // "No tags" is true whatever the tag read did, so it stays.
  await expect(card.getByText("No tags", { exact: true })).toBeVisible();
  await expect(card.getByRole("alert")).toHaveCount(0);

  await restoreReads(page);
});

test("opportunities board: a failed tag read shows its error above the columns and Retry brings back the card tags", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/calendars");
  await expectViewLoaded(page, "Month");
  const tagNames = await readTagNames(page);

  await failReads(page, "tags");
  // Client-side navigation, so the fault survives.
  await page
    .locator('[data-slot="sidebar"]')
    .getByRole("link", { name: "Opportunities", exact: true })
    .click();
  await expect(page).toHaveURL(/\/opportunities$/, NAVIGATION);

  // The board stays, its cards without tags, with the tags error above it.
  const main = page.locator("main");
  const alert = loadErrorAlert(page, TAGS_ERROR);
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(FAULT_MESSAGE);
  await expect(
    main.locator('a[href^="/opportunities/"]').first(),
  ).toBeVisible();
  await expect(main.getByText(/live deals/)).toBeVisible();
  await expect(main.locator('[data-slot="skeleton"]')).toHaveCount(0);
  expect(await countTagBadges(page, tagNames)).toBe(0);

  const retry = await retryFailsAgain(page, alert);

  // The fault clears, and Retry brings back the cards' tags.
  await restoreReads(page);
  await retry.click();
  await expect(alert).toHaveCount(0);
  await expect.poll(() => countTagBadges(page, tagNames)).toBeGreaterThan(0);
});

test("opportunities board: the tags error waits for the board, on the first load and a pipeline change", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/calendars");
  await expectViewLoaded(page, "Month");

  // Notes, at every DOM change from now on, a tags alert in main while a
  // skeleton is there too. Installed before the board mounts, so its first
  // load counts as well as the pipeline change below.
  await page.evaluate(() => {
    const w = window as unknown as { __sawTagsAlertOverSkeleton?: boolean };
    w.__sawTagsAlertOverSkeleton = false;
    new MutationObserver(() => {
      const skeleton = document.querySelector('main [data-slot="skeleton"]');
      const tagsAlert = [
        ...document.querySelectorAll('main [data-slot="alert"]'),
      ].some((alert) => alert.textContent.includes("Could not load tags"));
      if (skeleton && tagsAlert) w.__sawTagsAlertOverSkeleton = true;
    }).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
    });
  });
  const sawAlertOverSkeleton = () =>
    page.evaluate(
      () =>
        (window as unknown as { __sawTagsAlertOverSkeleton?: boolean })
          .__sawTagsAlertOverSkeleton,
    );

  await failReads(page, "tags");
  // Client-side navigation, so the fault survives.
  await page
    .locator('[data-slot="sidebar"]')
    .getByRole("link", { name: "Opportunities", exact: true })
    .click();
  await expect(page).toHaveURL(/\/opportunities$/, NAVIGATION);
  const main = page.locator("main");
  const alert = loadErrorAlert(page, TAGS_ERROR);
  await expect(alert).toBeVisible();
  await expect(
    main.locator('a[href^="/opportunities/"]').first(),
  ).toBeVisible();

  // A pipeline change: the board shows its skeleton while the new pipeline's
  // deals load, and the tags error (still failed) waits for them. Without
  // the gate the alert would sit over that skeleton every time.
  const pipeline = main.getByRole("combobox", { name: "Pipeline" });
  const before = (await pipeline.textContent()) ?? "";
  await pipeline.click();
  const options = page.getByRole("option");
  await expect(options.first()).toBeVisible();
  const names = (await options.allTextContents()).map((name) => name.trim());
  const other = names.find((name) => !before.includes(name));
  if (!other) throw new Error("The seed has only one pipeline");
  await options.filter({ hasText: other }).first().click();
  await expect(pipeline).toContainText(other);
  await expect(main.locator('[data-slot="skeleton"]')).toHaveCount(0);
  await expect(main.getByText(/live deals/)).toBeVisible();
  await expect(alert).toBeVisible();
  expect(await sawAlertOverSkeleton()).toBe(false);

  await restoreReads(page);
});

test("opportunity page: a failed tag read shows its error in the details panel and Retry brings back the Tags row", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/opportunities");
  const main = page.locator("main");
  await expect(
    main.locator('a[href^="/opportunities/"]').first(),
  ).toBeVisible();
  await expect(main.locator('[data-slot="skeleton"]')).toHaveCount(0);

  // A deal with tags whose card is on the board.
  let deal: Awaited<ReturnType<typeof readDeals>>[number] | undefined;
  for (const candidate of await readDeals(page)) {
    if (candidate.tagIds.length === 0) continue;
    if (
      (await main.locator(`a[href="/opportunities/${candidate.id}"]`).count()) >
      0
    ) {
      deal = candidate;
      break;
    }
  }
  if (!deal) throw new Error("No deal with tags on the board");

  await failReads(page, "tags");
  // The card's title is a client-side link, so the fault survives.
  await main.locator(`a[href="/opportunities/${deal.id}"]`).first().click();
  await expect(
    page.getByRole("heading", { level: 1, name: deal.name, exact: true }),
  ).toBeVisible(NAVIGATION);

  const tagsRow = main.locator("dt").filter({ hasText: /^Tags$/ });
  const alert = loadErrorAlert(page, TAGS_ERROR);
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(FAULT_MESSAGE);
  await expect(tagsRow).toHaveCount(0);
  await expect(main.locator('[data-slot="skeleton"]')).toHaveCount(0);

  const retry = await retryFailsAgain(page, alert);

  // The fault clears, and Retry brings back the Tags row and its badges.
  await restoreReads(page);
  await retry.click();
  await expect(alert).toHaveCount(0);
  await expect(tagsRow).toBeVisible();
  await expect(
    tagsRow.locator("xpath=..").locator('dd [data-slot="badge"]'),
  ).toHaveCount(deal.tagIds.length);
});

test("tag picker: Retry in a failed tag list re-reads the tags", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/calendars");
  await expectViewLoaded(page, "Month");
  await failReads(page, "tags");
  // Client-side navigation, so the fault survives.
  await page
    .locator('[data-slot="sidebar"]')
    .getByRole("link", { name: "Contacts", exact: true })
    .click();
  await expect(page).toHaveURL(/\/contacts$/, NAVIGATION);
  const pageAlert = loadErrorAlert(page, TAGS_ERROR);
  // Only the table's tags alert: the toolbar filter adds no inline one. The
  // table's alert renders with the rows, so the count is read once both are
  // on screen; a retrying toHaveCount(1) could pass on a toolbar alert alone.
  await expect(contactRows(page)).toHaveCount(PAGE_SIZE);
  await expect(pageAlert.first()).toBeVisible();
  expect(
    await page
      .locator("main")
      .getByRole("alert")
      .filter({ hasText: TAGS_ERROR })
      .count(),
  ).toBe(1);
  await expect(pageAlert).toBeVisible();

  await tagFilter(page).click();
  const list = page.locator('[data-slot="combobox-content"]');
  const error = list.getByText(TAG_PICKER_ERROR, { exact: true });
  await expect(error).toBeVisible();
  await expect(page.getByRole("option")).toHaveCount(0);
  const retry = list.getByRole("button", { name: "Retry", exact: true });
  await expect(retry).toBeVisible();

  // A Retry that fails again: the button goes busy, then comes back, and the
  // list still says its read failed.
  await list.evaluate((content) => {
    const w = window as unknown as { __pickerRetryBusy?: boolean };
    w.__pickerRetryBusy = false;
    new MutationObserver(() => {
      const button = content.querySelector('[data-slot="button"]');
      if (button?.getAttribute("aria-disabled") === "true") {
        w.__pickerRetryBusy = true;
      }
    }).observe(content, { subtree: true, childList: true, attributes: true });
  });
  await retry.click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __pickerRetryBusy?: boolean })
            .__pickerRetryBusy,
      ),
    )
    .toBe(true);
  await expect(retry).toBeEnabled();
  await expect(error).toBeVisible();

  // The fault clears, and Retry fills the list, which stayed open. Retry is
  // `invalidate("tags")`, so the page's tags alert goes too.
  await restoreReads(page);
  await retry.click();
  await expect(page.getByRole("option").first()).toBeVisible();
  await expect(error).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(pageAlert).toHaveCount(0);
  await expect(tagBadges(page).first()).toBeVisible();
});

/**
 * Fails the tag read on the calendars page, then goes to `link` in the
 * sidebar by a client-side navigation, so the fault survives.
 */
async function failTagsThenGo(page: Page, link: string, url: RegExp) {
  await expectViewLoaded(page, "Month");
  await failReads(page, "tags");
  await page
    .locator('[data-slot="sidebar"]')
    .getByRole("link", { name: link, exact: true })
    .click();
  await expect(page).toHaveURL(url, NAVIGATION);
}

/**
 * The keyboard path to a TagPicker's inline Retry (P7-T53): Tab from the tag
 * input focuses the alert's Retry. With `failAgain`, Enter with the fault
 * still on: the button goes busy, keeps focus and comes back, and the alert
 * stays with no skeleton in `scope`. Then the fault clears and Enter removes
 * the alert, puts focus back on the input, and the list offers tags.
 */
async function keyboardRetry(
  page: Page,
  container: Locator,
  scope: string,
  input: Locator,
  { failAgain = false } = {},
) {
  const alert = container.getByRole("alert").filter({ hasText: TAGS_ERROR });
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(FAULT_MESSAGE);
  // Shown without opening the list.
  await expect(page.getByRole("listbox")).toHaveCount(0);
  const retry = alert.getByRole("button", { name: "Retry", exact: true });

  await input.focus();
  await page.keyboard.press("Tab");
  await expect(retry).toBeFocused();

  if (failAgain) {
    const readWatch = await watchRetry(page, scope);
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await readWatch()).sawBusy).toBe(true);
    await expect(retry).toBeEnabled();
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(FAULT_MESSAGE);
    await expect(retry).toBeFocused();
    expect(await readWatch()).toEqual({
      sawBusy: true,
      sawSkeleton: false,
      sawLabelledSpinner: false,
    });
  }

  await restoreReads(page);
  await page.keyboard.press("Enter");
  await expect(alert).toHaveCount(0);
  await expect(input).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("option").first()).toBeVisible();
  await expect(page.getByText(TAG_PICKER_ERROR, { exact: true })).toHaveCount(
    0,
  );
}

test("tag picker: contact form sheet: a failed tag read offers a keyboard Retry", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/calendars");
  await failTagsThenGo(page, "Contacts", /\/contacts$/);
  await expect(loadErrorAlert(page, TAGS_ERROR)).toBeVisible();

  await page
    .locator("main")
    .getByRole("button", { name: "Add contact", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Add contact" });
  await expect(dialog).toBeVisible();
  await keyboardRetry(
    page,
    dialog,
    '[data-slot="sheet-content"]',
    dialog.locator("#tagIds"),
    { failAgain: true },
  );
});

test("tag picker: deal form sheet shows the tags error with Retry", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/calendars");
  await failTagsThenGo(page, "Opportunities", /\/opportunities$/);
  await expect(loadErrorAlert(page, TAGS_ERROR)).toBeVisible();

  await page.getByRole("button", { name: "New deal", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New deal" });
  await expect(dialog).toBeVisible();
  await keyboardRetry(
    page,
    dialog,
    '[data-slot="sheet-content"]',
    dialog.locator("#tagIds"),
  );
});

test("tag picker: bulk Tags popover offers a keyboard Retry", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/calendars");
  await failTagsThenGo(page, "Contacts", /\/contacts$/);
  await expect(contactRows(page)).toHaveCount(PAGE_SIZE);

  await contactRows(page).first().check();
  await page
    .locator("main")
    .getByRole("button", { name: "Tags", exact: true })
    .click();
  const popover = page.locator('[data-slot="popover-content"]');
  await expect(popover).toBeVisible();
  await keyboardRetry(
    page,
    popover,
    '[data-slot="popover-content"]',
    popover.getByRole("combobox", { name: "Tags", exact: true }),
  );
});

test("tag picker: a tags read started elsewhere does not pull focus into the bulk popover's picker", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/calendars");
  await failTagsThenGo(page, "Contacts", /\/contacts$/);
  await expect(contactRows(page)).toHaveCount(PAGE_SIZE);
  // The page's own tags alert, not the popover's (which is portaled).
  const pageAlert = page
    .locator("main")
    .getByRole("alert")
    .filter({ hasText: TAGS_ERROR });
  await expect(pageAlert).toBeVisible();
  const pageRetry = pageAlert.getByRole("button", {
    name: "Retry",
    exact: true,
  });

  await contactRows(page).first().check();
  await page
    .locator("main")
    .getByRole("button", { name: "Tags", exact: true })
    .click();
  const popover = page.locator('[data-slot="popover-content"]');
  await expect(popover).toBeVisible();
  const alert = popover.getByRole("alert").filter({ hasText: TAGS_ERROR });
  await expect(alert).toBeVisible();
  const retry = alert.getByRole("button", { name: "Retry", exact: true });
  const input = popover.getByRole("combobox", { name: "Tags", exact: true });

  // The inline Retry is activated (by Enter) and fails again, so the alert
  // stays and the picker has a reason to remember its Retry.
  await input.focus();
  await page.keyboard.press("Tab");
  await expect(retry).toBeFocused();
  const readWatch = await watchRetry(page, '[data-slot="popover-content"]');
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await readWatch()).sawBusy).toBe(true);
  await expect(retry).toBeEnabled();
  await expect(alert).toBeVisible();

  // Focus leaves the alert with no element receiving it (relatedTarget
  // null), as a click on blank space or a window switch does.
  await page.evaluate(() =>
    (document.activeElement as HTMLElement | null)?.blur(),
  );
  await expect(popover).toBeVisible();
  await expect(alert).toBeVisible();
  expect(
    await page.evaluate(() => document.activeElement === document.body),
  ).toBe(true);

  // A read started elsewhere succeeds, with the popover and its picker still
  // mounted. A real .click() would close the popover (an outside press) and
  // let this test pass without proving anything. The synthetic click fires
  // React's onClick with no press before it; Base UI's useDismiss ignores
  // such a click only when it has a click count (`detail`), since a
  // detail-0 click reads as a keyboard or assistive-technology activation,
  // which does dismiss.
  await restoreReads(page);
  await pageRetry.dispatchEvent("click", { detail: 1 });
  await expect(pageAlert).toHaveCount(0);
  await expect(alert).toHaveCount(0);
  await expect(popover).toBeVisible();
  // Let any focus effect run before reading focus.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => setTimeout(resolve, 50)),
        ),
      ),
  );
  await expect(input).not.toBeFocused();
  expect(
    await page.evaluate(() => document.activeElement === document.body),
  ).toBe(true);
});
