import type { Page } from "@playwright/test";

import {
  bookingDialog,
  chooseCalendar,
  expectPosition,
  expectViewLoaded,
  failReads,
  loadErrorAlert,
  openTimes,
  readContacts,
  readSeededAppointments,
  restoreReads,
  timeGroup,
  timeRadio,
  viewRegion,
} from "./calendar-helpers";
import { expect, test } from "./fixtures";

/**
 * A read that fails with nothing on screen shows an error with Retry, never a
 * skeleton that stays forever or an empty state that is not true: on the
 * calendars page (the first load and a step to a new range), on a contact's
 * Appointments tab, on the availability page and in the booking dialog's
 * open times. A re-read that fails with a list already on screen keeps the
 * list, with no error in its place (the booking dialog's last test).
 *
 * The mock never fails a read, so `failReads` makes one fail from the page
 * (see calendar-helpers.ts). It can be switched off, so each test proves both
 * halves: the error appears, and once the fault is off, Retry brings the data
 * back. The fault is a plain Error, which `useResource` reports as "Something
 * went wrong.".
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
  await expect(page).toHaveURL(/\/calendars$/);
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

test("availability page: a failed calendars load offers Retry", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/calendars?view=month&date=2026-09-08");
  // Every read on this page has settled before the fault goes on.
  await expectViewLoaded(page, "Month");

  await failReads(page, "calendars");
  await page.getByRole("link", { name: "Availability", exact: true }).click();
  await expect(page).toHaveURL(/\/calendars\/availability$/);

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
