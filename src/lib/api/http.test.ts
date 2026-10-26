import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetTuning, setTuning, simulate } from "./http";

/**
 * How long `simulate()` sleeps. A call may pin its own `ms` (a heavier or a
 * snappier round trip), but a demo slowed on the Demo Data latency slider
 * slows every call, pinned ones included: e2e pending-state checks slow the
 * app that way and need the pending window to last.
 */
describe("simulate() latency", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    resetTuning();
  });

  /**
   * Starts a call at `latencyMs` (no jitter) and checks it is still pending
   * 1ms before `expected` and settled at `expected`.
   */
  async function expectSleep(
    latencyMs: number,
    opts: { ms?: number },
    expected: number,
  ) {
    setTuning({ latencyMs, jitter: 0 });
    let settled = false;
    void simulate(() => undefined, opts).then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(expected - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
  }

  it.each([
    { what: "an unpinned call", opts: {}, expected: 220 },
    { what: "a call pinned above it", opts: { ms: 420 }, expected: 420 },
    { what: "a call pinned below it", opts: { ms: 60 }, expected: 60 },
  ])(
    "at the default latency, $what sleeps $expected ms",
    async ({ opts, expected }) => {
      await expectSleep(220, opts, expected);
    },
  );

  it.each([
    { what: "an unpinned call", opts: {} },
    { what: "a call pinned below the slider", opts: { ms: 420 } },
  ])(
    "on a slowed demo, $what sleeps the slider's latency",
    async ({ opts }) => {
      await expectSleep(3000, opts, 3000);
    },
  );

  it("on a slowed demo, a call pinned above the slider keeps its own ms", async () => {
    await expectSleep(300, { ms: 700 }, 700);
  });

  it("with no latency (unit tests), a pinned call still sleeps its ms", async () => {
    await expectSleep(0, { ms: 400 }, 400);
  });
});
