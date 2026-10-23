import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/**
 * The deal sheet's Expected close field. A day is valid by the one shared rule
 * in `@/lib/dates`, the same one the booking dialog's Day field uses, so a
 * value the rule refuses is reported under the field before the save, never
 * saved as "no date". Chromium's date input accepts any year from 0001, so
 * '0099-01-01' is a value a user can really type (`new Date` would read it as
 * 1999).
 */

test.use({ timezoneId: "Asia/Singapore", locale: "en-US" });

const SKELETON = '[data-slot="skeleton"]';

async function openNewDeal(
  page: Page,
  gotoApp: (path: string) => Promise<void>,
) {
  await gotoApp("/opportunities");
  await expect(page.locator(SKELETON)).toHaveCount(0, { timeout: 15_000 });
  await page.getByRole("button", { name: "New deal", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New deal" });
  const input = dialog.getByLabel("Expected close", { exact: true });
  // `[data-slot=field]` rather than role=group: FieldSet and Field are both
  // groups. The inner locator is page-rooted because `has` matches it inside
  // each candidate field.
  const field = dialog
    .locator('[data-slot="field"]')
    .filter({ has: page.getByLabel("Expected close", { exact: true }) });
  await expect(field).toHaveCount(1);
  return { dialog, input, field };
}

test("Expected close refuses a year the shared day rule refuses", async ({
  page,
  gotoApp,
}) => {
  const { dialog, input, field } = await openNewDeal(page, gotoApp);

  await input.fill("0099-01-01");
  await expect(input).toHaveValue("0099-01-01");
  await dialog.getByRole("button", { name: "Create deal" }).click();

  await expect(field.getByRole("alert")).toHaveText("Enter a valid date.");
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(dialog).toBeVisible();
});

test("Expected close accepts a real day", async ({ page, gotoApp }) => {
  const { dialog, input, field } = await openNewDeal(page, gotoApp);

  await input.fill("2026-12-01");
  await expect(input).toHaveValue("2026-12-01");
  await dialog.getByRole("button", { name: "Create deal" }).click();

  // The empty deal name proves validation ran, so the quiet field below is a
  // verdict, not a form that never checked.
  await expect(
    dialog.getByRole("alert").filter({ hasText: "Deal name is required." }),
  ).toBeVisible();
  await expect(field.getByRole("alert")).toHaveCount(0);
  await expect(input).not.toHaveAttribute("aria-invalid");
});
