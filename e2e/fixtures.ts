import { test as base, expect, type Page } from "@playwright/test";

/**
 * Shared e2e fixtures. Specs import `test` and `expect` from here, never from
 * `@playwright/test`, so every test gets:
 *
 * - a clean localStorage, so every test sees the same seed;
 * - a console watcher that fails the test on any console error, uncaught page
 *   error or hydration message;
 * - `gotoApp(path)`, which navigates and waits for the app to boot.
 *
 * It also exports `NAVIGATION`, the expect timeout for the first wait after a
 * client-side navigation to another route.
 *
 * These apply to the `page` fixture only: a tab opened with
 * `context.newPage()` gets neither the storage clearing nor the console
 * watcher.
 */

/** `AppBootSkeleton` (src/components/common/app-boot-skeleton.tsx). The
 *  `aria-busy` part matters: `Spinner` also uses `aria-label="Loading"`. */
export const BOOT_SKELETON = '[aria-busy="true"][aria-label="Loading"]';

/** The error screen `DbGate` (src/components/providers/db-gate.tsx) shows when
 *  the mock database fails to start. */
export const BOOT_FAILED = "Could not start the demo workspace";

/**
 * Expect options for the first wait after a client-side navigation to another
 * route: a link, a list row or a sidebar link. Pass it to that wait, e.g.
 * `await expect(page).toHaveURL(/\/dashboard$/, NAVIGATION)`.
 *
 * Such a navigation fetches the new route from the `next start` server, and
 * under a full e2e run (every worker busy) that took 4-6s, past expect's 5s
 * default (LEARNINGS P7-T15, P7-T16, P7-T20).
 *
 * A URL change within the same route needs no server and keeps the default:
 * the calendars' view and date, and the availability editor's `?calendar=`,
 * both go through `history.pushState`/`replaceState`. Checks that the URL did
 * not change keep the 5s default too. Decided in P7-T27, instead of capping
 * the worker count.
 *
 * Frozen, so no spec can change it for the others.
 */
export const NAVIGATION: Readonly<{ timeout: number }> = Object.freeze({
  timeout: 15_000,
});

/**
 * Waits until the boot skeleton is gone, then fails if the app landed on the
 * "could not start" screen instead of the real shell.
 */
export async function waitForBoot(page: Page): Promise<void> {
  await expect(
    page.locator(BOOT_SKELETON),
    "the app never finished booting",
  ).toHaveCount(0, { timeout: 20_000 });

  // Checked once, right now. `toHaveCount(0, { timeout: 0 })` would not do:
  // in Playwright a zero timeout means "wait forever".
  if ((await page.getByText(BOOT_FAILED).count()) > 0) {
    throw new Error(
      `The app showed "${BOOT_FAILED}" instead of booting. See the console problems attached to this test.`,
    );
  }
}

/** Throws one error that lists every recorded console problem. */
export function assertNoPageProblems(problems: readonly string[]): void {
  if (problems.length === 0) return;
  throw new Error(
    `The page reported ${problems.length} console problem(s):\n\n${problems
      .map((problem, i) => `${i + 1}. ${problem}`)
      .join("\n\n")}`,
  );
}

interface AppFixtures {
  /**
   * Every console error, hydration message and uncaught page error seen so
   * far. Checked automatically after each test; a self-test that provokes a
   * problem on purpose empties it before the test ends.
   */
  consoleProblems: string[];
  /** `page.goto(path)`, then `waitForBoot`. */
  gotoApp: (path: string) => Promise<void>;
}

export const test = base.extend<AppFixtures>({
  page: async ({ page }, use) => {
    // Clears localStorage once per test, before any app script runs. The keys
    // that matter are `nimbus-crm-db` (src/lib/mock/db.ts) and
    // `nimbus-crm-clock` (src/lib/mock/clock.ts); they are named here rather
    // than imported because the API-seam lint rule bars `@/lib/mock`.
    //
    // Playwright already gives each test a fresh browser context, so this is a
    // guard against a future `storageState` or reused context. The
    // sessionStorage flag makes it one-shot per tab, so a reload inside a test
    // keeps the data that test created.
    await page.addInitScript(() => {
      // about:blank and other opaque origins throw a SecurityError on any
      // storage access.
      if (!location.protocol.startsWith("http")) return;
      try {
        const FLAG = "e2e-storage-cleared";
        if (sessionStorage.getItem(FLAG)) return;
        localStorage.clear();
        sessionStorage.setItem(FLAG, "1");
      } catch {
        // Storage blocked: nothing to clear.
      }
    });
    await use(page);
  },

  consoleProblems: [
    async ({ page }, use, testInfo) => {
      const problems: string[] = [];

      page.on("console", (message) => {
        const type = message.type();
        const text = message.text();
        if (type !== "error" && !/hydrat/i.test(text)) return;
        const { url, lineNumber } = message.location();
        const where = url ? ` (${url}:${lineNumber})` : "";
        problems.push(`console.${type}: ${text}${where}`);
      });

      // Uncaught errors, unhandled rejections and `window.reportError` — which
      // is how production React's hydration errors arrive.
      page.on("pageerror", (error) => {
        problems.push(`pageerror: ${error.stack ?? error.message}`);
      });

      await use(problems);

      if (problems.length > 0) {
        await testInfo.attach("console-problems", {
          body: problems.join("\n\n"),
          contentType: "text/plain",
        });
      }
      assertNoPageProblems(problems);
    },
    { auto: true },
  ],

  gotoApp: async ({ page }, use) => {
    await use(async (path) => {
      await page.goto(path);
      await waitForBoot(page);
    });
  },
});

export { expect };
