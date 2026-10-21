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

type Outcome<T> = { ok: true; value: T } | { ok: false; error: unknown };

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

  for (let i = 0; i < maxTimers && !outcome; i++) {
    await vi.advanceTimersToNextTimerAsync();
  }
  // The last timer's continuation can need a few more microtask hops.
  for (let i = 0; i < 10 && !outcome; i++) await Promise.resolve();

  // Assigned inside the callbacks, which TypeScript's narrowing cannot see.
  const result = outcome as Outcome<T> | null;
  if (!result) {
    throw new Error(
      `settle(): the promise was still pending after ${maxTimers} timers`,
    );
  }
  if (!result.ok) throw result.error;
  return result.value;
}
