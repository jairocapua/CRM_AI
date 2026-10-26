import { vi } from "vitest";

import { REF_DATE } from "./seed/rng";

/**
 * Test-only helpers for the mock backend. Nothing in the app imports this file.
 *
 * Import the modules under test dynamically, *after* `freshModules()` or
 * `seededWorld()`:
 *
 *     await seededWorld();
 *     const { summary } = await import("@/lib/api/analytics");
 *
 * `clock.ts` captures `sessionStart = Date.now()` when it loads and keeps
 * `lastIssued` in module state. A module imported statically at the top of a
 * test file loads before any fake clock is installed, so its demo "now" comes
 * out as the seed anchor shifted by the real time elapsed since then, and
 * every "last N days" window is silently wrong. Resetting the module registry
 * and pinning the system time first gives each test a clock that starts
 * exactly at `now`.
 *
 * This file statically imports only `REF_DATE`, which reads no clock.
 *
 * Two more helpers shape the world a test runs in:
 *
 * - `setDemoNow(iso)` moves the demo clock to `iso`. Call it after
 *   `seededWorld()`: `clock.ts` then holds `sessionStart` = the seed anchor,
 *   so moving the fake system clock moves `apiNow()` by the same amount.
 * - `stubLocalStorage()` gives the Node environment a `window.localStorage`
 *   (and the `document` that `db.ts` wires listeners to), so a test can read
 *   what the clock and the store persist. Install it before the first API
 *   call: `clock.ts` reads its high-water mark once and caches the result.
 *   `unstubGlobals` in the Vitest config removes both after each test.
 */

/**
 * A fresh module registry on a fake clock pinned to `now`, with simulated
 * latency, jitter and failures turned off. The store is left empty.
 */
export async function freshModules(now: Date | number = REF_DATE) {
  vi.useRealTimers();
  vi.resetModules();
  vi.useFakeTimers({ now });
  const { setTuning } = await import("@/lib/api/http");
  setTuning({ latencyMs: 0, jitter: 0, failureRate: 0 });
}

/**
 * `freshModules()` plus a freshly seeded store. Ids are faker nanoids that
 * change on every build, so assert on content, never on ids.
 */
export async function seededWorld() {
  await freshModules();
  const { db } = await import("./db");
  const { buildDb } = await import("./seed");
  db.setState(buildDb(), true);
  return { db };
}

/**
 * Moves the demo clock to `iso` (and the fake system clock with it). Only
 * meaningful after `seededWorld()`, and only forwards: the demo clock never
 * runs back past a timestamp it has already issued.
 */
export function setDemoNow(iso: string) {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error(`setDemoNow(): bad instant ${iso}`);
  vi.setSystemTime(ms);
}

const noop = () => {};

/**
 * A Map-backed `window.localStorage`, plus a `document` stub so `db.ts` can
 * wire its flush listeners whether it loads before or after this call.
 * Returns the storage so a test can seed or inspect persisted keys.
 */
export function stubLocalStorage() {
  const items = new Map<string, string>();
  const localStorage = {
    get length() {
      return items.size;
    },
    key: (index: number) => [...items.keys()][index] ?? null,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, String(value));
    },
    removeItem: (key: string) => {
      items.delete(key);
    },
    clear: () => items.clear(),
  };
  vi.stubGlobal("window", {
    localStorage,
    addEventListener: noop,
    removeEventListener: noop,
  });
  vi.stubGlobal("document", {
    visibilityState: "visible",
    addEventListener: noop,
    removeEventListener: noop,
  });
  return localStorage;
}

type Outcome<T> = { ok: true; value: T } | { ok: false; error: unknown };

/** Captured before any test installs fake timers. */
const realSetTimeout = globalThis.setTimeout;
const realNow = Date.now.bind(Date);
const IDLE_WAIT_MS = 5;
/**
 * Real time `settle()` waits, in total, for calls with no timer pending
 * before it gives up. A deadline, not a count: on Windows a 5 ms timer
 * takes 15-30 ms, so a count of waits ran to ~10 s under load.
 */
const IDLE_BUDGET_MS = 1000;

/**
 * Awaits an API call while advancing the fake clock.
 *
 * `simulate()` sleeps on `setTimeout`, and many calls pass a fixed `ms`, so
 * zero latency in the tuning is not enough: the sleep is still a timer. This
 * runs pending timers one at a time until the promise settles, and fails
 * loudly rather than hanging if it never does.
 */
export async function settle<T>(
  promise: Promise<T>,
  maxTimers = 50,
): Promise<T> {
  let outcome: Outcome<T> | null = null;
  promise.then(
    (value) => {
      outcome = { ok: true, value };
    },
    (error: unknown) => {
      outcome = { ok: false, error };
    },
  );

  let deadline: number | null = null;
  for (let i = 0; i < maxTimers && !outcome;) {
    if (vi.getTimerCount() > 0) {
      await vi.advanceTimersToNextTimerAsync();
      i++;
      continue;
    }
    // A continuation can need a few microtask hops before it queues a timer.
    for (let hop = 0; hop < 10 && !outcome; hop++) await Promise.resolve();
    if (outcome || vi.getTimerCount() > 0) continue;
    // No timer to run: the call is on real I/O, such as the seed's lazy
    // `import()` (P10-T06). Fake timers cannot advance that; wait for it.
    deadline ??= realNow() + IDLE_BUDGET_MS;
    if (realNow() > deadline) break;
    await new Promise((resolve) => realSetTimeout(resolve, IDLE_WAIT_MS));
  }
  // The last timer's continuation can need a few more microtask hops.
  for (let i = 0; i < 10 && !outcome; i++) await Promise.resolve();

  // Assigned inside the callbacks, which TypeScript's narrowing cannot see.
  const result = outcome as Outcome<T> | null;
  if (!result) {
    throw new Error(
      `settle(): the promise was still pending after ${maxTimers} timers and ${IDLE_BUDGET_MS} ms of real waiting`,
    );
  }
  if (!result.ok) throw result.error;
  return result.value;
}
