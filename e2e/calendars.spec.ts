import {
  expectPosition,
  expectViewLoaded,
  viewButton,
  viewRegion,
  type ViewName,
} from "./calendar-helpers";
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

  // The month grid's chips (each names its calendar for screen readers).
  const monthChips = viewRegion(page, "Month").getByRole("listitem");
  const monthDiscovery = monthChips.filter({ hasText: "Discovery Call" });

  // Read from the page rather than hard-coded, but never vacuous: a seed
  // change that empties Discovery Call in this month fails here, loudly.
  const discoveryCount = await monthDiscovery.count();
  expect(discoveryCount).toBeGreaterThan(0);
  expect(await monthChips.count()).toBeGreaterThan(discoveryCount);

  const discoveryToggle = list.getByRole("checkbox", {
    name: /Discovery Call/,
  });
  await discoveryToggle.click();
  await expect(discoveryToggle).not.toBeChecked();
  await expect(monthDiscovery).toHaveCount(0);
  // The other calendars' chips stay.
  await expect(monthChips.first()).toBeVisible();

  // Every view: the calendar stays hidden across a view change, and the week
  // (fetched fresh for its own range) has no Discovery Call rows either. The
  // week is still the placeholder's per-calendar list until P7-T06.
  const weekDiscovery = page
    .getByRole("list", { name: "Appointments in view" })
    .getByRole("listitem")
    .filter({ hasText: "Discovery Call" });
  await viewButton(page, "Week").click();
  await expect(page).toHaveURL(/\/calendars\?view=week&date=2026-09-08$/);
  await expectViewLoaded(page, "Week");
  await expect(discoveryToggle).not.toBeChecked();
  await expect(weekDiscovery).toHaveCount(0);

  // Showing it again brings its rows back, in this view and the month.
  await discoveryToggle.click();
  await expect(discoveryToggle).toBeChecked();
  await expect(weekDiscovery).toHaveCount(1);

  await viewButton(page, "Month").click();
  await expectViewLoaded(page, "Month");
  await expect(monthDiscovery).toHaveCount(discoveryCount);
});

test("stepping months keeps the grid on screen", async ({ page, gotoApp }) => {
  await gotoApp("/calendars?view=month&date=2026-09-08");
  await expectPosition(page, "Month", "September 2026");
  await expectViewLoaded(page, "Month");

  // Records, at every DOM change from here on, whether a skeleton appeared,
  // the month grid left the page, or the grid was marked busy.
  await page.evaluate(() => {
    const flags = { sawSkeleton: false, lostGrid: false, sawBusy: false };
    const check = () => {
      if (document.querySelector('[data-slot="skeleton"]')) {
        flags.sawSkeleton = true;
      }
      const grid = document.querySelector('section[aria-label="Month view"]');
      if (!grid) flags.lostGrid = true;
      else if (grid.getAttribute("aria-busy") === "true") flags.sawBusy = true;
    };
    new MutationObserver(check).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
    });
    Object.assign(window, { __gridWatch: flags });
  });

  await page.getByRole("button", { name: "Next month" }).click();
  await expectPosition(page, "Month", "October 2026");
  await expectViewLoaded(page, "Month");
  // October's grid, not September's: 31 October is only in the new one, and
  // 30 August only in the old.
  const grid = viewRegion(page, "Month");
  await expect(
    grid.getByRole("group", {
      name: "Saturday, October 31, 2026",
      exact: true,
    }),
  ).toBeVisible();
  await expect(grid.locator('[data-day="2026-08-30"]')).toHaveCount(0);

  const flags = await page.evaluate(
    () => (window as unknown as { __gridWatch: unknown }).__gridWatch,
  );
  // sawBusy proves a loading phase really happened (the API's simulated
  // latency); through it, the grid never left and no skeleton showed.
  expect(flags).toEqual({ sawBusy: true, sawSkeleton: false, lostGrid: false });
});

test.describe("Today on today adds no history entry", () => {
  test("on a canonical URL", async ({ page, gotoApp }) => {
    await gotoApp("/calendars?view=month&date=2026-09-08");
    await expectPosition(page, "Month", "September 2026");
    const length = () => page.evaluate(() => history.length);
    const before = await length();

    // The handler runs synchronously in the click, so the length is final.
    await page.getByRole("button", { name: "Today", exact: true }).click();
    await expect(page).toHaveURL(/\/calendars\?view=month&date=2026-09-08$/);
    expect(await length()).toBe(before);

    await page.getByRole("button", { name: "Next month" }).click();
    await expectPosition(page, "Month", "October 2026");
    expect(await length()).toBe(before + 1);

    // One Back returns to September.
    await page.goBack();
    await expect(page).toHaveURL(/\/calendars\?view=month&date=2026-09-08$/);
    await expectPosition(page, "Month", "September 2026");
  });

  test("on the bare URL, which it makes canonical in place", async ({
    page,
    gotoApp,
  }) => {
    await gotoApp("/calendars");
    await expectPosition(page, "Month", "September 2026");
    const before = await page.evaluate(() => history.length);

    await page.getByRole("button", { name: "Today", exact: true }).click();
    await expect(page).toHaveURL(/\/calendars\?view=month&date=2026-09-08$/);
    expect(await page.evaluate(() => history.length)).toBe(before);
    await expectPosition(page, "Month", "September 2026");
  });
});
