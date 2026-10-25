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
  sectionNav,
  settingsForm,
  toastNamed,
} from "./settings-helpers";

/**
 * The profile page (P9-T02): the current user (seeded Jordan Reyes,
 * `usr_jordan`) edited through `users.update`, the sidebar's user menu
 * following the saved name, the form's own errors, the API's refusal, the
 * leave guard and the page's load error.
 */

const form = (page: Page) => settingsForm(page, "Your details");
const input = (page: Page, label: string) =>
  form(page).getByLabel(label, { exact: true });
const firstName = (page: Page) => input(page, "First name");

/** The sidebar footer's user-menu trigger, by the name it shows. */
const userButton = (page: Page, name: string) =>
  page.getByRole("button", { name: new RegExp(name) });

test("a saved name persists across a reload and shows in the sidebar's user menu", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/profile");
  await expect(pageHeading(page, "Profile")).toBeVisible();
  await expect(userButton(page, "Jordan Reyes")).toContainText("JR");
  await expect(firstName(page)).toHaveValue("Jordan");
  await expect(input(page, "Role")).toHaveValue("Agency owner");
  await expect(input(page, "Role")).toHaveAttribute("readonly", "");

  await firstName(page).fill("Taylor");
  await saveButton(form(page)).click();

  await expect(toastNamed(page, "Profile saved")).toBeVisible();
  // The sidebar follows without a reload.
  await expect(userButton(page, "Taylor Reyes")).toContainText("TR");
  await expect(userButton(page, "Jordan Reyes")).toHaveCount(0);

  await page.reload();
  await waitForBoot(page);
  await expect(firstName(page)).toHaveValue("Taylor");
  await expect(userButton(page, "Taylor Reyes")).toBeVisible();
  await expect(userButton(page, "Taylor Reyes")).toContainText(
    "jordan@northwind.studio",
  );
});

test("My profile in the user menu opens the profile page", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/dashboard");
  await userButton(page, "Jordan Reyes").click();
  await page.getByRole("menuitem", { name: "My profile", exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/profile$/, NAVIGATION);
  await expect(pageHeading(page, "Profile")).toBeVisible();
});

test("an empty submit shows each required field's error and saves nothing", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/profile");
  await expect(firstName(page)).toHaveValue("Jordan");
  await firstName(page).fill("");
  await input(page, "Last name").fill("  ");
  await input(page, "Email").fill("");
  await saveButton(form(page)).click();

  for (const [label, message] of [
    ["First name", "Enter a first name."],
    ["Last name", "Enter a last name."],
    ["Email", "Enter an email address."],
  ] as const) {
    await expect(input(page, label)).toHaveAttribute("aria-invalid", "true");
    await expect(input(page, label)).toHaveAccessibleDescription(message);
  }
  await expect(input(page, "Phone (optional)")).not.toHaveAttribute(
    "aria-invalid",
  );
  await expect(toastNamed(page, "Profile saved")).toHaveCount(0);
  await expect(userButton(page, "Jordan Reyes")).toBeVisible();

  // A malformed email has its own message.
  await input(page, "Email").fill("jordan@");
  await expect(input(page, "Email")).toHaveAccessibleDescription(
    "Enter a valid email address, like name@example.com.",
  );

  acceptLeavePrompts(page);
  await page.reload();
  await waitForBoot(page);
  await expect(firstName(page)).toHaveValue("Jordan");
  await expect(input(page, "Last name")).toHaveValue("Reyes");
  await expect(input(page, "Email")).toHaveValue("jordan@northwind.studio");
});

test("a refused save shows the API's sentence, keeps what was typed and keeps focus on Save", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/demo-data");
  await failEveryMutation(page, { slow: true });
  await openSection(page, "Profile", /\/settings\/profile$/);
  await expect(firstName(page)).toHaveValue("Jordan", NAVIGATION);

  await firstName(page).fill("Taylor");
  await input(page, "Job title (optional)").fill("Chief of staff");
  const save = saveButton(form(page));
  await save.click();

  // Pending: the label says so, the button is disabled and keeps focus.
  await expect(save).toHaveText("Saving…");
  await expect(save).toHaveAttribute("aria-disabled", "true");
  await expect(save).toBeFocused();

  await expect(
    form(page)
      .getByRole("alert")
      .filter({ hasText: "Network request failed. Please try again." }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(save).toHaveText("Save changes");
  await expect(save).toBeFocused();
  await expect(firstName(page)).toHaveValue("Taylor");
  await expect(input(page, "Job title (optional)")).toHaveValue(
    "Chief of staff",
  );
  await expect(toastNamed(page, "Profile saved")).toHaveCount(0);
  await expect(userButton(page, "Jordan Reyes")).toBeVisible();
});

test("an email a teammate already has is refused on the email field", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/profile");
  await expect(firstName(page)).toHaveValue("Jordan");
  await input(page, "Email").fill("Priya@northwind.studio");
  await saveButton(form(page)).click();

  await expect(input(page, "Email")).toHaveAttribute("aria-invalid", "true");
  await expect(input(page, "Email")).toHaveAccessibleDescription(
    "That email address already belongs to Priya Nair.",
  );
  await expect(input(page, "Email")).toBeFocused();
  await expect(input(page, "Email")).toHaveValue("Priya@northwind.studio");
  await expect(toastNamed(page, "Profile saved")).toHaveCount(0);
});

test("unsaved edits ask before the section nav leaves the page", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/profile");
  await firstName(page).fill("Taylor");

  const dialog = page.getByRole("alertdialog", {
    name: "Discard unsaved changes?",
  });
  await sectionNav(page)
    .getByRole("link", { name: "Business", exact: true })
    .click();
  await expect(dialog).toContainText("Your changes to your profile");
  await dialog.getByRole("button", { name: "Keep editing" }).click();
  await expect(page).toHaveURL(/\/settings\/profile$/);
  await expect(firstName(page)).toHaveValue("Taylor");

  await sectionNav(page)
    .getByRole("link", { name: "Business", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Discard changes" }).click();
  await expect(page).toHaveURL(/\/settings\/business$/, NAVIGATION);
});

test("unsaved edits ask before the Role field's Team link leaves the page", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/profile");
  await firstName(page).fill("Taylor");

  const dialog = page.getByRole("alertdialog", {
    name: "Discard unsaved changes?",
  });
  await form(page).getByRole("link", { name: "Team", exact: true }).click();
  await expect(dialog).toContainText("Your changes to your profile");
  await dialog.getByRole("button", { name: "Keep editing" }).click();
  await expect(page).toHaveURL(/\/settings\/profile$/);
  await expect(firstName(page)).toHaveValue("Taylor");
});

test("a failed profile read shows the alert, and Retry brings the form back", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings");
  // Armed by the Demo Data page's counts, then failed before the profile
  // page reads the current user (by key).
  await armRecordFault(page, "usr_jordan");
  await page
    .getByRole("main")
    .getByRole("link", { name: "Demo data", exact: true })
    .click();
  await expect(page).toHaveURL(/\/settings\/demo-data$/, NAVIGATION);
  await failRecordRead(page);
  await openSection(page, "Profile", /\/settings\/profile$/);

  const alert = loadErrorAlert(page, "Could not load your profile");
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("Something went wrong.");
  await expect(form(page)).toHaveCount(0);
  // One fault, one alert: the page's.
  await expect(
    page.getByRole("alert").filter({ hasText: "Could not" }),
  ).toHaveCount(1);

  await restoreRecordRead(page);
  await alert.getByRole("button", { name: "Retry" }).click();
  await expect(firstName(page)).toHaveValue("Jordan");
  await expect(alert).toHaveCount(0);
});
