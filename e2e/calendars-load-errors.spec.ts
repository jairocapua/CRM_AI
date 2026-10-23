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
  readSeededAppointments,
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
 * page, and in the booking dialog's calendar list and open times. A contact
 * that does not exist keeps its "Contact not found" state, not the load
 * error. A re-read that fails with a list already on screen keeps the list,
 * with no error in its place (the booking dialog's last test). The dialog's
 * calendar list has no such test: nothing refetches it while the dialog is
 * open, so that case holds by construction (DECISIONS P7-T36).
 *
 * The mock never fails a read, so `failReads` makes one fail from the page,
 * and `armContactFault` makes one contact's read fail where `failReads`
 * cannot reach it (see calendar-helpers.ts). Both can be switched off, so
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
