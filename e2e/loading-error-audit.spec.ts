import type { Locator, Page } from "@playwright/test";

import {
  armRecordFault,
  chooseContactIn,
  DB_KEY,
  failReads,
  failRecordRead,
  loadErrorAlert,
  readContacts,
  readDeals,
  readTagNames,
  restoreReads,
  restoreRecordRead,
  uniquelyNamedContact,
  type FaultTable,
} from "./calendar-helpers";
import { expect, NAVIGATION, test } from "./fixtures";
import { failEveryMutation, openSection } from "./settings-helpers";

/**
 * The loading and error audit (P10-T02), one describe per module. Each
 * module proves, on its primary read and one representative mutation:
 *
 * (a) a read fault shows the module's `LoadError` (exact title, the fault's
 *     "Something went wrong.", a Retry button); once the fault is off, Retry
 *     brings the data back and moves focus into the loaded region, not
 *     `<body>`;
 * (b) a Retry that fails again says so in the sr-only status line
 *     ("Still could not load after 2 tries."), since the alert's own text
 *     does not change;
 * (c) at 2,000 ms latency (the Demo Data slider) a skeleton shows before the
 *     content, then the content replaces it;
 * (d) a background refetch after a successful mutation at that latency
 *     keeps the content on screen: an in-page recorder proves no skeleton
 *     was ever inserted and the rows never emptied;
 * (e) at a 100% failure rate (the second slider) the mutation shows the
 *     ApiError's message ("Network request failed. Please try again."),
 *     keeps what was typed and stores nothing.
 *
 * Reads keep `canFail: false` (DECISIONS P6, P7-T13), so the failure slider
 * only fails mutations; read errors come from the e2e faults in
 * calendar-helpers.ts (`failReads`, `armRecordFault`). Both sliders live in
 * memory, and the faults in the current document, so every test reaches the
 * page under test by links, never `goto` or a reload.
 *
 * Calendars: e2e/calendars-load-errors.spec.ts already proves the calendars
 * page's load errors, Retry busy state and the booking dialog's; this spec
 * adds only its focus after Retry, the "still could not load" line and the
 * latency skeleton.
 */

const FAULT_MESSAGE = "Something went wrong.";
const NETWORK_FAILURE = "Network request failed. Please try again.";
const STILL_FAILING = "Still could not load after 2 tries.";
const SKELETON = '[data-slot="skeleton"]';
/** A refetch at 2,000 ms latency (±25% jitter) lands well inside this. */
const SLOW = { timeout: 15_000 };

const main = (page: Page) => page.getByRole("main");
const sidebarLink = (page: Page, name: string) =>
  page
    .locator('[data-slot="sidebar"]')
    .getByRole("link", { name, exact: true });
const pageHeading = (page: Page) =>
  main(page).getByRole("heading", { level: 1 }).first();
const toast = (page: Page, text: string) =>
  page.locator("[data-sonner-toast]").filter({ hasText: text });
const stillFailing = (page: Page) =>
  page.getByRole("status").filter({ hasText: STILL_FAILING });
/** Every LoadError on the page (Next's route announcer is role=alert too). */
const loadErrors = (page: Page) => main(page).locator('[data-slot="alert"]');

/** Opens a module by its sidebar link. */
async function openByLink(page: Page, name: string, path: RegExp) {
  await sidebarLink(page, name).click();
  await expect(page).toHaveURL(path, NAVIGATION);
}

/**
 * Asserts `title`'s LoadError with the fault's message, then (b) presses its
 * Retry by keyboard with the fault still on and waits for the "still could
 * not load" line, and (a) ends the fault, presses Retry again and returns.
 * The caller checks the content and the focus.
 */
async function retryThroughFault(
  page: Page,
  title: string,
  restore: () => Promise<void>,
) {
  const alert = loadErrorAlert(page, title);
  await expect(alert).toBeVisible(NAVIGATION);
  await expect(alert).toContainText(FAULT_MESSAGE);
  const retry = alert.getByRole("button", { name: "Retry", exact: true });
  await expect(retry).toBeVisible();
  await expect(stillFailing(page)).toHaveCount(0);

  await retry.press("Enter");
  await expect(stillFailing(page)).toHaveCount(1);
  await expect(alert).toBeVisible();
  await expect(retry).toBeFocused();

  await restore();
  await retry.press("Enter");
  await expect(alert).toHaveCount(0);
}

/** Sets the Demo Data latency slider to 2,000 ms. Call on /settings/demo-data. */
async function slowTo2000(page: Page) {
  const latency = page.getByRole("slider").nth(0);
  await latency.focus();
  await latency.press("Home");
  for (let i = 0; i < 40; i += 1) await latency.press("ArrowRight");
  await expect(main(page).getByText("2000 ms", { exact: true })).toBeVisible();
}

/** Opens Demo Data, slows every call to 2,000 ms, and returns. */
async function gotoSlowApp(
  page: Page,
  gotoApp: (path: string) => Promise<void>,
) {
  await gotoApp("/settings/demo-data");
  await slowTo2000(page);
}

/** (c): a skeleton shows in `main`, then `content` replaces it. */
async function expectSkeletonThen(page: Page, content: Locator) {
  await expect(main(page).locator(SKELETON).first()).toBeVisible(NAVIGATION);
  await expect(content).toBeVisible(SLOW);
  await expect(main(page).locator(SKELETON)).toHaveCount(0, SLOW);
}

interface RefetchLog {
  /** Skeletons inserted into `main` since the recorder started. */
  skeletons: number;
  /** The fewest `watch` matches seen at any DOM change. */
  minWatched: number;
}

/**
 * (d): records, from now on, every skeleton inserted into `main` and the
 * fewest elements matching `watch` (CSS) at any DOM change: a polling
 * assertion would miss a skeleton or a blank list that lasts one frame
 * (LEARNINGS P8-T09).
 */
async function recordRefetch(page: Page, watch: string) {
  await page.evaluate((watch) => {
    const root = document.querySelector("main");
    if (!root) throw new Error("no main");
    const log: RefetchLog = {
      skeletons: 0,
      minWatched: document.querySelectorAll(watch).length,
    };
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (
            node instanceof Element &&
            (node.matches('[data-slot="skeleton"]') ||
              node.querySelector('[data-slot="skeleton"]'))
          ) {
            log.skeletons += 1;
          }
        }
      }
      log.minWatched = Math.min(
        log.minWatched,
        document.querySelectorAll(watch).length,
      );
    }).observe(root, { subtree: true, childList: true });
    Object.assign(window, { __refetchLog: log });
  }, watch);
  return () =>
    page.evaluate(
      () => (window as unknown as { __refetchLog: RefetchLog }).__refetchLog,
    );
}

/** One store table as persisted, read past the UI and the API. */
async function storedTable<T>(page: Page, table: string): Promise<T[]> {
  const read = () => page.evaluate((key) => localStorage.getItem(key), DB_KEY);
  await expect.poll(read).not.toBeNull();
  const state = (
    JSON.parse((await read()) ?? "null") as {
      state: Record<string, Record<string, T>>;
    }
  ).state;
  return Object.values(state[table] ?? {});
}

/** Loads a page, then faults `tables` and opens `module` by its link. */
async function openWithFault(
  page: Page,
  gotoApp: (path: string) => Promise<void>,
  from: string,
  tables: [FaultTable, ...FaultTable[]],
  module: string,
  path: RegExp,
) {
  await gotoApp(from);
  await expect(pageHeading(page)).toBeVisible();
  await failReads(page, ...tables);
  await openByLink(page, module, path);
}

test.describe("Dashboard", () => {
  const card = (page: Page, name: string) =>
    main(page).getByRole("region", { name, exact: true });
  const dueToday = (page: Page) => card(page, "Due today");
  const taskBoxes = (page: Page) =>
    dueToday(page).getByRole("checkbox", { name: /^Complete "/ });

  test("one card's failed read shows only in that card; Retry focuses it", async ({
    page,
    gotoApp,
  }) => {
    await openWithFault(
      page,
      gotoApp,
      "/contacts",
      ["tasks"],
      "Dashboard",
      /\/dashboard$/,
    );

    const alert = loadErrorAlert(page, "Could not load tasks");
    await expect(dueToday(page).getByRole("alert")).toHaveCount(1, NAVIGATION);
    await expect(alert).toBeVisible();
    // The other cards render their data: one fault, one card.
    await expect(loadErrors(page)).toHaveCount(1);
    for (const name of [
      "Upcoming appointments",
      "Deals by stage",
      "Lead sources",
    ]) {
      await expect(card(page, name).getByRole("listitem").first()).toBeVisible(
        SLOW,
      );
    }
    await expect(
      card(page, "Recent activity").getByRole("link").first(),
    ).toBeVisible();
    await expect(
      main(page).getByText("New contacts", { exact: true }),
    ).toBeVisible();
    await expect(main(page).locator(SKELETON)).toHaveCount(0);

    await retryThroughFault(page, "Could not load tasks", () =>
      restoreReads(page),
    );
    await expect(taskBoxes(page).first()).toBeVisible();
    await expect(dueToday(page)).toBeFocused();
  });

  test("the summary's failed read is one alert in place of the figures", async ({
    page,
    gotoApp,
  }) => {
    // Analytics reads the deals; so does the pipeline card, which shows its
    // own alert: two independent reads, two cards.
    await openWithFault(
      page,
      gotoApp,
      "/contacts",
      ["opportunities"],
      "Dashboard",
      /\/dashboard$/,
    );
    const figures = main(page).getByRole("region", { name: "Key figures" });
    await expect(
      figures
        .getByRole("alert")
        .filter({ hasText: "Could not load the summary" }),
    ).toBeVisible(NAVIGATION);
    await expect(
      main(page).getByText("New contacts", { exact: true }),
    ).toHaveCount(0);
    await expect(
      card(page, "Won revenue").getByText(
        "Shows once the summary above loads.",
      ),
    ).toBeVisible();
    await expect(card(page, "Won revenue").getByRole("alert")).toHaveCount(0);
    await expect(
      loadErrorAlert(page, "Could not load the pipeline"),
    ).toBeVisible();
    await expect(dueToday(page).getByRole("alert")).toHaveCount(0);

    await restoreReads(page);
    await figures.getByRole("button", { name: "Retry" }).press("Enter");
    await expect(
      main(page).getByText("New contacts", { exact: true }),
    ).toBeVisible();
    await expect(figures).toBeFocused();
  });

  test("at 2000 ms latency the cards show skeletons, then their data", async ({
    page,
    gotoApp,
  }) => {
    await gotoSlowApp(page, gotoApp);
    await openByLink(page, "Dashboard", /\/dashboard$/);
    await expectSkeletonThen(page, taskBoxes(page).first());
  });

  test("completing a task refetches without a skeleton or an empty list", async ({
    page,
    gotoApp,
  }) => {
    await gotoSlowApp(page, gotoApp);
    await openByLink(page, "Dashboard", /\/dashboard$/);
    await expect(taskBoxes(page).first()).toBeVisible(SLOW);
    await expect(main(page).locator(SKELETON)).toHaveCount(0, SLOW);
    const before = await taskBoxes(page).count();
    const label = await taskBoxes(page).first().getAttribute("aria-label");
    // Seeded titles repeat, so count the boxes with this one's name.
    const same = dueToday(page).getByRole("checkbox", {
      name: label ?? "",
      exact: true,
    });
    const sameBefore = await same.count();

    const log = await recordRefetch(
      page,
      'main [role="checkbox"][aria-label^="Complete"]',
    );
    await taskBoxes(page).first().click();
    await expect(toast(page, "Task completed")).toBeVisible(SLOW);
    // The refetch landed: the completed task left the list.
    await expect(same).toHaveCount(sameBefore - 1, SLOW);

    const seen = await log();
    expect(seen.skeletons).toBe(0);
    expect(seen.minWatched).toBeGreaterThanOrEqual(before - 1);
  });

  test("a task that fails to complete says why, unticks and stores nothing", async ({
    page,
    gotoApp,
  }) => {
    await gotoApp("/settings/demo-data");
    await failEveryMutation(page);
    await openByLink(page, "Dashboard", /\/dashboard$/);
    const box = taskBoxes(page).first();
    await expect(box).toBeVisible(SLOW);
    const title = /^Complete "(.*)"$/.exec(
      (await box.getAttribute("aria-label")) ?? "",
    )?.[1];

    await box.click();
    await expect(toast(page, NETWORK_FAILURE)).toBeVisible();
    await expect(box).not.toBeChecked();
    await expect(toast(page, "Task completed")).toHaveCount(0);
    const stored = await storedTable<{ title: string; completedAt?: string }>(
      page,
      "tasks",
    );
    const task = stored.find((t) => t.title === title);
    expect(task).toBeDefined();
    expect(task?.completedAt).toBeUndefined();
  });
});

test.describe("Conversations", () => {
  const inboxList = (page: Page) =>
    main(page).getByRole("list", { name: "Conversations", exact: true });
  const threadPane = (page: Page) =>
    main(page).getByRole("region", { name: /^Conversation with / });
  const INBOX_ERROR = "Could not load conversations";
  const THREAD_ERROR = "Could not load the conversation";
  const THREAD_NOTE = "Use Retry in the inbox to load this conversation.";
  const PANEL_NOTE = "Contact details show once the conversation loads.";

  /** The inbox's thread ids, top first, once the list has loaded. */
  async function threadIds(page: Page): Promise<string[]> {
    await expect(inboxList(page).getByRole("link").first()).toBeVisible(SLOW);
    const hrefs = await inboxList(page)
      .getByRole("link")
      .evaluateAll((links) => links.map((a) => a.getAttribute("href") ?? ""));
    return hrefs.map((href) => href.replace("/conversations/", ""));
  }

  /** Opens a thread by its row in the inbox and waits for it. */
  async function openThread(page: Page, id: string) {
    await inboxList(page).locator(`a[href="/conversations/${id}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/conversations/${id}$`));
    await expect(threadPane(page)).toBeVisible(SLOW);
  }

  test("a failed inbox read is the page's one alert; Retry restores the list and the thread", async ({
    page,
    gotoApp,
  }) => {
    await gotoApp("/conversations");
    const [id] = await threadIds(page);
    if (!id) throw new Error("No conversations");
    await openThread(page, id);

    // A dead conversations endpoint fails the list and the thread alike:
    // `failReads` fails the list, `armRecordFault` the thread's by-key read.
    // Switching tabs re-reads the list, which arms the record fault.
    await armRecordFault(page, id);
    await main(page).getByRole("tab", { name: "All", exact: true }).click();
    await failRecordRead(page);
    await failReads(page, "conversations");
    await openByLink(page, "Dashboard", /\/dashboard$/);
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/conversations/${id}$`));

    await expect(loadErrorAlert(page, INBOX_ERROR)).toBeVisible(NAVIGATION);
    await expect(main(page).getByText(THREAD_NOTE)).toBeVisible();
    await expect(main(page).getByText(PANEL_NOTE)).toBeVisible();
    await expect(loadErrors(page)).toHaveCount(1);

    await retryThroughFault(page, INBOX_ERROR, async () => {
      await restoreReads(page);
      await restoreRecordRead(page);
    });
    await expect(inboxList(page).getByRole("link").first()).toBeVisible();
    await expect(threadPane(page)).toBeVisible();
    await expect(main(page).getByText(THREAD_NOTE)).toHaveCount(0);
    await expect(
      main(page).getByRole("link", { name: "View contact" }),
    ).toBeVisible();
    await expect(inboxList(page)).toBeFocused();
  });

  test("a failed thread read shows in the thread pane only; Retry focuses the thread", async ({
    page,
    gotoApp,
  }) => {
    await gotoApp("/conversations");
    const [, id] = await threadIds(page);
    if (!id) throw new Error("Fewer than two conversations");
    await armRecordFault(page, id);
    await main(page).getByRole("tab", { name: "All", exact: true }).click();
    await failRecordRead(page);
    await inboxList(page).locator(`a[href="/conversations/${id}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/conversations/${id}$`));

    await expect(loadErrorAlert(page, THREAD_ERROR)).toBeVisible(NAVIGATION);
    await expect(main(page).getByText(PANEL_NOTE)).toBeVisible();
    await expect(loadErrors(page)).toHaveCount(1);
    await expect(inboxList(page).getByRole("link").first()).toBeVisible();

    await retryThroughFault(page, THREAD_ERROR, () => restoreRecordRead(page));
    await expect(threadPane(page)).toBeFocused();
  });

  test("a failed contact-panel card shows in that card only", async ({
    page,
    gotoApp,
  }) => {
    await gotoApp("/conversations");
    const ids = await threadIds(page);
    await failReads(page, "opportunities");
    // The first thread whose contact panel loads its deals card.
    if (!ids[0]) throw new Error("No conversations");
    await openThread(page, ids[0]);
    await expect(loadErrorAlert(page, "Could not load open deals")).toBeVisible(
      SLOW,
    );
    await expect(loadErrors(page)).toHaveCount(1);
    await expect(threadPane(page)).toBeVisible();
  });

  test("at 2000 ms latency the inbox shows a skeleton, then the list", async ({
    page,
    gotoApp,
  }) => {
    await gotoSlowApp(page, gotoApp);
    await openByLink(page, "Conversations", /\/conversations$/);
    await expectSkeletonThen(page, inboxList(page).getByRole("link").first());
  });

  test("starring refetches the inbox and thread without a skeleton", async ({
    page,
    gotoApp,
  }) => {
    await gotoSlowApp(page, gotoApp);
    await openByLink(page, "Conversations", /\/conversations$/);
    const ids = await threadIds(page);
    const stored = await storedTable<{ id: string; isStarred: boolean }>(
      page,
      "conversations",
    );
    const id = ids.find(
      (i) => stored.find((c) => c.id === i)?.isStarred === false,
    );
    if (!id) throw new Error("No unstarred conversation");
    await openThread(page, id);
    await expect(main(page).locator(SKELETON)).toHaveCount(0, SLOW);
    const rows = await inboxList(page).getByRole("link").count();

    const log = await recordRefetch(
      page,
      'main [aria-label="Conversations"] a',
    );
    await threadPane(page)
      .getByRole("button", { name: "Star", exact: true })
      .click();
    await expect(
      threadPane(page).getByRole("button", { name: "Unstar", exact: true }),
    ).toBeVisible(SLOW);
    // The inbox refetch landed too: the row shows the star.
    await expect(
      inboxList(page)
        .locator(`a[href="/conversations/${id}"]`)
        .getByLabel("Starred"),
    ).toBeVisible(SLOW);

    const seen = await log();
    expect(seen.skeletons).toBe(0);
    expect(seen.minWatched).toBe(rows);
  });

  test("a star that fails says why and stores nothing", async ({
    page,
    gotoApp,
  }) => {
    await gotoApp("/settings/demo-data");
    await failEveryMutation(page);
    await openByLink(page, "Conversations", /\/conversations$/);
    const ids = await threadIds(page);
    const stored = await storedTable<{ id: string; isStarred: boolean }>(
      page,
      "conversations",
    );
    const id = ids.find(
      (i) => stored.find((c) => c.id === i)?.isStarred === false,
    );
    if (!id) throw new Error("No unstarred conversation");
    await openThread(page, id);

    await threadPane(page)
      .getByRole("button", { name: "Star", exact: true })
      .click();
    await expect(toast(page, NETWORK_FAILURE)).toBeVisible();
    await expect(
      threadPane(page).getByRole("button", { name: "Star", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
    const after = await storedTable<{ id: string; isStarred: boolean }>(
      page,
      "conversations",
    );
    expect(after.find((c) => c.id === id)?.isStarred).toBe(false);
  });
});

test.describe("Contacts", () => {
  const table = (page: Page) => main(page).getByRole("table");
  const rows = (page: Page) => table(page).locator("tbody tr");
  const sheet = (page: Page) =>
    page.getByRole("dialog", { name: "Add contact" });

  async function fillNewContact(page: Page, first: string, last: string) {
    await main(page)
      .getByRole("button", { name: "Add contact", exact: true })
      .click();
    await sheet(page).getByLabel("First name", { exact: true }).fill(first);
    await sheet(page).getByLabel("Last name", { exact: true }).fill(last);
  }

  test("a failed list read shows one alert; Retry restores the rows and focuses the heading", async ({
    page,
    gotoApp,
  }) => {
    await openWithFault(
      page,
      gotoApp,
      "/dashboard",
      ["contacts"],
      "Contacts",
      /\/contacts$/,
    );
    await expect(loadErrorAlert(page, "Could not load contacts")).toBeVisible(
      NAVIGATION,
    );
    // The tag counts read the contacts too; their alert waits (P7-T47).
    await expect(loadErrors(page)).toHaveCount(1);
    await retryThroughFault(page, "Could not load contacts", () =>
      restoreReads(page),
    );
    await expect(rows(page).first()).toBeVisible();
    await expect(pageHeading(page)).toHaveText("Contacts");
    await expect(pageHeading(page)).toBeFocused();
  });

  test("at 2000 ms latency the table shows a skeleton, then rows", async ({
    page,
    gotoApp,
  }) => {
    await gotoSlowApp(page, gotoApp);
    await openByLink(page, "Contacts", /\/contacts$/);
    await expectSkeletonThen(page, rows(page).first());
  });

  test("adding a contact refetches the list without a skeleton", async ({
    page,
    gotoApp,
  }) => {
    await gotoSlowApp(page, gotoApp);
    await openByLink(page, "Contacts", /\/contacts$/);
    await expect(rows(page).first()).toBeVisible(SLOW);
    await expect(main(page).locator(SKELETON)).toHaveCount(0, SLOW);
    const log = await recordRefetch(page, "main table tbody tr");

    await fillNewContact(page, "Audit", "Refetch");
    await sheet(page).getByRole("button", { name: "Add contact" }).click();
    await expect(toast(page, "Audit Refetch added")).toBeVisible(SLOW);
    await expect(sheet(page)).toBeHidden();
    await expect(table(page)).not.toHaveAttribute("aria-busy", "true", SLOW);
    // Give the list's refetch time to land before reading the log.
    await expect
      .poll(
        async () =>
          (await storedTable<{ lastName: string }>(page, "contacts")).some(
            (c) => c.lastName === "Refetch",
          ),
        SLOW,
      )
      .toBe(true);
    await page.waitForTimeout(3_000);

    const seen = await log();
    expect(seen.skeletons).toBe(0);
    expect(seen.minWatched).toBeGreaterThan(0);
  });

  test("a contact that fails to save says why, keeps the sheet and stores nothing", async ({
    page,
    gotoApp,
  }) => {
    await gotoApp("/settings/demo-data");
    await failEveryMutation(page);
    await openByLink(page, "Contacts", /\/contacts$/);
    await expect(rows(page).first()).toBeVisible(SLOW);

    await fillNewContact(page, "Audit", "Failure");
    await sheet(page).getByRole("button", { name: "Add contact" }).click();
    await expect(toast(page, NETWORK_FAILURE)).toBeVisible();
    await expect(sheet(page)).toBeVisible();
    await expect(
      sheet(page).getByLabel("First name", { exact: true }),
    ).toHaveValue("Audit");
    await expect(
      sheet(page).getByLabel("Last name", { exact: true }),
    ).toHaveValue("Failure");
    expect(
      (await readContacts(page)).some((c) => c.lastName === "Failure"),
    ).toBe(false);
  });

  test("at 2000 ms latency, names typed before the custom fields load are kept", async ({
    page,
    gotoApp,
  }) => {
    await gotoSlowApp(page, gotoApp);
    await openByLink(page, "Contacts", /\/contacts$/);
    await expect(rows(page).first()).toBeVisible(SLOW);

    // Typed while the sheet's custom fields read is still in flight.
    await fillNewContact(page, "Typed", "Early");
    await expect(
      sheet(page).getByText("Custom fields", { exact: true }),
    ).toBeVisible(SLOW);
    await expect(
      sheet(page).getByLabel("First name", { exact: true }),
    ).toHaveValue("Typed");
    await expect(
      sheet(page).getByLabel("Last name", { exact: true }),
    ).toHaveValue("Early");

    // Closed and opened again, the form starts empty.
    await page.keyboard.press("Escape");
    await expect(sheet(page)).toBeHidden();
    await main(page)
      .getByRole("button", { name: "Add contact", exact: true })
      .click();
    await expect(
      sheet(page).getByLabel("First name", { exact: true }),
    ).toHaveValue("");
  });

  test("a delete that fails says why and keeps the dialog open with focus on Delete", async ({
    page,
    gotoApp,
  }) => {
    await gotoApp("/settings/demo-data");
    await failEveryMutation(page, { slow: true });
    await openByLink(page, "Contacts", /\/contacts$/);
    const row = rows(page).first();
    await expect(row).toBeVisible(SLOW);
    const id = (
      await row.locator('a[href^="/contacts/"]').first().getAttribute("href")
    )?.replace("/contacts/", "");
    if (!id) throw new Error("The first row has no contact link");

    await row.getByRole("checkbox", { name: "Select row" }).click();
    await main(page)
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    const confirm = dialog.getByRole("button", {
      name: /^(Delete|Deleting…)$/,
    });
    await confirm.click();
    await expect(confirm).toHaveText("Deleting…");

    await expect(toast(page, NETWORK_FAILURE)).toBeVisible(SLOW);
    // Asserted after the toast: a dialog closing on confirm would be gone.
    await expect(dialog).toBeVisible();
    await expect(confirm).toHaveText("Delete");
    await expect(confirm).toBeFocused();
    expect((await readContacts(page)).some((c) => c.id === id)).toBe(true);
  });

  test.describe("contact page panels", () => {
    interface StoredTask {
      contactId?: string;
      title: string;
    }
    interface StoredDeal {
      contactId: string;
      name: string;
      status: string;
    }

    test("a failed tasks read shows in the Tasks tab only; Retry restores the list", async ({
      page,
      gotoApp,
    }) => {
      await gotoApp("/contacts");
      const task = (await storedTable<StoredTask>(page, "tasks")).find(
        (t) => t.contactId,
      );
      if (!task?.contactId) throw new Error("No task with a contact");
      await gotoApp(`/contacts/${task.contactId}`);
      const tab = main(page).getByRole("tab", { name: "Tasks", exact: true });
      await expect(tab).toBeVisible(NAVIGATION);

      // Base UI mounts a tab's panel only when it is active, so the read
      // runs on the click, after the fault is on.
      await failReads(page, "tasks");
      await tab.click();
      const panel = main(page).getByRole("tabpanel");
      await expect(
        panel.getByRole("alert").filter({ hasText: "Could not load tasks" }),
      ).toBeVisible();
      await expect(loadErrors(page)).toHaveCount(1);
      await expect(panel.getByText("No tasks yet.")).toHaveCount(0);

      await retryThroughFault(page, "Could not load tasks", () =>
        restoreReads(page),
      );
      await expect(
        panel.getByText(task.title, { exact: true }).first(),
      ).toBeVisible();
    });

    test("a failed deals read shows in the opportunities panel only; Retry restores it", async ({
      page,
      gotoApp,
    }) => {
      await gotoApp("/contacts");
      const deal = (await storedTable<StoredDeal>(page, "opportunities")).find(
        (d) => d.status === "open",
      );
      if (!deal) throw new Error("No open deal");
      const contact = (await readContacts(page)).find(
        (c) => c.id === deal.contactId,
      );
      if (!contact) throw new Error("The deal has no contact");

      // The panel reads on mount, so the fault goes on before the page
      // opens, by its link in the filtered list.
      await expect(rows(page).first()).toBeVisible(SLOW);
      await failReads(page, "opportunities");
      await main(page)
        .getByRole("textbox", { name: "Search contacts" })
        .fill(contact.name);
      await main(page).locator(`a[href="/contacts/${contact.id}"]`).click();
      await expect(page).toHaveURL(
        new RegExp(`/contacts/${contact.id}$`),
        NAVIGATION,
      );

      await expect(
        loadErrorAlert(page, "Could not load opportunities"),
      ).toBeVisible(NAVIGATION);
      await expect(loadErrors(page)).toHaveCount(1);
      await expect(main(page).getByText("No open deals yet.")).toHaveCount(0);
      // The tabs below still load their own reads.
      await expect(
        main(page).getByRole("tab", { name: "Activity", exact: true }),
      ).toBeVisible();

      await retryThroughFault(page, "Could not load opportunities", () =>
        restoreReads(page),
      );
      await expect(
        main(page).getByText(deal.name, { exact: true }).first(),
      ).toBeVisible();
    });
  });
});

test.describe("Opportunities", () => {
  const stage = (page: Page) =>
    main(page)
      .getByRole("region", { name: / stage$/ })
      .first();
  const DEAL_CARDS = 'main [aria-roledescription="sortable"]';
  const dealSheet = (page: Page) =>
    page.getByRole("dialog", { name: "New deal" });

  async function fillNewDeal(page: Page, name: string) {
    const contact = uniquelyNamedContact(await readContacts(page));
    await main(page)
      .getByRole("button", { name: "New deal", exact: true })
      .click();
    const dialog = dealSheet(page);
    await expect(
      dialog.getByRole("combobox", { name: "Pipeline" }),
    ).toContainText("Sales Pipeline", SLOW);
    await dialog.getByLabel("Deal name", { exact: true }).fill(name);
    await chooseContactIn(
      page,
      dialog.getByRole("combobox", { name: "Contact" }),
      contact,
    );
    return dialog;
  }

  test("a failed board read shows its alert, not an empty board; Retry focuses the heading", async ({
    page,
    gotoApp,
  }) => {
    await openWithFault(
      page,
      gotoApp,
      "/contacts",
      ["opportunities"],
      "Opportunities",
      /\/opportunities$/,
    );
    await expect(loadErrorAlert(page, "Could not load deals")).toBeVisible(
      NAVIGATION,
    );
    await expect(loadErrors(page)).toHaveCount(1);
    await expect(main(page).getByText(/live deals ·/)).toHaveCount(0);
    await retryThroughFault(page, "Could not load deals", () =>
      restoreReads(page),
    );
    await expect(main(page).getByText(/live deals ·/)).toBeVisible();
    await expect(pageHeading(page)).toHaveText("Opportunities");
    await expect(pageHeading(page)).toBeFocused();
  });

  test("a failed pipelines read shows its alert, not a skeleton; Retry renders the board", async ({
    page,
    gotoApp,
  }) => {
    await openWithFault(
      page,
      gotoApp,
      "/contacts",
      ["pipelines"],
      "Opportunities",
      /\/opportunities$/,
    );
    await expect(loadErrorAlert(page, "Could not load pipelines")).toBeVisible(
      NAVIGATION,
    );
    await expect(loadErrors(page)).toHaveCount(1);
    await expect(main(page).locator(SKELETON)).toHaveCount(0);
    await expect(main(page).getByText(/live deals ·/)).toHaveCount(0);

    await retryThroughFault(page, "Could not load pipelines", () =>
      restoreReads(page),
    );
    await expect(main(page).getByText(/live deals ·/)).toBeVisible();
    await expect(stage(page)).toBeVisible();
    await expect(pageHeading(page)).toHaveText("Opportunities");
    await expect(pageHeading(page)).toBeFocused();
  });

  test("a deal delete that fails says why and keeps the dialog open with focus on Delete", async ({
    page,
    gotoApp,
  }) => {
    await gotoApp("/settings/demo-data");
    await failEveryMutation(page, { slow: true });
    await openByLink(page, "Opportunities", /\/opportunities$/);
    const card = main(page).locator('a[href^="/opportunities/"]').first();
    await expect(card).toBeVisible(SLOW);
    const id = (await card.getAttribute("href"))?.replace(
      "/opportunities/",
      "",
    );
    if (!id) throw new Error("No deal card link");
    await card.click();
    await expect(page).toHaveURL(new RegExp(`/opportunities/${id}$`));

    await main(page)
      .getByRole("button", { name: "Delete", exact: true })
      .click(SLOW);
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    const confirm = dialog.getByRole("button", {
      name: /^(Delete|Deleting…)$/,
    });
    await confirm.click();
    await expect(confirm).toHaveText("Deleting…");

    await expect(toast(page, NETWORK_FAILURE)).toBeVisible(SLOW);
    // Asserted after the toast: a dialog closing on confirm would be gone.
    await expect(dialog).toBeVisible();
    await expect(confirm).toHaveText("Delete");
    await expect(confirm).toBeFocused();
    expect((await readDeals(page)).some((d) => d.id === id)).toBe(true);
  });

  test("at 2000 ms latency the board shows a skeleton, then deals", async ({
    page,
    gotoApp,
  }) => {
    await gotoSlowApp(page, gotoApp);
    await openByLink(page, "Opportunities", /\/opportunities$/);
    await expectSkeletonThen(page, main(page).getByText(/live deals ·/));
    await expect(stage(page)).toBeVisible();
  });

  test("creating a deal refetches the board without a skeleton", async ({
    page,
    gotoApp,
  }) => {
    await gotoSlowApp(page, gotoApp);
    await openByLink(page, "Opportunities", /\/opportunities$/);
    await expect(main(page).getByText(/live deals ·/)).toBeVisible(SLOW);
    await expect(main(page).locator(SKELETON)).toHaveCount(0, SLOW);
    const name = `Audit refetch ${Date.now()}`;
    const dialog = await fillNewDeal(page, name);

    const before = await page.locator(DEAL_CARDS).count();
    const log = await recordRefetch(page, DEAL_CARDS);
    await dialog.getByRole("button", { name: "Create deal" }).click();
    await expect(toast(page, "Deal created")).toBeVisible(SLOW);
    await expect(main(page).getByText(name)).toBeVisible(SLOW);

    const seen = await log();
    expect(seen.skeletons).toBe(0);
    expect(seen.minWatched).toBeGreaterThanOrEqual(before);
  });

  test("a deal that fails to save says why, keeps the sheet and stores nothing", async ({
    page,
    gotoApp,
  }) => {
    await gotoApp("/settings/demo-data");
    await failEveryMutation(page);
    await openByLink(page, "Opportunities", /\/opportunities$/);
    await expect(main(page).getByText(/live deals ·/)).toBeVisible(SLOW);
    const name = `Audit failure ${Date.now()}`;
    const dialog = await fillNewDeal(page, name);

    await dialog.getByRole("button", { name: "Create deal" }).click();
    await expect(toast(page, NETWORK_FAILURE)).toBeVisible();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Deal name", { exact: true })).toHaveValue(
      name,
    );
    expect((await readDeals(page)).some((d) => d.name === name)).toBe(false);
  });
});

test.describe("Automation", () => {
  const requestList = (page: Page) =>
    main(page).getByRole("list", { name: "Requests", exact: true });
  const requestForm = (page: Page) =>
    page.getByRole("form", { name: "New request", exact: true });

  async function openRequests(page: Page) {
    await openByLink(page, "Automation", /\/automation$/);
    await main(page)
      .getByRole("link", { name: "Request an automation", exact: true })
      .click();
    await expect(page).toHaveURL(/\/automation\/requests$/, NAVIGATION);
  }

  async function fillRequest(page: Page, title: string) {
    const form = requestForm(page);
    await form.getByLabel("Title", { exact: true }).fill(title);
    await form
      .getByLabel("What goes wrong today?", { exact: true })
      .fill("Owners hear about big wins days later.");
    await form
      .getByLabel("What should start it?", { exact: true })
      .fill("A deal worth more than $10,000 is marked won.");
    await form
      .getByLabel("What should happen?", { exact: true })
      .fill("Notify the deal's owner.");
  }

  test("a failed requests read shows its alert; Retry restores the list and focuses the heading", async ({
    page,
    gotoApp,
  }) => {
    await gotoApp("/dashboard");
    await expect(pageHeading(page)).toBeVisible();
    await failReads(page, "automationRequests");
    await openRequests(page);
    await expect(loadErrorAlert(page, "Could not load requests")).toBeVisible(
      NAVIGATION,
    );
    await retryThroughFault(page, "Could not load requests", () =>
      restoreReads(page),
    );
    await expect(requestList(page).getByRole("article").first()).toBeVisible();
    await expect(pageHeading(page)).toHaveText("Automation requests");
    await expect(pageHeading(page)).toBeFocused();
  });

  test("at 2000 ms latency the automations list shows a skeleton, then cards", async ({
    page,
    gotoApp,
  }) => {
    await gotoSlowApp(page, gotoApp);
    await openByLink(page, "Automation", /\/automation$/);
    await expectSkeletonThen(page, main(page).getByRole("region").first());
  });

  test("sending a request refetches the list without a skeleton", async ({
    page,
    gotoApp,
  }) => {
    await gotoSlowApp(page, gotoApp);
    await openRequests(page);
    await expect(requestList(page).getByRole("article").first()).toBeVisible(
      SLOW,
    );
    await expect(main(page).locator(SKELETON)).toHaveCount(0, SLOW);
    const before = await requestList(page).getByRole("article").count();
    const title = `Audit refetch ${Date.now()}`;
    await fillRequest(page, title);

    const log = await recordRefetch(page, "main article");
    await requestForm(page)
      .getByRole("button", { name: "Send request" })
      .click();
    await expect(
      requestList(page).getByRole("article", { name: title, exact: true }),
    ).toBeVisible(SLOW);

    const seen = await log();
    expect(seen.skeletons).toBe(0);
    expect(seen.minWatched).toBe(before);
  });

  test("a request that fails to send says why, keeps the form and stores nothing", async ({
    page,
    gotoApp,
  }) => {
    await gotoApp("/settings/demo-data");
    await failEveryMutation(page);
    await openRequests(page);
    const title = `Audit failure ${Date.now()}`;
    await fillRequest(page, title);
    await requestForm(page)
      .getByRole("button", { name: "Send request" })
      .click();
    await expect(
      requestForm(page).getByRole("alert").filter({ hasText: NETWORK_FAILURE }),
    ).toBeVisible();
    await expect(
      requestForm(page).getByLabel("Title", { exact: true }),
    ).toHaveValue(title);
    const stored = await storedTable<{ title: string }>(
      page,
      "automationRequests",
    );
    expect(stored.some((r) => r.title === title)).toBe(false);
  });
});

test.describe("Settings", () => {
  const tagsTable = (page: Page) => main(page).getByRole("table");
  const tagForm = (page: Page) =>
    page.getByRole("form", { name: "New tag", exact: true });

  async function openTags(page: Page) {
    await openSection(page, "Tags", /\/settings\/tags$/);
  }

  test("a failed tags read shows its alert; Retry restores the table and focuses the heading", async ({
    page,
    gotoApp,
  }) => {
    await gotoApp("/settings/profile");
    await expect(pageHeading(page)).toBeVisible();
    await failReads(page, "tags");
    await openTags(page);
    await expect(loadErrorAlert(page, "Could not load the tags")).toBeVisible(
      NAVIGATION,
    );
    await retryThroughFault(page, "Could not load the tags", () =>
      restoreReads(page),
    );
    await expect(tagsTable(page).locator("tbody tr").first()).toBeVisible();
    await expect(pageHeading(page)).toBeFocused();
  });

  test("at 2000 ms latency the tags page shows a skeleton, then the table", async ({
    page,
    gotoApp,
  }) => {
    await gotoSlowApp(page, gotoApp);
    await openTags(page);
    await expectSkeletonThen(page, tagsTable(page).locator("tbody tr").first());
  });

  test("creating a tag refetches the table without a skeleton", async ({
    page,
    gotoApp,
  }) => {
    await gotoSlowApp(page, gotoApp);
    await openTags(page);
    await expect(tagsTable(page).locator("tbody tr").first()).toBeVisible(SLOW);
    await expect(main(page).locator(SKELETON)).toHaveCount(0, SLOW);
    const before = await tagsTable(page).locator("tbody tr").count();
    const log = await recordRefetch(page, "main table tbody tr");

    await main(page)
      .getByRole("button", { name: "New tag", exact: true })
      .click();
    await tagForm(page)
      .getByLabel("Name", { exact: true })
      .fill("Audit Refetch");
    await tagForm(page).getByRole("button", { name: "Create tag" }).click();
    await expect(tagForm(page)).toBeHidden(SLOW);
    await expect(tagsTable(page).locator("tbody tr")).toHaveCount(
      before + 1,
      SLOW,
    );

    const seen = await log();
    expect(seen.skeletons).toBe(0);
    expect(seen.minWatched).toBe(before);
  });

  test("a tag that fails to save says why, keeps the name and stores nothing", async ({
    page,
    gotoApp,
  }) => {
    await gotoApp("/settings/demo-data");
    await failEveryMutation(page);
    await openTags(page);
    await expect(tagsTable(page).locator("tbody tr").first()).toBeVisible(SLOW);
    await main(page)
      .getByRole("button", { name: "New tag", exact: true })
      .click();
    await tagForm(page)
      .getByLabel("Name", { exact: true })
      .fill("Audit Failure");
    await tagForm(page).getByRole("button", { name: "Create tag" }).click();
    await expect(
      tagForm(page).getByRole("alert").filter({ hasText: NETWORK_FAILURE }),
    ).toBeVisible();
    await expect(tagForm(page).getByLabel("Name", { exact: true })).toHaveValue(
      "Audit Failure",
    );
    expect(await readTagNames(page)).not.toContain("Audit Failure");
  });
});

test.describe("Calendars", () => {
  test.use({ timezoneId: "Asia/Singapore", locale: "en-US" });

  test("Retry after a failed appointments read focuses the page heading; a second failure is announced", async ({
    page,
    gotoApp,
  }) => {
    await openWithFault(
      page,
      gotoApp,
      "/contacts",
      ["appointments"],
      "Calendars",
      /\/calendars/,
    );
    await retryThroughFault(page, "Could not load appointments", () =>
      restoreReads(page),
    );
    await expect(
      main(page).getByRole("region", { name: "Month view", exact: true }),
    ).toBeVisible();
    await expect(pageHeading(page)).toHaveText("Calendars");
    await expect(pageHeading(page)).toBeFocused();
  });

  test("at 2000 ms latency the calendar shows a skeleton, then the month", async ({
    page,
    gotoApp,
  }) => {
    await gotoSlowApp(page, gotoApp);
    await openByLink(page, "Calendars", /\/calendars/);
    await expectSkeletonThen(
      page,
      main(page).getByRole("region", { name: "Month view", exact: true }),
    );
  });
});

test.describe("Route error boundary", () => {
  test("a page that throws while rendering shows the error screen inside the shell", async ({
    page,
    gotoApp,
    consoleProblems,
  }) => {
    await gotoApp("/conversations");
    const href = await main(page)
      .getByRole("list", { name: "Conversations", exact: true })
      .getByRole("link")
      .first()
      .getAttribute("href");
    const id = href?.replace("/conversations/", "");
    if (!id) throw new Error("No conversation");
    await storedTable(page, "conversations");

    // Malformed data, not a test switch in the app: the stored thread loses
    // its channel list, which the thread header maps over while rendering.
    await page.addInitScript(
      ({ key, id }) => {
        const raw = localStorage.getItem(key);
        if (!raw) return;
        const db = JSON.parse(raw) as {
          state: { conversations: Record<string, { channels: unknown }> };
        };
        const record = db.state.conversations[id];
        if (!record) return;
        record.channels = null;
        localStorage.setItem(key, JSON.stringify(db));
      },
      { key: DB_KEY, id },
    );
    await gotoApp(`/conversations/${id}`);

    const screen = main(page)
      .getByRole("alert")
      .filter({ hasText: "Something went wrong" });
    await expect(screen).toBeVisible(NAVIGATION);
    await expect(
      screen.getByRole("heading", { level: 1, name: "Something went wrong" }),
    ).toBeVisible();
    await expect(screen).toContainText(
      "This page hit a problem it could not recover from.",
    );
    // A render bug's own text never reaches the screen.
    await expect(screen).not.toContainText("Cannot read");
    await expect(sidebarLink(page, "Dashboard")).toBeVisible();

    // Try again re-renders the page; the data is still malformed.
    await screen.getByRole("button", { name: "Try again" }).click();
    await expect(screen).toBeVisible();

    // The shell's links still work, and the boundary resets on navigation.
    await openByLink(page, "Dashboard", /\/dashboard$/);
    await expect(pageHeading(page)).toHaveText("Dashboard");
    await expect(screen).toHaveCount(0);

    // The thrown render error is logged on purpose.
    expect(consoleProblems.length).toBeGreaterThan(0);
    consoleProblems.length = 0;
  });
});
