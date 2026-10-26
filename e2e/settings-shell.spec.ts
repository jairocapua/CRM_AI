import type { Page } from "@playwright/test";

import { APP_NAME } from "../src/lib/constants";
import { expect, NAVIGATION, test } from "./fixtures";
import { pageHeading, sectionNav } from "./settings-helpers";

/**
 * The settings shell (P9-T02): the `/settings` overview, the section nav
 * beside (or, on a phone, above) every section page, and the placeholder
 * pages of the sections later tasks build. Every link is followed by role
 * and name, and each page is checked by its own `<h1>`.
 */

/** The sections in nav order: link name, path, the page's `<h1>`. */
const SECTIONS = [
  { link: "Profile", path: "/settings/profile", heading: "Profile" },
  { link: "Business", path: "/settings/business", heading: "Business" },
  { link: "Team", path: "/settings/team", heading: "Team settings" },
  {
    link: "Custom fields",
    path: "/settings/custom-fields",
    heading: "Custom fields",
  },
  { link: "Pipelines", path: "/settings/pipelines", heading: "Pipelines" },
  { link: "Tags", path: "/settings/tags", heading: "Tags" },
  { link: "Demo data", path: "/settings/demo-data", heading: "Demo data" },
] as const;

const sidebarLink = (page: Page, name: string) =>
  page
    .locator('[data-slot="sidebar"]')
    .getByRole("link", { name, exact: true });

const pathPattern = (path: string) =>
  new RegExp(`${path.replaceAll("/", "\\/")}$`);

test("/settings lists every section with a line about it, and Demo data opens from there", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings");
  await expect(page).toHaveTitle(`Settings · ${APP_NAME}`);
  await expect(pageHeading(page, "Settings")).toBeVisible();
  // The overview lists the sections itself, so the section nav is not here.
  await expect(sectionNav(page)).toHaveCount(0);

  const overview = page
    .getByRole("main")
    .getByRole("list", { name: "Settings sections" });
  await expect(overview.getByRole("link")).toHaveText(
    SECTIONS.map((s) => s.link),
  );
  await expect(overview.getByRole("listitem").first()).toContainText(
    "Your name, contact details and time zone.",
  );

  await overview.getByRole("link", { name: "Demo data", exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/demo-data$/, NAVIGATION);
  await expect(pageHeading(page, "Demo data")).toBeVisible();
});

test("the section nav marks the current section, keeps Settings lit in the sidebar, and every link opens its page", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/profile");
  const nav = sectionNav(page);
  await expect(nav.getByRole("link")).toHaveText(SECTIONS.map((s) => s.link));

  // Ends on Demo data: it is reachable from the section nav.
  for (const section of [...SECTIONS.slice(1), SECTIONS[0], SECTIONS[6]]) {
    await nav.getByRole("link", { name: section.link, exact: true }).click();
    await expect(page).toHaveURL(pathPattern(section.path), NAVIGATION);
    await expect(pageHeading(page, section.heading)).toBeVisible();

    const current = nav.locator('[aria-current="page"]');
    await expect(current).toHaveCount(1);
    await expect(current).toHaveText(section.link);
    await expect(current).toHaveAttribute("href", section.path);

    await expect(sidebarLink(page, "Settings")).toHaveAttribute(
      "data-active",
      "",
    );
    await expect(sidebarLink(page, "Dashboard")).not.toHaveAttribute(
      "data-active",
    );
  }
});

for (const section of SECTIONS) {
  test(`${section.path} boots with its heading and its nav link marked`, async ({
    page,
    gotoApp,
  }) => {
    await gotoApp(section.path);
    await expect(pageHeading(page, section.heading)).toBeVisible();
    await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0, {
      timeout: 15_000,
    });
    await expect(
      sectionNav(page).getByRole("link", { name: section.link, exact: true }),
    ).toHaveAttribute("aria-current", "page");
  });
}

test.describe("on a phone", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("the section nav is a row above the page, scrolled to the current section", async ({
    page,
    gotoApp,
  }) => {
    await gotoApp("/settings/demo-data");
    const nav = sectionNav(page);
    const current = nav.getByRole("link", { name: "Demo data", exact: true });
    await expect(current).toHaveAttribute("aria-current", "page");
    // The last section only fits on a 375px screen once the row scrolls.
    await expect(current).toBeInViewport({ ratio: 1 });
    await expect(
      nav.getByRole("link", { name: "Profile", exact: true }),
    ).not.toBeInViewport({ ratio: 1 });

    // Above the heading, not beside it.
    const navBox = await nav.boundingBox();
    const headingBox = await pageHeading(page, "Demo data").boundingBox();
    expect(navBox!.y + navBox!.height).toBeLessThanOrEqual(headingBox!.y);
  });
});
