import {
  expectPosition,
  expectViewLoaded,
  failReads,
  loadErrorAlert,
  readSeededAppointments,
  restoreReads,
  viewRegion,
} from "./calendar-helpers";
import { expect, test } from "./fixtures";

/**
 * A read that fails with nothing on screen shows an error with Retry, never a
 * skeleton that stays forever or an empty state that is not true: on the
 * calendars page (the first load and a step to a new range), on a contact's
 * Appointments tab and on the availability page.
 *
 * The mock never fails a read, so `failReads` makes one fail from the page
 * (see calendar-helpers.ts). It can be switched off, so each test proves both
 * halves: the error appears, and once the fault is off, Retry brings the data
 * back. The fault is a plain Error, which `useResource` reports as "Something
 * went wrong.".
 *
 * Pinned to Singapore and en-US, like the other calendar specs: the demo
 * clock's today is 2026-09-08, so the default month is September 2026.
 */
test.use({ timezoneId: "Asia/Singapore", locale: "en-US" });

const APPOINTMENTS_ERROR = "Could not load appointments";
const CALENDARS_ERROR = "Could not load calendars";
const FAULT_MESSAGE = "Something went wrong.";

interface RetryWatch {
  /** The Retry button was seen with aria-disabled="true". */
  sawBusy: boolean;
  /** A skeleton was added to the page's main area. */
  sawSkeleton: boolean;
  /** While busy, something in the button still carried an aria-label. */
  sawLabelledSpinner: boolean;
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

  // A Retry that fails again. Records, at every DOM change from here on,
  // whether the button went busy and whether a skeleton appeared.
  await page.evaluate(() => {
    const flags = {
      sawBusy: false,
      sawSkeleton: false,
      sawLabelledSpinner: false,
    };
    const check = () => {
      if (document.querySelector('main [data-slot="skeleton"]')) {
        flags.sawSkeleton = true;
      }
      const button = document.querySelector(
        '[data-slot="alert"] [data-slot="button"]',
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
  });
  const readWatch = () =>
    page.evaluate(
      () => (window as unknown as { __retryWatch: RetryWatch }).__retryWatch,
    );

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
