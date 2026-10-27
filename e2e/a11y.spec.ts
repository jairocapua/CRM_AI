import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

import { expect, NAVIGATION, test } from "./fixtures";
import { gotoRoute, ROUTES, waitForContent } from "./routes";

/**
 * The accessibility pass (P10-T04): axe-core on every route, in light and dark
 * mode, plus the main overlays. Serious and critical violations of WCAG 2.0 /
 * 2.1 A and AA fail the test; moderate and minor ones are left to review.
 */

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const FAILING_IMPACTS = new Set(["serious", "critical"]);

type Theme = "light" | "dark";

/** Sets the next-themes choice before any app script runs (its storage key is
 *  the default `theme`), so the page boots in that theme. */
async function useTheme(page: Page, theme: Theme) {
  await page.addInitScript((value) => {
    try {
      localStorage.setItem("theme", value);
    } catch {
      // Opaque origin: nothing to set.
    }
  }, theme);
}

async function expectTheme(page: Page, theme: Theme) {
  const html = page.locator("html");
  if (theme === "dark") await expect(html).toHaveClass(/(^|\s)dark(\s|$)/);
  else await expect(html).not.toHaveClass(/(^|\s)dark(\s|$)/);
}

/** Waits until nothing is loading and every animation has finished, so axe
 *  never measures a half-faded colour. */
async function settle(page: Page) {
  await waitForContent(page);
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, {
    timeout: 15_000,
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document
            .getAnimations()
            .filter(
              (a) =>
                a.playState === "running" &&
                a.effect?.getTiming().iterations !== Infinity,
            ).length,
      ),
    )
    .toBe(0);
}

/** Runs axe and fails with a readable list of serious/critical violations. */
async function expectNoSeriousViolations(page: Page, where: string) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const failing = results.violations.filter((v) =>
    FAILING_IMPACTS.has(v.impact ?? ""),
  );
  const summary = failing
    .map(
      (v) =>
        `- ${v.id} (${v.impact}): ${v.help}\n${v.nodes
          .slice(0, 8)
          .map(
            (n) =>
              `    ${n.target.join(" ")}${n.failureSummary ? `\n      ${n.failureSummary.replace(/\n/g, "\n      ")}` : ""}`,
          )
          .join(
            "\n",
          )}${v.nodes.length > 8 ? `\n    ...and ${v.nodes.length - 8} more` : ""}`,
    )
    .join("\n");
  expect(
    failing.length,
    `${where}: ${failing.length} serious/critical axe violation(s)\n${summary}`,
  ).toBe(0);
}

for (const theme of ["light", "dark"] as const) {
  test.describe(`${theme} mode`, () => {
    for (const route of ROUTES) {
      test(`${route.name} has no serious axe violations`, async ({
        page,
        gotoApp,
      }) => {
        await useTheme(page, theme);
        const path = await gotoRoute(page, gotoApp, route);
        await expectTheme(page, theme);
        await expect(
          route.action(page.getByRole("main")),
          `${path}: main action`,
        ).toBeVisible(NAVIGATION);
        await settle(page);
        await expectNoSeriousViolations(page, `${path} (${theme})`);
      });
    }
  });
}

test.describe("overlays (light mode)", () => {
  test("the command palette", async ({ page, gotoApp }) => {
    await useTheme(page, "light");
    await gotoApp("/dashboard");
    await page
      .locator("header")
      .getByRole("button", { name: /Search/ })
      .first()
      .click();
    const palette = page.getByRole("dialog", { name: "Command palette" });
    await expect(palette).toBeVisible();
    await settle(page);
    await expectNoSeriousViolations(page, "command palette");
  });

  for (const sheet of [
    { route: "/contacts", open: "Add contact", dialog: "Add contact" },
    { route: "/opportunities", open: "New deal", dialog: "New deal" },
    { route: "/calendars", open: "Book", dialog: "Book appointment" },
  ] as const) {
    test(`the ${sheet.dialog} form`, async ({ page, gotoApp }) => {
      await useTheme(page, "light");
      await gotoApp(sheet.route);
      await page
        .getByRole("main")
        .getByRole("button", { name: sheet.open, exact: true })
        .click();
      await expect(
        page.getByRole("dialog", { name: sheet.dialog }),
      ).toBeVisible();
      await settle(page);
      await expectNoSeriousViolations(page, `${sheet.dialog} form`);
    });
  }

  test.describe("on a phone", () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test("the sidebar sheet", async ({ page, gotoApp }) => {
      await useTheme(page, "light");
      await gotoApp("/dashboard");
      await page
        .locator("header")
        .getByRole("button", { name: "Toggle Sidebar" })
        .click();
      const sheet = page.getByRole("dialog", { name: "Sidebar" });
      await expect(sheet).toBeVisible();
      await settle(page);
      await expectNoSeriousViolations(page, "phone sidebar sheet");
    });
  });
});
