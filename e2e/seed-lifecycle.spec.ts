import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/**
 * The seed (and faker with it) is its own chunk since P10-T06: fetched on a
 * boot that finds no seeded workspace (first run, or the first load after a
 * clear) and on reseed, never on a seeded reload. These walk the ways a
 * workspace comes to life on the Demo Data page, and a reseed whose chunk
 * cannot load.
 */

const STORE_KEY = "nimbus-crm-db";

/** Every script URL the page requests while it is on. */
function recordScripts(page: Page) {
  const urls = new Set<string>();
  const listener = (request: { resourceType(): string; url(): string }) => {
    if (request.resourceType() === "script") urls.add(request.url());
  };
  page.on("request", listener);
  return {
    urls,
    stop: () => page.off("request", listener),
  };
}

/** The "contacts" figure in Workspace contents (the number above its label). */
function contactsTile(page: Page) {
  return page
    .getByRole("main")
    .getByText("contacts", { exact: true })
    .locator("xpath=preceding-sibling::div[1]");
}

/** Stored contact ids, read without waiting. */
function readContactIds(page: Page): Promise<string[]> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as {
      state?: { contacts?: Record<string, unknown> };
    };
    return Object.keys(parsed.state?.contacts ?? {});
  }, STORE_KEY);
}

/** Stored contact ids once all 240 are written (the write is debounced). */
async function storedContactIds(page: Page): Promise<string[]> {
  let ids: string[] = [];
  await expect
    .poll(async () => {
      ids = await readContactIds(page);
      return ids.length;
    })
    .toBe(240);
  return ids;
}

/** Reloads and waits for the seeded workspace; returns the scripts fetched. */
async function reloadSeeded(page: Page): Promise<Set<string>> {
  const reload = recordScripts(page);
  await page.reload();
  await expect(contactsTile(page)).toHaveText("240", { timeout: 20_000 });
  reload.stop();
  return reload.urls;
}

test.describe("seed lifecycle", () => {
  test("first run seeds; a reload keeps the data without the seed chunk; reseed fetches it", async ({
    page,
    gotoApp,
  }) => {
    const firstRun = recordScripts(page);
    await gotoApp("/settings/demo-data");
    await expect(contactsTile(page)).toHaveText("240", { timeout: 20_000 });
    firstRun.stop();
    const seededIds = await storedContactIds(page);

    const reloadUrls = await reloadSeeded(page);
    // Same nanoids: the reload rehydrated the store instead of seeding again.
    expect(await storedContactIds(page)).toEqual(seededIds);

    const onReseed = recordScripts(page);
    await page.getByRole("button", { name: "Reseed workspace" }).click();
    await expect(
      page.getByText("Workspace reseeded", { exact: true }),
    ).toBeVisible();
    onReseed.stop();
    await expect(contactsTile(page)).toHaveText("240");

    // The reseed fetched a script the first run loaded and the reload did
    // not: the seed chunk. Other lazy UI chunks can land in the same window
    // (a component chunk did under load), so look for it rather than
    // requiring every request to be it.
    const seedChunks = [...onReseed.urls].filter(
      (url) => firstRun.urls.has(url) && !reloadUrls.has(url),
    );
    expect(
      seedChunks,
      `reseed fetched: ${[...onReseed.urls].join(", ")}`,
    ).not.toEqual([]);

    // A reseed mints new ids.
    await expect
      .poll(
        async () =>
          (await readContactIds(page)).filter((id) => seededIds.includes(id))
            .length,
      )
      .toBe(0);
  });

  test("clearing empties the workspace and the next load seeds it again", async ({
    page,
    gotoApp,
  }) => {
    await gotoApp("/settings/demo-data");
    await expect(contactsTile(page)).toHaveText("240", { timeout: 20_000 });
    const before = await storedContactIds(page);

    await page.getByRole("button", { name: "Clear all data" }).click();
    await expect(
      page.getByText("Workspace cleared", { exact: true }),
    ).toBeVisible();
    await expect(contactsTile(page)).toHaveText("0");

    await reloadSeeded(page);
    // All new ids: the clear was stored, and the reload really seeded.
    const after = await storedContactIds(page);
    expect(after.filter((id) => before.includes(id))).toEqual([]);
  });

  test("a reseed whose seed chunk cannot load says so and keeps the data", async ({
    page,
    gotoApp,
    consoleProblems,
  }) => {
    await gotoApp("/settings/demo-data");
    await expect(contactsTile(page)).toHaveText("240", { timeout: 20_000 });
    const reloadUrls = await reloadSeeded(page);
    const before = await storedContactIds(page);

    // Offline for everything this page has not loaded yet: the seed chunk.
    await page.route("**/_next/static/chunks/**", (route) =>
      reloadUrls.has(route.request().url()) ? route.continue() : route.abort(),
    );
    const reseed = page.getByRole("button", { name: "Reseed workspace" });
    await reseed.click();
    await expect(
      page.getByText(
        "Could not load the demo data. Check your connection and try again.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(reseed).toBeEnabled();
    await expect(page.getByText("Workspace reseeded")).toHaveCount(0);
    await expect(contactsTile(page)).toHaveText("240");
    expect(await readContactIds(page)).toEqual(before);

    // Provoked on purpose: the aborted chunk requests log load failures.
    const unexpected = consoleProblems.filter(
      (problem) => !/_next\/static\/chunks\//.test(problem),
    );
    consoleProblems.length = 0;
    consoleProblems.push(...unexpected);
  });
});
