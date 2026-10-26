import type { Locator, Page } from "@playwright/test";

import { expect, NAVIGATION, test } from "./fixtures";

/**
 * The phone pass (P10-T03): every route at 375×812, the width of the smallest
 * common phone. Each route must render without the page scrolling sideways
 * and with its main action on screen, not clipped off either side. Wide
 * content (the board, data tables) scrolls inside its own box instead.
 */

const WIDTH = 375;

test.use({ viewport: { width: WIDTH, height: 812 } });

/** `<main>` is the shell's `SidebarInset`; the app header sits inside it. */
const main = (page: Page) => page.getByRole("main");

/** The header's sidebar toggle. Scoped to the header: on a phone the Sheet's
 *  rail has the same name. */
const sidebarToggle = (page: Page) =>
  page.locator("header").getByRole("button", { name: "Toggle Sidebar" });

/** The sidebar as a phone shows it: a modal Sheet. */
const mobileSidebar = (page: Page) =>
  page.getByRole("dialog", { name: "Sidebar" });

/** The page's horizontal overflow, measured on both scrolling roots. */
async function pageWidths(page: Page) {
  return page.evaluate(() => ({
    html: {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    },
    body: {
      scrollWidth: document.body.scrollWidth,
      clientWidth: document.body.clientWidth,
    },
  }));
}

/** Fails when the page itself can scroll sideways. */
async function expectNoSidewaysScroll(page: Page, where: string) {
  const { html, body } = await pageWidths(page);
  expect(
    html.scrollWidth,
    `${where}: the page scrolls sideways (html ${html.scrollWidth} > ${html.clientWidth})`,
  ).toBeLessThanOrEqual(html.clientWidth);
  expect(
    body.scrollWidth,
    `${where}: the page scrolls sideways (body ${body.scrollWidth} > ${body.clientWidth})`,
  ).toBeLessThanOrEqual(body.clientWidth);
}

/** Fails unless `locator` is visible and lies within 0..WIDTH horizontally.
 *  Below the fold is fine: the page may scroll down. */
async function expectWithinWidth(locator: Locator, what: string) {
  await expect(locator, `${what} is not visible`).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, `${what} has no box`).not.toBeNull();
  if (!box) return;
  expect(box.x, `${what} starts left of the screen`).toBeGreaterThanOrEqual(0);
  expect(
    box.x + box.width,
    `${what} ends past the right edge (${box.x + box.width} > ${WIDTH})`,
  ).toBeLessThanOrEqual(WIDTH);
}

/** Waits until every skeleton in the page is gone. */
async function waitForContent(page: Page) {
  await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0, {
    timeout: 15_000,
  });
}

/** The first link in `<main>` whose href matches `pattern`. Seeded ids are
 *  nanoids that change on every seed, so detail routes are read from their
 *  list in the same test. */
async function firstHref(page: Page, pattern: RegExp): Promise<string> {
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

interface RouteCase {
  /** Test title. */
  name: string;
  /** A fixed path, or a list to read the first detail link from. */
  path: string | { list: string; href: RegExp };
  /** False for the one screen with no page heading (a conversation thread). */
  heading?: false;
  /** The screen's main action: its page header's primary control. Screens
   *  with no action (dashboard, read-only automation detail, settings index)
   *  name their first primary control instead. */
  action: (main: Locator) => Locator;
}

const ROUTES: readonly RouteCase[] = [
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
    heading: false,
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

for (const route of ROUTES) {
  test(`${route.name} fits a 375px screen with its main action on it`, async ({
    page,
    gotoApp,
  }) => {
    let path: string;
    if (typeof route.path === "string") {
      path = route.path;
    } else {
      await gotoApp(route.path.list);
      path = await firstHref(page, route.path.href);
    }
    await gotoApp(path);

    if (route.heading !== false) {
      await expect(
        main(page).getByRole("heading", { level: 1 }),
        `${path} rendered no page heading`,
      ).toBeVisible(NAVIGATION);
    }
    const action = route.action(main(page));
    await expect(action, `${path}: main action`).toBeVisible(NAVIGATION);
    await waitForContent(page);

    await expectNoSidewaysScroll(page, path);
    await expectWithinWidth(action, `${path}: main action`);
  });
}

test("the sidebar is a sheet that closes once a nav item is picked", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/dashboard");
  await expect(
    main(page).getByRole("heading", { level: 1, name: "Dashboard" }),
  ).toBeVisible();

  // No sidebar on the page itself: no nav link for Contacts anywhere.
  await expect(
    page.getByRole("link", { name: "Contacts", exact: true }),
  ).toHaveCount(0);
  await expect(mobileSidebar(page)).toHaveCount(0);

  await sidebarToggle(page).click();
  const sheet = mobileSidebar(page);
  await expect(sheet).toBeVisible();
  await expectSettledWithinWidth(sheet, "the sidebar sheet");
  await expectNoSidewaysScroll(page, "sidebar open");

  await sheet.getByRole("link", { name: "Contacts", exact: true }).click();
  await expect(page).toHaveURL(/\/contacts$/, NAVIGATION);
  // Closed by the pick itself; while it stays open the page behind it is
  // out of the accessibility tree.
  await expect(mobileSidebar(page), "the sheet stayed open").toHaveCount(0);
  await expect(
    main(page).getByRole("heading", { level: 1, name: "Contacts" }),
  ).toBeVisible(NAVIGATION);
});

test("a phone gets an icon Search button that opens the palette", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/dashboard");
  const search = page
    .locator("header")
    .getByRole("button", { name: "Search", exact: true });
  await expectWithinWidth(search, "the header Search button");

  await search.click();
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await expect(palette).toBeVisible();
  await expect(palette.getByRole("combobox")).toBeFocused();
  await expectWithinWidth(palette, "the command palette");
  await expectNoSidewaysScroll(page, "palette open");

  await page.keyboard.press("Escape");
  await expect(palette).toHaveCount(0);
  await expect(search).toBeFocused();
});

test("the header keeps its controls in one row, centred and apart", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/dashboard");
  const header = page.locator("header");
  const parts = [
    ["Toggle Sidebar", sidebarToggle(page)],
    ["Search", header.getByRole("button", { name: "Search", exact: true })],
    ["Change theme", header.getByRole("button", { name: "Change theme" })],
    ["separator", header.locator('[data-slot="separator"]')],
  ] as const;
  const headerBox = await header.boundingBox();
  expect(headerBox).not.toBeNull();
  if (!headerBox) return;
  const centre = headerBox.y + headerBox.height / 2;

  const boxes: { name: string; x: number; right: number }[] = [];
  for (const [name, locator] of parts) {
    await expectWithinWidth(locator, `the header's ${name}`);
    const box = await locator.boundingBox();
    if (!box) continue;
    expect(
      Math.abs(box.y + box.height / 2 - centre),
      `the header's ${name} is off the header's centre line`,
    ).toBeLessThanOrEqual(2);
    boxes.push({ name, x: box.x, right: box.x + box.width });
  }
  boxes.sort((a, b) => a.x - b.x);
  for (let i = 1; i < boxes.length; i++) {
    const [prev, next] = [boxes[i - 1], boxes[i]];
    if (!prev || !next) continue;
    expect(
      next.x,
      `${next.name} overlaps ${prev.name} in the header`,
    ).toBeGreaterThanOrEqual(prev.right);
  }
});

test("the board scrolls sideways inside itself and snaps to columns", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/opportunities");
  const columns = main(page).getByRole("region", { name: / stage$/ });
  await expect(columns.first()).toBeVisible(NAVIGATION);
  await waitForContent(page);
  const scroller = columns.first().locator("xpath=..");

  const snap = await scroller.evaluate((el) => ({
    type: getComputedStyle(el).scrollSnapType,
    overflowX: getComputedStyle(el).overflowX,
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
    align: [...el.children].map((c) => getComputedStyle(c).scrollSnapAlign),
  }));
  expect(snap.type, "board scroll-snap-type").toMatch(/^x\b/);
  expect(snap.type).toContain("mandatory");
  expect(snap.overflowX).toBe("auto");
  expect(snap.align.length).toBeGreaterThan(1);
  for (const align of snap.align) expect(align).toContain("start");
  expect(
    snap.scrollWidth,
    "the board should be wider than the screen",
  ).toBeGreaterThan(snap.clientWidth);
  await expectNoSidewaysScroll(page, "/opportunities");
  await expectWithinWidth(scroller, "the board scroller");

  // A part-way scroll settles with a column flush at the scroller's left edge.
  await scroller.evaluate((el) => el.scrollBy({ left: 200 }));
  await expect
    .poll(() =>
      scroller.evaluate((el) => {
        const left = el.getBoundingClientRect().left;
        return [...el.children].some(
          (c) =>
            el.scrollLeft > 0 &&
            Math.abs(c.getBoundingClientRect().left - left) <= 1,
        );
      }),
    )
    .toBe(true);
  await expectNoSidewaysScroll(page, "/opportunities after a board scroll");
});

test("the board turns snapping off while a card is dragged", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/opportunities");
  const columns = main(page).getByRole("region", { name: / stage$/ });
  await expect(columns.first()).toBeVisible(NAVIGATION);
  await waitForContent(page);
  const scroller = columns.first().locator("xpath=..");
  const snapType = () =>
    scroller.evaluate((el) => getComputedStyle(el).scrollSnapType);
  await expect.poll(snapType).toContain("mandatory");

  // Mandatory snap would re-snap each small step of dnd-kit's auto-scroll.
  const card = columns.first().locator('a[href^="/opportunities/"]').first();
  const box = await card.boundingBox();
  if (!box) throw new Error("no deal card to drag");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2, {
    steps: 5,
  });
  await expect.poll(snapType).toBe("none");

  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect.poll(snapType).toContain("mandatory");
});

test("the contacts table scrolls sideways inside its card", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/contacts");
  const table = main(page).getByRole("table");
  await expect(table.getByRole("row").nth(1)).toBeVisible(NAVIGATION);
  await waitForContent(page);
  const wrapper = main(page).locator('[data-slot="table-container"]');

  const widths = await wrapper.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));
  expect(
    widths.scrollWidth,
    "the table should be wider than its card",
  ).toBeGreaterThan(widths.clientWidth);
  await expectNoSidewaysScroll(page, "/contacts");
  await expectWithinWidth(wrapper, "the table's card");

  // The last column is reachable by scrolling the card, not the page.
  const lastHeader = table.getByRole("columnheader").last();
  await wrapper.evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
  });
  await expectWithinWidth(lastHeader, "the last column header");
  await expectNoSidewaysScroll(page, "/contacts after a table scroll");
});

test("conversations stack: the inbox, then a full-width thread with a way back", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/conversations");
  const inboxSearch = main(page).getByRole("textbox", {
    name: "Search conversations",
  });
  await expect(inboxSearch).toBeVisible();
  await waitForContent(page);
  await expectNoSidewaysScroll(page, "/conversations");

  const href = await firstHref(page, /^\/conversations\/conv_/);
  await main(page).locator(`a[href="${href}"]`).click();
  await expect(page).toHaveURL(new RegExp(`${href}$`), NAVIGATION);

  // The thread replaces the inbox and takes the full width.
  const composer = main(page).getByRole("textbox", { name: "Message" });
  await expect(composer).toBeVisible(NAVIGATION);
  await expect(inboxSearch).toHaveCount(0);
  const composerBox = await composer.boundingBox();
  expect(composerBox?.width ?? 0).toBeGreaterThan(WIDTH * 0.8);
  await expectWithinWidth(composer, "the composer");
  await expectNoSidewaysScroll(page, href);

  // Contact details sit behind a control, in a sheet that fits the screen.
  await main(page)
    .getByRole("button", { name: "Contact details", exact: true })
    .click();
  const details = page.getByRole("dialog", { name: "Contact details" });
  await expectSettledWithinWidth(details, "the contact details sheet");
  await expectNoSidewaysScroll(page, "contact details open");
  await page.keyboard.press("Escape");
  await expect(details).toHaveCount(0);

  const back = main(page).getByRole("link", { name: "Back to inbox" });
  await expectWithinWidth(back, "Back to inbox");
  await back.click();
  await expect(page).toHaveURL(/\/conversations$/, NAVIGATION);
  await expect(inboxSearch).toBeVisible();
});

/** Waits for a sheet or dialog to finish its enter animation (its box stops
 *  moving), then checks it fits the screen. */
async function expectSettledWithinWidth(dialog: Locator, what: string) {
  await expect(dialog).toBeVisible();
  let last = "";
  await expect
    .poll(async () => {
      const box = await dialog.boundingBox();
      const now = box ? `${Math.round(box.x)},${Math.round(box.width)}` : "";
      const settled = now === last;
      last = now;
      return settled;
    })
    .toBe(true);
  await expectWithinWidth(dialog, what);
  const inner = await dialog.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));
  expect(
    inner.scrollWidth,
    `${what} scrolls sideways inside`,
  ).toBeLessThanOrEqual(inner.clientWidth);
}

for (const sheet of [
  { route: "/contacts", open: "Add contact", dialog: "Add contact" },
  { route: "/opportunities", open: "New deal", dialog: "New deal" },
  { route: "/calendars", open: "Book", dialog: "Book appointment" },
] as const) {
  test(`the ${sheet.dialog} form fits a 375px screen`, async ({
    page,
    gotoApp,
  }) => {
    await gotoApp(sheet.route);
    const open = main(page).getByRole("button", {
      name: sheet.open,
      exact: true,
    });
    await expect(open).toBeVisible(NAVIGATION);
    await waitForContent(page);
    await open.click();
    const dialog = page.getByRole("dialog", { name: sheet.dialog });
    await expectSettledWithinWidth(dialog, `the ${sheet.dialog} form`);
    await expectNoSidewaysScroll(page, `${sheet.dialog} open`);
  });
}
