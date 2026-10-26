import type { Page } from "@playwright/test";

import {
  armRecordFault,
  failRecordRead,
  loadErrorAlert,
  restoreRecordRead,
} from "./calendar-helpers";
import { expect, NAVIGATION, test, waitForBoot } from "./fixtures";
import {
  acceptLeavePrompts,
  failEveryMutation,
  openSection,
  pageHeading,
  saveButton,
  settingsForm,
  toastNamed,
} from "./settings-helpers";

/**
 * The business page (P9-T02): the active location (seeded Northwind Studio,
 * `loc_northwind`, America/Los_Angeles) edited through
 * `settings.updateLocation`, the sidebar's location switcher following the
 * saved name, the form's own errors, the API's refusal and the page's load
 * error.
 */

const form = (page: Page) => settingsForm(page, "Business details");
const input = (page: Page, label: string) =>
  form(page).getByLabel(label, { exact: true });
const businessName = (page: Page) => input(page, "Business name");
const timeZone = (page: Page) =>
  form(page).getByRole("combobox", { name: "Time zone" });

/** The sidebar header's location switcher, by the name it shows. */
const switcher = (page: Page, name: string) =>
  page.getByRole("button", { name: new RegExp(name) });

test("a saved name and time zone persist across a reload, and the switcher shows the new name", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/business");
  await expect(pageHeading(page, "Business")).toBeVisible();
  await expect(switcher(page, "Northwind Studio")).toBeVisible();
  await expect(businessName(page)).toHaveValue("Northwind Studio");
  await expect(timeZone(page)).toHaveValue("America/Los Angeles");
  await expect(input(page, "Currency")).toHaveValue("USD · US Dollar");
  await expect(input(page, "Currency")).toHaveAttribute("readonly", "");

  await businessName(page).fill("Northwind Creative");
  await timeZone(page).fill("Singapore");
  await page
    .getByRole("option", { name: "Asia/Singapore", exact: true })
    .click();
  await expect(timeZone(page)).toHaveValue("Asia/Singapore");
  await saveButton(form(page)).click();

  await expect(toastNamed(page, "Business details saved")).toBeVisible();
  await expect(switcher(page, "Northwind Creative")).toBeVisible();
  await expect(switcher(page, "Northwind Studio")).toHaveCount(0);

  await page.reload();
  await waitForBoot(page);
  await expect(businessName(page)).toHaveValue("Northwind Creative");
  await expect(timeZone(page)).toHaveValue("Asia/Singapore");

  // The switcher's list comes from the API, sorted by name, the active one
  // ticked.
  await switcher(page, "Northwind Creative").click();
  await expect(page.getByRole("menuitem")).toHaveText([
    /Harbor Dental/,
    /Northwind Creative/,
    /Peak Fitness Co\./,
  ]);
});

test("an empty name and a bad website show their errors and save nothing", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/business");
  await expect(businessName(page)).toHaveValue("Northwind Studio");
  await businessName(page).fill(" ");
  await input(page, "Website (optional)").fill("northwind.studio");
  await saveButton(form(page)).click();

  await expect(businessName(page)).toHaveAccessibleDescription(
    "Enter the business name.",
  );
  await expect(input(page, "Website (optional)")).toHaveAccessibleDescription(
    "Enter a web address that starts with https://.",
  );
  await expect(toastNamed(page, "Business details saved")).toHaveCount(0);
  await expect(switcher(page, "Northwind Studio")).toBeVisible();

  acceptLeavePrompts(page);
  await page.reload();
  await waitForBoot(page);
  await expect(businessName(page)).toHaveValue("Northwind Studio");
  await expect(input(page, "Website (optional)")).toHaveValue(
    "https://northwind.studio",
  );
});

test("a refused save shows the API's sentence and keeps what was typed", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/demo-data");
  await failEveryMutation(page);
  await openSection(page, "Business", /\/settings\/business$/);
  await expect(businessName(page)).toHaveValue("Northwind Studio", NAVIGATION);

  await businessName(page).fill("Northwind Creative");
  await input(page, "Industry (optional)").fill("Design studio");
  const save = saveButton(form(page));
  await save.click();

  await expect(
    form(page)
      .getByRole("alert")
      .filter({ hasText: "Network request failed. Please try again." }),
  ).toBeVisible();
  await expect(save).toBeFocused();
  await expect(businessName(page)).toHaveValue("Northwind Creative");
  await expect(input(page, "Industry (optional)")).toHaveValue("Design studio");
  await expect(toastNamed(page, "Business details saved")).toHaveCount(0);
  await expect(switcher(page, "Northwind Studio")).toBeVisible();
});

test("a failed business read shows the alert, and Retry brings the form back", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings");
  // Armed by the Demo Data page's counts, then failed before the business
  // page reads the active location (by key).
  await armRecordFault(page, "loc_northwind");
  await page
    .getByRole("main")
    .getByRole("link", { name: "Demo data", exact: true })
    .click();
  await expect(page).toHaveURL(/\/settings\/demo-data$/, NAVIGATION);
  await failRecordRead(page);
  await openSection(page, "Business", /\/settings\/business$/);

  const alert = loadErrorAlert(page, "Could not load the business details");
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("Something went wrong.");
  await expect(form(page)).toHaveCount(0);
  await expect(
    page.getByRole("alert").filter({ hasText: "Could not" }),
  ).toHaveCount(1);

  await restoreRecordRead(page);
  await alert.getByRole("button", { name: "Retry" }).click();
  await expect(businessName(page)).toHaveValue("Northwind Studio");
  await expect(alert).toHaveCount(0);
});
