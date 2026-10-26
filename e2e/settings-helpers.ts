import type { Locator, Page } from "@playwright/test";

import { expect, NAVIGATION } from "./fixtures";

/** Helpers the settings specs share (P9-T02). */

/** The section nav in the settings layout. */
export const sectionNav = (page: Page): Locator =>
  page.getByRole("navigation", { name: "Settings sections" });

/** The page's own `<h1>`, inside the shell's `<main>`. */
export const pageHeading = (page: Page, name: string): Locator =>
  page.getByRole("main").getByRole("heading", { level: 1, name, exact: true });

/** A form by its accessible name (its card's heading). */
export const settingsForm = (page: Page, name: string): Locator =>
  page.getByRole("form", { name });

/** The Save button of a settings form. */
export const saveButton = (form: Locator): Locator =>
  form.getByRole("button", { name: /^(Save changes|Saving…)$/ });

/** Opens a section by its link in the section nav. */
export async function openSection(
  page: Page,
  link: string,
  path: RegExp,
): Promise<void> {
  await sectionNav(page).getByRole("link", { name: link, exact: true }).click();
  await expect(page).toHaveURL(path, NAVIGATION);
}

/**
 * Sets the Demo Data page's failure rate (the second slider) to 100%, and,
 * when `slow`, its latency (the first) to the 3,000 ms maximum. Both live in
 * memory, so reach the page under test by links afterwards, not a reload;
 * each test's fresh context resets them. Call on `/settings/demo-data`.
 */
export async function failEveryMutation(
  page: Page,
  { slow = false }: { slow?: boolean } = {},
): Promise<void> {
  const main = page.getByRole("main");
  const failure = page.getByRole("slider").nth(1);
  await failure.focus();
  await failure.press("End");
  await expect(main.getByText("100%", { exact: true })).toBeVisible();
  if (slow) {
    const latency = page.getByRole("slider").nth(0);
    await latency.focus();
    await latency.press("End");
    await expect(main.getByText("3000 ms", { exact: true })).toBeVisible();
  }
}

/** The toast with this title. */
export const toastNamed = (page: Page, title: string): Locator =>
  page.locator("[data-sonner-toast]").filter({ hasText: title });

/** Accepts the browser's `beforeunload` prompt, so a reload of a page with
 *  unsaved edits goes ahead. */
export function acceptLeavePrompts(page: Page): void {
  page.on("dialog", (dialog) => void dialog.accept());
}
