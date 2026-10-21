// Relative imports: Playwright resolves these in Node, outside the Next
// bundler. nav.ts pulls in only lucide-react's CommonJS build, and constants.ts
// has nothing but type imports besides.
import { APP_NAME } from "../src/lib/constants";
import { NAV_ITEMS } from "../src/lib/nav";
import { expect, test } from "./fixtures";

/**
 * Visits every route in the navigation and checks it boots, renders its data
 * and stays quiet in the console (the shared fixture fails the test on any
 * console error, page error or hydration message). Built from `NAV_ITEMS`, so
 * a new nav entry is covered without touching this file.
 */

test("/ redirects to /dashboard", async ({ page, gotoApp }) => {
  await gotoApp("/");
  await expect(page).toHaveURL(/\/dashboard$/);
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
  });
}
