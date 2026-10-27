import type { Locator, Page } from "@playwright/test";

import { expect, NAVIGATION, test } from "./fixtures";
import { gotoRoute, ROUTES, waitForContent } from "./routes";
import { sectionNav } from "./settings-helpers";

/**
 * Keyboard use (P10-T04, spec "P10: tab through with no focus traps"):
 * Tab moves through every module without getting stuck or trapped, the
 * focused control always shows a focus indicator, dialogs opened from the
 * keyboard hand focus back to their trigger, and a few structural checks
 * (the phone sidebar, the thread heading, the settings nav row).
 */

const main = (page: Page) => page.getByRole("main");

/** One Tab stop as the page sees it. */
interface Stop {
  /** A stable id the test stamps on each element it sees focused. */
  id: string;
  /** For the failure message: tag, role and name. */
  desc: string;
  isBody: boolean;
  /** A native date or time input, which Tab walks segment by segment. */
  segmented: boolean;
  inMain: boolean;
  /** A visible focus indicator: an outline or a box-shadow ring. */
  indicator: boolean;
}

/** Reads the focused element, stamping it with an id on first sight. */
async function focusedStop(page: Page): Promise<Stop> {
  return page.evaluate(async () => {
    // Let the browser apply the focus styles first: read straight after a
    // Tab, a date or time input can still compute as unfocused.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    const w = window as unknown as { __focusSeq?: number };
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body || el === document.documentElement) {
      return {
        id: "body",
        desc: "body",
        isBody: true,
        segmented: false,
        inMain: false,
        indicator: true,
      };
    }
    if (!el.dataset.e2eFocusId) {
      w.__focusSeq = (w.__focusSeq ?? 0) + 1;
      el.dataset.e2eFocusId = String(w.__focusSeq);
    }
    const style = getComputedStyle(el);
    const outline =
      style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0;
    const shadow = style.boxShadow !== "none" && style.boxShadow !== "";
    // An input inside an InputGroup or a chips box: the box draws the
    // 3px ring.
    const group = el.closest<HTMLElement>(
      '[data-slot="input-group"], [data-slot="combobox-chips"]',
    );
    const groupRing =
      group !== null &&
      /0px 0px 0px 3px/.test(getComputedStyle(group).boxShadow);
    const name =
      el.getAttribute("aria-label") ??
      el.textContent?.trim().replace(/\s+/g, " ").slice(0, 40) ??
      "";
    const type = el.getAttribute("type");
    return {
      id: el.dataset.e2eFocusId,
      desc: `${el.tagName.toLowerCase()}${type ? `[type=${type}]` : ""}${
        el.getAttribute("role") ? `[role=${el.getAttribute("role")}]` : ""
      } "${name}"`,
      isBody: false,
      // Native date and time inputs take one Tab per segment (hours,
      // minutes, AM/PM) without changing the focused element.
      segmented:
        el instanceof HTMLInputElement &&
        /^(time|date|datetime-local|month|week)$/.test(el.type),
      inMain: el.closest("main") !== null,
      indicator:
        outline ||
        shadow ||
        groupRing ||
        // Focus on a date or time input's picker icon, inside the browser's
        // own shadow tree: the host stops matching :focus and the browser
        // draws its own outline around the icon (checked by eye).
        (el instanceof HTMLInputElement &&
          /^(time|date|datetime-local)$/.test(el.type) &&
          !el.matches(":focus")),
    };
  });
}

const TAB_ROUTES = [
  "dashboard",
  "contacts",
  "contact detail",
  "conversation thread",
  "opportunities",
  "opportunity detail",
  "calendars",
  "calendars availability",
  "automation",
  "automation detail",
  "automation requests",
  "settings profile",
];

const MAX_TABS = 80;

for (const name of TAB_ROUTES) {
  const route = ROUTES.find((r) => r.name === name);
  if (!route) throw new Error(`No route named ${name}`);

  test(`${name}: Tab moves through the page with no trap, Shift+Tab goes back`, async ({
    page,
    gotoApp,
  }) => {
    const path = await gotoRoute(page, gotoApp, route);
    await expect(route.action(main(page))).toBeVisible(NAVIGATION);
    await waitForContent(page);
    // Start from the top of the document.
    await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
      window.scrollTo(0, 0);
    });

    const stops: Stop[] = [];
    const seenInMain = new Set<string>();
    let enteredMain = false;
    let leftMain = false;
    let repeatedInMain = false;
    for (let i = 0; i < MAX_TABS; i++) {
      await page.keyboard.press("Tab");
      const stop = await focusedStop(page);
      const prev = stops.at(-1);
      // A segmented input keeps focus for up to three Tabs (hours, minutes,
      // AM/PM); anything else must move on every press.
      const repeats = stops.slice(-4).filter((s) => s.id === stop.id).length;
      expect(
        !stop.isBody &&
          prev !== undefined &&
          prev.id === stop.id &&
          (!stop.segmented || repeats >= 4),
        `${path}: Tab ${i + 1} left focus on ${stop.desc}\n${stops
          .map((s) => s.desc)
          .join("\n")}`,
      ).toBe(false);
      expect(
        stop.indicator,
        `${path}: ${stop.desc} shows no focus indicator (outline or ring)`,
      ).toBe(true);
      stops.push(stop);
      if (stop.inMain) {
        enteredMain = true;
        if (seenInMain.has(stop.id)) repeatedInMain = true;
        seenInMain.add(stop.id);
      } else if (enteredMain) {
        leftMain = true;
        break;
      }
    }
    const trail = stops.map((s) => s.desc).join("\n");
    expect(enteredMain, `${path}: Tab never reached main\n${trail}`).toBe(true);
    // Not trapped: focus either left main, or kept reaching new controls
    // (a trap cycles through the same few).
    expect(
      leftMain || !repeatedInMain,
      `${path}: focus cycles inside main\n${trail}`,
    ).toBe(true);

    // Shift+Tab walks back over the stops just visited.
    const back = stops.filter((s) => !s.isBody);
    const last = await focusedStop(page);
    await page.keyboard.press("Shift+Tab");
    const previous = await focusedStop(page);
    expect(previous.id, `${path}: Shift+Tab did not move focus`).not.toBe(
      last.id,
    );
    expect(
      back.map((s) => s.id),
      `${path}: Shift+Tab went to ${previous.desc}, not a stop Tab visited`,
    ).toContain(previous.id);
    await page.keyboard.press("Shift+Tab");
    const before = await focusedStop(page);
    expect(before.id, `${path}: a second Shift+Tab did not move`).not.toBe(
      previous.id,
    );
  });
}

/** Focuses `trigger` and presses Enter, as a keyboard user would. */
async function openWithKeyboard(trigger: Locator) {
  await trigger.focus();
  await expect(trigger).toBeFocused();
  await trigger.press("Enter");
}

/** Escape closes `dialog`; focus is back on `trigger`. */
async function escapeReturnsFocus(
  page: Page,
  dialog: Locator,
  trigger: Locator,
) {
  await expect(dialog).toBeVisible();
  // Let the dialog take focus before Escape.
  await expect
    .poll(() => dialog.evaluate((el) => el.contains(document.activeElement)))
    .toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
}

test.describe("dialogs opened from the keyboard return focus", () => {
  for (const sheet of [
    { route: "/contacts", open: "Add contact", dialog: "Add contact" },
    { route: "/opportunities", open: "New deal", dialog: "New deal" },
    { route: "/calendars", open: "Book", dialog: "Book appointment" },
    { route: "/settings/tags", open: "New tag", dialog: "New tag" },
  ] as const) {
    test(`${sheet.dialog}`, async ({ page, gotoApp }) => {
      await gotoApp(sheet.route);
      const trigger = main(page).getByRole("button", {
        name: sheet.open,
        exact: true,
      });
      await expect(trigger).toBeVisible(NAVIGATION);
      await waitForContent(page);
      await openWithKeyboard(trigger);
      await escapeReturnsFocus(
        page,
        page.getByRole("dialog", { name: sheet.dialog }),
        trigger,
      );
    });
  }

  test("a delete confirm dialog", async ({ page, gotoApp }) => {
    const route = ROUTES.find((r) => r.name === "contact detail");
    if (!route) throw new Error("no contact detail route");
    await gotoRoute(page, gotoApp, route);
    const trigger = main(page).getByRole("button", {
      name: "Delete",
      exact: true,
    });
    await expect(trigger).toBeVisible(NAVIGATION);
    await waitForContent(page);
    await openWithKeyboard(trigger);
    await escapeReturnsFocus(page, page.getByRole("alertdialog"), trigger);
  });

  test.describe("on a phone", () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test("the sidebar sheet", async ({ page, gotoApp }) => {
      await gotoApp("/dashboard");
      const trigger = page
        .locator("header")
        .getByRole("button", { name: "Toggle Sidebar" });
      await openWithKeyboard(trigger);
      await escapeReturnsFocus(
        page,
        page.getByRole("dialog", { name: "Sidebar" }),
        trigger,
      );
    });
  });
});

test.describe("sidebar rail", () => {
  test("the desktop sidebar has its rail beside the header toggle", async ({
    page,
    gotoApp,
  }) => {
    await gotoApp("/dashboard");
    await expect(
      page.getByRole("button", { name: "Toggle Sidebar" }),
      "header toggle and rail",
    ).toHaveCount(2);
  });

  test.describe("on a phone", () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test("the sidebar sheet has no second Toggle Sidebar control", async ({
      page,
      gotoApp,
    }) => {
      await gotoApp("/dashboard");
      await page
        .locator("header")
        .getByRole("button", { name: "Toggle Sidebar" })
        .click();
      const sheet = page.getByRole("dialog", { name: "Sidebar" });
      await expect(
        sheet.getByRole("link", { name: "Contacts", exact: true }),
      ).toBeVisible();
      await expect(
        sheet.getByRole("button", { name: "Toggle Sidebar" }),
      ).toHaveCount(0);
      await expect(sheet.locator('[data-sidebar="rail"]')).toHaveCount(0);
    });
  });
});

for (const width of [1440, 375]) {
  test.describe(`at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test("a conversation thread's h1 names the contact", async ({
      page,
      gotoApp,
    }) => {
      const route = ROUTES.find((r) => r.name === "conversation thread");
      if (!route) throw new Error("no thread route");
      await gotoRoute(page, gotoApp, route);
      const region = main(page).getByRole("region", {
        name: /^Conversation with /,
      });
      await expect(region).toBeVisible(NAVIGATION);
      const label = await region.getAttribute("aria-label");
      const contact = label?.replace(/^Conversation with /, "") ?? "";
      expect(contact).not.toBe("");
      await expect(
        region.getByRole("heading", { level: 1, name: contact, exact: true }),
      ).toBeVisible();
    });
  });
}

test.describe("settings nav on a phone", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  /** The scroller and whether the current section lies inside its box. */
  async function navScroll(page: Page) {
    return sectionNav(page)
      .locator("ul")
      .evaluate((list) => {
        const current = list.querySelector('[aria-current="page"]');
        const box = list.getBoundingClientRect();
        const item = current?.getBoundingClientRect();
        return {
          scrollLeft: list.scrollLeft,
          current: current?.textContent?.trim() ?? null,
          inside:
            item !== undefined &&
            item.left >= box.left - 1 &&
            item.right <= box.right + 1,
        };
      });
  }

  test("the row scrolls to the current section, by link and on load", async ({
    page,
    gotoApp,
  }) => {
    await gotoApp("/settings/profile");
    await expect(sectionNav(page)).toBeVisible(NAVIGATION);
    expect((await navScroll(page)).scrollLeft).toBe(0);

    // A dispatched click: Playwright's own click would scroll the link into
    // view first and hide a broken effect.
    await sectionNav(page)
      .getByRole("link", { name: "Demo data", exact: true })
      .dispatchEvent("click");
    await expect(page).toHaveURL(/\/settings\/demo-data$/, NAVIGATION);
    await expect
      .poll(() => navScroll(page))
      .toMatchObject({ current: "Demo data", inside: true });
    expect((await navScroll(page)).scrollLeft).toBeGreaterThan(0);

    await page.reload();
    await expect(sectionNav(page)).toBeVisible(NAVIGATION);
    await expect
      .poll(() => navScroll(page))
      .toMatchObject({ current: "Demo data", inside: true });
    expect((await navScroll(page)).scrollLeft).toBeGreaterThan(0);
  });
});
