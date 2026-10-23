import type { Locator, Page } from "@playwright/test";

import {
  armContactFault,
  bookingDialog,
  chooseCalendar,
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
  viewRegion,
} from "./calendar-helpers";
import { expect, NAVIGATION, test } from "./fixtures";

/**
 * A read that fails with nothing on screen shows an error with Retry, never a
 * skeleton that stays forever or an empty state that is not true: on the
 * calendars page (the first load, a step to a new range, and its calendar
 * list), on a contact's page and its Appointments tab, on the availability
 * page and in the booking dialog's open times. A contact that does not exist
 * keeps its "Contact not found" state, not the load error. A re-read that
 * fails with a list already on screen keeps the list, with no error in its
 * place (the booking dialog's last test).
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

interface RetryWatch {
  /** The Retry button was seen with aria-disabled="true". */
  sawBusy: boolean;
  /** A skeleton was added to the page's main area. */
  sawSkeleton: boolean;
  /** While busy, something in the button still carried an aria-label. */
  sawLabelledSpinner: boolean;
}

/**
 * Records, at every DOM change from now on, whether the Retry button of an
 * alert inside `scope` (a CSS selector) went busy and whether a skeleton
 * appeared inside `scope`. Returns a reader for the flags.
 */
async function watchRetry(page: Page, scope: string) {
  await page.evaluate((scope) => {
    const flags: RetryWatch = {
      sawBusy: false,
      sawSkeleton: false,
      sawLabelledSpinner: false,
    };
    const check = () => {
      if (document.querySelector(`${scope} [data-slot="skeleton"]`)) {
        flags.sawSkeleton = true;
      }
      const button = document.querySelector(
        `${scope} [data-slot="alert"] [data-slot="button"]`,
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
  }, scope);
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
  // The calendars alert is the only alert in main.
  const readWatch = await watchRetry(page, "main");
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

test("booking dialog: a failed re-read of the open times keeps the list on screen", async ({
  page,
  gotoApp,
}) => {
  const DAY = "2026-09-09";
  await gotoApp(`/calendars?view=month&date=${DAY}`);
  await expectViewLoaded(page, "Month");
  const [contact] = await readContacts(page);
  if (!contact) throw new Error("The seed has no contacts");

  await page.getByRole("button", { name: "Book", exact: true }).click();
  const dialog = bookingDialog(page);
  await expect(dialog.getByLabel("Day", { exact: true })).toHaveValue(DAY);
  await chooseCalendar(page, dialog, "Discovery Call");
  const times = await openTimes(dialog, DAY, ZONE);
  expect(times).toHaveLength(16);
  const contactInput = dialog.getByRole("combobox", { name: "Contact" });
  await contactInput.fill(contact.name);
  // Any contact of that name will do: the booking fails either way.
  await page
    .getByRole("option")
    .filter({ has: page.getByText(contact.name, { exact: true }) })
    .first()
    .click();
  await expect(contactInput).toHaveValue(contact.name);
  const [first] = times;
  if (!first) throw new Error("No open time");
  await timeRadio(dialog, first.label).click();
  await expect(timeRadio(dialog, first.label)).toHaveAttribute(
    "aria-checked",
    "true",
  );

  // Notes the Time group going busy, so the test knows the times were read
  // again, rather than passing because nothing happened.
  const group = timeGroup(dialog);
  await group.evaluate((fieldset) => {
    const w = window as unknown as { __timesWentBusy?: boolean };
    w.__timesWentBusy = false;
    new MutationObserver(() => {
      if (fieldset.getAttribute("aria-busy") === "true") {
        w.__timesWentBusy = true;
      }
    }).observe(fieldset, { attributes: true, attributeFilter: ["aria-busy"] });
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
          (window as unknown as { __timesWentBusy?: boolean }).__timesWentBusy,
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
