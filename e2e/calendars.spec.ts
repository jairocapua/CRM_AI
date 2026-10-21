import type { Page } from "@playwright/test";

import { expect, test, waitForBoot } from "./fixtures";

/**
 * The calendars page keeps its view and date in the URL
 * (`/calendars?view=week&date=2026-09-08`), falls back quietly on bad values,
 * and lets each calendar be hidden from every view.
 *
 * Pinned to Singapore and en-US. The demo clock starts at the seed's anchor,
 * 2026-09-08T09:00Z: 17:00 on Tuesday 8 September in Singapore, so "today" is
 * 2026-09-08 with seven hours to spare. Unpinned, the labels would depend on
 * the machine running the suite. The default month is September 2026, the
 * anchor's month, not the wall clock's.
 */
test.use({ timezoneId: "Asia/Singapore", locale: "en-US" });

type ViewName = "Month" | "Week" | "Day";

const viewButton = (page: Page, name: ViewName) =>
  page
    .getByRole("group", { name: "Calendar view" })
    .getByRole("button", { name, exact: true });

/** The toolbar's range heading (the page title is the only h1). */
const rangeHeading = (page: Page) => page.getByRole("heading", { level: 2 });

async function expectPosition(page: Page, view: ViewName, label: string) {
  await expect(viewButton(page, view)).toHaveAttribute("aria-pressed", "true");
  await expect(rangeHeading(page)).toHaveText(label);
}

/** Waits until the current view has its data, so an absence is not vacuous. */
async function expectViewLoaded(page: Page, view: ViewName) {
  await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0);
  await expect(page.getByText(`${view} view`, { exact: true })).toBeVisible();
}

test("view and date live in the URL and survive a reload", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/calendars");
  await expectPosition(page, "Month", "September 2026");
  await expect(page.getByText("Asia/Singapore · GMT+8")).toBeVisible();

  await page.getByRole("button", { name: "Previous month" }).click();
  await expect(page).toHaveURL(/\/calendars\?view=month&date=2026-08-08$/);
  await expectPosition(page, "Month", "August 2026");

  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(page).toHaveURL(/\/calendars\?view=month&date=2026-09-08$/);
  await expectPosition(page, "Month", "September 2026");

  await viewButton(page, "Week").click();
  await expect(page).toHaveURL(/\/calendars\?view=week&date=2026-09-08$/);
  await expectPosition(page, "Week", "Sep 6 – 12, 2026");

  await page.getByRole("button", { name: "Next week" }).click();
  await expect(page).toHaveURL(/\/calendars\?view=week&date=2026-09-15$/);
  await expectPosition(page, "Week", "Sep 13 – 19, 2026");

  await viewButton(page, "Day").click();
  await expect(page).toHaveURL(/\/calendars\?view=day&date=2026-09-15$/);
  await expectPosition(page, "Day", "Tuesday, September 15, 2026");

  // Reloading that URL restores the same view and date.
  await page.reload();
  await waitForBoot(page);
  await expect(page).toHaveURL(/\/calendars\?view=day&date=2026-09-15$/);
  await expectPosition(page, "Day", "Tuesday, September 15, 2026");
  await expectViewLoaded(page, "Day");

  await page.getByRole("button", { name: "Previous day" }).click();
  await expect(page).toHaveURL(/\/calendars\?view=day&date=2026-09-14$/);
  await expectPosition(page, "Day", "Monday, September 14, 2026");

  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(page).toHaveURL(/\/calendars\?view=day&date=2026-09-08$/);
  await expectPosition(page, "Day", "Tuesday, September 8, 2026");

  // Each step is a history entry, so Back walks them.
  await page.goBack();
  await expect(page).toHaveURL(/\/calendars\?view=day&date=2026-09-14$/);
  await expectPosition(page, "Day", "Monday, September 14, 2026");
});

const FALLBACKS: { url: string; view: ViewName; label: string }[] = [
  { url: "/calendars?view=year", view: "Month", label: "September 2026" },
  { url: "/calendars?date=2026-02-30", view: "Month", label: "September 2026" },
  {
    url: "/calendars?view=week&date=banana",
    view: "Week",
    label: "Sep 6 – 12, 2026",
  },
  {
    url: "/calendars?view=DAY&date=2026-13-01",
    view: "Month",
    label: "September 2026",
  },
  // A valid date is kept even with no view.
  { url: "/calendars?date=2026-12-25", view: "Month", label: "December 2026" },
];

for (const { url, view, label } of FALLBACKS) {
  // The shared fixture fails the test on any console error or page error.
  test(`${url} falls back without an error`, async ({ page, gotoApp }) => {
    await gotoApp(url);
    await expectPosition(page, view, label);
    await expectViewLoaded(page, view);
    // Not rewritten on load: the URL stays exactly as typed.
    expect(new URL(page.url()).search).toBe(
      new URL(url, "http://localhost").search,
    );
  });
}

test("the first step after a fallback writes canonical values", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/calendars?view=year&date=banana");
  await expectPosition(page, "Month", "September 2026");

  await page.getByRole("button", { name: "Next month" }).click();
  await expect(page).toHaveURL(/\/calendars\?view=month&date=2026-10-08$/);
  await expectPosition(page, "Month", "October 2026");
});

test("hiding a calendar drops its appointments from every view", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/calendars?view=month&date=2026-09-08");
  await expectViewLoaded(page, "Month");

  const list = page.getByRole("group", { name: "Calendars" });
  const toggles = list.getByRole("checkbox");
  await expect(toggles).toHaveCount(4);
  for (const toggle of await toggles.all()) await expect(toggle).toBeChecked();

  // The seeded inactive calendar is listed, visible and muted.
  const monthlyReview = list.locator("label", { hasText: "Monthly Review" });
  await expect(monthlyReview).toHaveAttribute("data-inactive", "");
  await expect(monthlyReview).toContainText("Inactive");

  const inView = page.getByRole("list", { name: "Appointments in view" });
  const discovery = inView
    .getByRole("listitem")
    .filter({ hasText: "Discovery Call" });
  const total = page.getByText(/^\d+ appointments? in view$/);

  // Read from the page rather than hard-coded, but never vacuous: a seed
  // change that empties Discovery Call in this month fails here, loudly.
  const discoveryCount = Number(
    /(\d+)$/.exec((await discovery.textContent()) ?? "")?.[1],
  );
  const totalCount = Number(
    /^(\d+)/.exec((await total.textContent()) ?? "")?.[1],
  );
  expect(discoveryCount).toBeGreaterThan(0);
  expect(totalCount).toBeGreaterThan(discoveryCount);

  const discoveryToggle = list.getByRole("checkbox", {
    name: /Discovery Call/,
  });
  await discoveryToggle.click();
  await expect(discoveryToggle).not.toBeChecked();
  await expect(discovery).toHaveCount(0);
  await expect(total).toHaveText(
    `${totalCount - discoveryCount} appointments in view`,
  );

  // Every view: the calendar stays hidden across a view change, and the week
  // (fetched fresh for its own range) has no Discovery Call rows either.
  await viewButton(page, "Week").click();
  await expect(page).toHaveURL(/\/calendars\?view=week&date=2026-09-08$/);
  await expectViewLoaded(page, "Week");
  await expect(discoveryToggle).not.toBeChecked();
  await expect(discovery).toHaveCount(0);

  // Showing it again brings its rows back, in this view and the month.
  await discoveryToggle.click();
  await expect(discoveryToggle).toBeChecked();
  await expect(discovery).toHaveCount(1);

  await viewButton(page, "Month").click();
  await expectViewLoaded(page, "Month");
  await expect(discovery).toHaveText(new RegExp(`${discoveryCount}$`));
  await expect(total).toHaveText(`${totalCount} appointments in view`);
});
