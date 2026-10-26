import type { Locator, Page } from "@playwright/test";

import { expect } from "./fixtures";

/**
 * Every app route, shared by the phone pass (e2e/responsive.spec.ts) and the
 * accessibility pass (e2e/a11y.spec.ts). Detail routes are reached through
 * the first matching link of their list, because seeded ids are nanoids that
 * change on every seed.
 */

/** Waits until every skeleton in the page is gone. */
export async function waitForContent(page: Page) {
  await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0, {
    timeout: 15_000,
  });
}

/** The first link in `<main>` whose href matches `pattern`. Seeded ids are
 *  nanoids that change on every seed, so detail routes are read from their
 *  list in the same test. */
export async function firstHref(page: Page, pattern: RegExp): Promise<string> {
  let href: string | undefined;
  await expect
    .poll(
      async () => {
        href = await page.evaluate(
          (source) =>
            [...document.querySelectorAll("main a[href]")]
              .map((a) => a.getAttribute("href") ?? "")
              .find((h) => new RegExp(source).test(h)),
          pattern.source,
        );
        return href;
      },
      { message: `no link matching ${pattern} in the list`, timeout: 15_000 },
    )
    .toBeTruthy();
  return href as string;
}

export interface RouteCase {
  /** Test title. */
  name: string;
  /** A fixed path, or a list to read the first detail link from. */
  path: string | { list: string; href: RegExp };
  /** The screen's main action: its page header's primary control. Screens
   *  with no action (dashboard, read-only automation detail, settings index)
   *  name their first primary control instead. */
  action: (main: Locator) => Locator;
}

export const ROUTES: readonly RouteCase[] = [
  {
    name: "dashboard",
    path: "/dashboard",
    action: (m) => m.getByRole("button", { name: "30d", exact: true }),
  },
  {
    name: "contacts",
    path: "/contacts",
    action: (m) => m.getByRole("button", { name: "Add contact", exact: true }),
  },
  {
    name: "contact detail",
    path: { list: "/contacts", href: /^\/contacts\/con_/ },
    action: (m) => m.getByRole("button", { name: "Message", exact: true }),
  },
  {
    name: "conversations",
    path: "/conversations",
    action: (m) => m.getByRole("button", { name: "New", exact: true }),
  },
  {
    name: "conversation thread",
    path: { list: "/conversations", href: /^\/conversations\/conv_/ },
    action: (m) => m.getByRole("button", { name: "Send", exact: true }),
  },
  {
    name: "opportunities",
    path: "/opportunities",
    action: (m) => m.getByRole("button", { name: "New deal", exact: true }),
  },
  {
    name: "opportunity detail",
    path: { list: "/opportunities", href: /^\/opportunities\/opp_/ },
    action: (m) => m.getByRole("button", { name: "Edit", exact: true }),
  },
  {
    name: "calendars",
    path: "/calendars",
    action: (m) => m.getByRole("button", { name: "Book", exact: true }),
  },
  {
    name: "calendars availability",
    path: "/calendars/availability",
    action: (m) =>
      m.getByRole("button", { name: "Save availability", exact: true }),
  },
  {
    name: "automation",
    path: "/automation",
    action: (m) =>
      m.getByRole("link", { name: "Request an automation", exact: true }),
  },
  {
    name: "automation detail",
    path: { list: "/automation", href: /^\/automation\/(?!requests)[^/]+$/ },
    action: (m) => m.getByRole("link", { name: "Automation", exact: true }),
  },
  {
    name: "automation requests",
    path: "/automation/requests",
    action: (m) => m.getByRole("button", { name: "Send request", exact: true }),
  },
  {
    name: "settings",
    path: "/settings",
    action: (m) => m.getByRole("link", { name: "Profile", exact: true }),
  },
  {
    name: "settings profile",
    path: "/settings/profile",
    action: (m) => m.getByRole("button", { name: "Save changes", exact: true }),
  },
  {
    name: "settings business",
    path: "/settings/business",
    action: (m) => m.getByRole("button", { name: "Save changes", exact: true }),
  },
  {
    name: "settings team",
    path: "/settings/team",
    action: (m) =>
      m.getByRole("button", { name: "Invite teammate", exact: true }),
  },
  {
    name: "settings pipelines",
    path: "/settings/pipelines",
    action: (m) => m.getByRole("button", { name: "New pipeline", exact: true }),
  },
  {
    name: "settings custom fields",
    path: "/settings/custom-fields",
    action: (m) => m.getByRole("button", { name: "Add field", exact: true }),
  },
  {
    name: "settings tags",
    path: "/settings/tags",
    action: (m) => m.getByRole("button", { name: "New tag", exact: true }),
  },
  {
    name: "settings demo data",
    path: "/settings/demo-data",
    action: (m) =>
      m.getByRole("button", { name: "Reseed workspace", exact: true }),
  },
];

/** Navigates to `route`; a detail route first opens its list and follows the
 *  first matching link's href. Returns the path it landed on. */
export async function gotoRoute(
  page: Page,
  gotoApp: (path: string) => Promise<void>,
  route: RouteCase,
): Promise<string> {
  let path: string;
  if (typeof route.path === "string") {
    path = route.path;
  } else {
    await gotoApp(route.path.list);
    path = await firstHref(page, route.path.href);
  }
  await gotoApp(path);
  return path;
}
