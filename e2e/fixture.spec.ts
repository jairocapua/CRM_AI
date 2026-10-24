import {
  assertNoPageProblems,
  BOOT_FAILED,
  BOOT_SKELETON,
  expect,
  NAVIGATION,
  test,
  userMenu,
  waitForBoot,
} from "./fixtures";

/**
 * Self-tests for the shared fixture. A watcher that never fires looks exactly
 * like a clean app, so each failure path is provoked on purpose here.
 */

test.describe("console watcher", () => {
  test("records console.error", async ({ page, gotoApp, consoleProblems }) => {
    await gotoApp("/dashboard");
    await page.evaluate(() => console.error("e2e-selftest console"));

    await expect
      .poll(() => consoleProblems.join("\n"))
      .toContain("e2e-selftest console");
    expect(() => assertNoPageProblems(consoleProblems)).toThrow(
      /e2e-selftest console/,
    );

    // Provoked on purpose: empty the list so the teardown check passes.
    consoleProblems.length = 0;
  });

  test("records an uncaught page error", async ({
    page,
    gotoApp,
    consoleProblems,
  }) => {
    await gotoApp("/dashboard");
    // Thrown from a task, so it is uncaught in the page rather than rejected
    // back into `evaluate`. Production hydration errors arrive the same way.
    await page.evaluate(() => {
      setTimeout(() => {
        throw new Error("e2e-selftest pageerror");
      }, 0);
    });

    await expect
      .poll(() => consoleProblems.join("\n"))
      .toContain("pageerror: Error: e2e-selftest pageerror");
    expect(() => assertNoPageProblems(consoleProblems)).toThrow(
      /e2e-selftest pageerror/,
    );

    consoleProblems.length = 0;
  });

  test("records a hydration message at any log level", async ({
    page,
    gotoApp,
    consoleProblems,
  }) => {
    await gotoApp("/dashboard");
    await page.evaluate(() =>
      console.warn("e2e-selftest: a tree hydrated but attributes differ"),
    );

    await expect
      .poll(() => consoleProblems.join("\n"))
      .toContain("console.warning: e2e-selftest: a tree hydrated");
    expect(() => assertNoPageProblems(consoleProblems)).toThrow(
      /e2e-selftest: a tree hydrated/,
    );

    consoleProblems.length = 0;
  });

  test("fails a test that leaves a console error behind", async ({
    page,
    gotoApp,
    consoleProblems,
  }) => {
    // Passes only if the auto fixture's teardown fails this test. Paired with
    // the direct assertions above, since `test.fail()` accepts any failure.
    test.fail(true, "the console watcher must fail this test on teardown");

    await gotoApp("/dashboard");
    await page.evaluate(() => console.error("e2e-selftest leftover"));
    await expect
      .poll(() => consoleProblems.join("\n"))
      .toContain("e2e-selftest leftover");
    // Deliberately not emptied.
  });
});

test.describe("boot wait", () => {
  test("waits while the boot skeleton is up", async ({ page }) => {
    await page.setContent(
      `<div id="boot" aria-busy="true" aria-label="Loading"></div>`,
    );
    await page.evaluate(() => {
      setTimeout(() => document.getElementById("boot")?.remove(), 500);
    });
    await expect(page.locator(BOOT_SKELETON)).toHaveCount(1);

    await waitForBoot(page);

    // A one-shot count, not `toHaveCount(0)`: a retrying assertion would do
    // the waiting itself and pass even if `waitForBoot` returned at once.
    expect(await page.locator(BOOT_SKELETON).count()).toBe(0);
  });

  test("fails on the could-not-start screen", async ({ page }) => {
    await page.setContent(`<main><h2>${BOOT_FAILED}</h2></main>`);

    await expect(waitForBoot(page)).rejects.toThrow(BOOT_FAILED);
  });
});

test.describe("clean storage", () => {
  test("clears leftover storage once and survives a reload within the test", async ({
    page,
    gotoApp,
  }) => {
    await gotoApp("/dashboard");

    // The app seeded and persisted its database on boot (writes are debounced
    // by 250ms, hence the poll).
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("nimbus-crm-db")))
      .not.toBeNull();

    // Stand in for storage left over from before the test: a stale key, and
    // the one-shot flag dropped so the next load counts as a fresh start.
    await page.evaluate(() => {
      localStorage.setItem("e2e-selftest-marker", "stale");
      sessionStorage.removeItem("e2e-storage-cleared");
    });
    await page.reload();
    await waitForBoot(page);

    expect(
      await page.evaluate(() => localStorage.getItem("e2e-selftest-marker")),
    ).toBeNull();

    await page.evaluate(() =>
      localStorage.setItem("e2e-selftest-marker", "kept"),
    );
    await page.reload();
    await waitForBoot(page);

    // The clean-storage script is one-shot: a reload keeps the test's data.
    expect(
      await page.evaluate(() => localStorage.getItem("e2e-selftest-marker")),
    ).toBe("kept");
  });
});

test.describe("navigation timeout", () => {
  test("NAVIGATION is frozen at 15s", () => {
    // Read only, never written: were it not frozen, a write here would leak
    // into every later test in this worker.
    expect(Object.isFrozen(NAVIGATION)).toBe(true);
    expect(NAVIGATION).toEqual({ timeout: 15_000 });
  });
});

test.describe("user menu", () => {
  test("userMenu finds exactly one visible trigger", async ({
    page,
    gotoApp,
  }) => {
    await gotoApp("/dashboard");

    // Exactly one: a renamed user, or a second element with the same name,
    // fails here rather than deep inside a navigation test.
    await expect(userMenu(page)).toHaveCount(1);
    await expect(userMenu(page)).toBeVisible();
  });
});
