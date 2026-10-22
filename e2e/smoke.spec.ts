import type { Page } from "@playwright/test";

// Relative imports: Playwright resolves these in Node, outside the Next
// bundler. nav.ts pulls in only lucide-react's CommonJS build, and constants.ts
// has nothing but type imports besides.
import { APP_NAME } from "../src/lib/constants";
import { NAV_ITEMS } from "../src/lib/nav";
import { expect, test } from "./fixtures";

/**
 * Visits every route in the navigation and checks it boots, renders its own
 * heading, leaves no skeleton behind and stays quiet in the console (the shared
 * fixture fails the test on any console error, page error or hydration
 * message). Built from `NAV_ITEMS`, so a new nav entry is covered without
 * touching this file.
 */

/**
 * The route's page heading. Every nav route titles its page with its nav title
 * in an `<h1>` inside the shell's `<main>` (`SidebarInset`). The heading only
 * appears once `DbGate` has rendered the route on the client, so this fails on
 * a blank page, where the `<title>` and "no skeleton left" checks still pass.
 * A route that renames its heading must keep it equal to its nav title.
 */
function routeHeading(page: Page, title: string) {
  return page
    .getByRole("main")
    .getByRole("heading", { level: 1, name: title, exact: true });
}

test("/ redirects to /dashboard", async ({ page, gotoApp }) => {
  await gotoApp("/");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    routeHeading(page, "Dashboard"),
    '/ rendered no "Dashboard" heading',
  ).toBeVisible();
});

for (const item of NAV_ITEMS) {
  test(`${item.title} (${item.url}) boots and renders cleanly`, async ({
    page,
    gotoApp,
  }) => {
    await gotoApp(item.url);

    // The root layout's title template is `%s · ${APP_NAME}`.
    await expect(page).toHaveTitle(`${item.title} · ${APP_NAME}`);

    // Wait for the screen's own data to finish loading, so errors raised
    // while it renders are caught too. No shell component keeps a skeleton up.
    await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0, {
      timeout: 15_000,
    });

    // The two checks above also pass on a blank page; this one needs the
    // route to have actually rendered.
    await expect(
      routeHeading(page, item.title),
      `${item.url} rendered no "${item.title}" heading`,
    ).toBeVisible();
  });
}
