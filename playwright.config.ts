import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against a production build on port 3100
 * (`next build && next start`), not against a second `next dev`.
 *
 * Why not `next dev`:
 * - Next 16 takes a lockfile at `.next/dev/lock` for every `next dev`
 *   ("a lockfile mechanism prevents multiple `next dev` or `next build`
 *   instances on the same project", docs/01-app/02-guides/upgrading/
 *   version-16.md). A second dev server in this folder prints "Another next
 *   dev server is already running" and exits, so it would clash with the
 *   owner's `npm run dev` on 3000.
 *
 * Why build + start is safe next to `npm run dev`:
 * - `next dev` writes only to `.next/dev`, and `next build` cleans `.next`
 *   while keeping `cache`, `dev`, `lock` and `trace`
 *   (node_modules/next/dist/build/index.js). `next start` takes no lock. The
 *   e2e server is a separate process on a separate port, so it is also a
 *   separate origin with its own localStorage.
 *
 * The trade-off:
 * - Production React drops dev-only output: key warnings and attribute-level
 *   hydration warnings never reach e2e. Hydration *errors* (React #418/#423/
 *   #425) still arrive, through Next's `onRecoverableError` ->
 *   `window.reportError`, as `pageerror` events that the shared fixture
 *   records. The dev-mode check in the Browser pane remains the backstop.
 *
 * Do not run `npm run check` or `npm run build` while `npm run e2e` is
 * running: they share `.next/lock` and `.next`, so the second build either
 * exits on the lock or deletes the output `next start` is serving.
 *
 * `E2E_REUSE_SERVER=1` reuses a server already on 3100 for quick spec
 * iteration. It may serve a stale build, so it is off by default and the gate
 * always tests freshly built code.
 */
const PORT = 3100;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  // Required: without it Playwright would also collect the Vitest
  // `src/**/*.test.ts` files.
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // Each test gets 60s, twice Playwright's 30s default. Under load (every
  // worker busy, the build just finished, another dev server running) a whole
  // first batch of tests timed out at 30s while a plain rerun passed, and
  // `waitForBoot` (e2e/fixtures.ts) alone may spend 20s of the budget waiting
  // for the app to boot. The two long booking flows also call `test.slow()`.
  // Expect's 5s timeout and the worker count stay at Playwright's defaults
  // (decided in P7-T27). Under the same load, the one kind of wait that ran
  // past 5s was the first one after a client-side navigation to another
  // route, which waits on this server, so those checks pass `NAVIGATION`
  // (e2e/fixtures.ts) instead. Capping the workers would slow every run to fix
  // that one kind of wait.
  timeout: 60_000,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // No storageState: every test gets a fresh, empty browser context.
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Bound to loopback only: the e2e server never needs to be reachable from
    // the network.
    command: `npm run build && npm run start -- -p ${PORT} -H 127.0.0.1`,
    url: `${BASE_URL}/dashboard`,
    reuseExistingServer: process.env.E2E_REUSE_SERVER === "1",
    // A full `next build` on Windows takes one to three minutes.
    timeout: 300_000,
  },
});
