import { beforeEach, describe, expect, it, vi } from "vitest";

import { REF_DATE } from "./seed/rng";
import { freshModules, seededWorld, settle } from "./testing";

// Imported per test, after `seededWorld()`: clock.ts reads `Date.now()` when it
// loads, so a static import would start the demo clock at the real time.
const loadHttp = () => import("@/lib/api/http");

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe("demo clock", () => {
  beforeEach(async () => {
    await seededWorld();
  });

  it("starts at the seed anchor, not the wall clock", async () => {
    // `seededWorld()` pins the wall clock to the anchor itself, so this test
    // moves it a month later: only a clock that reads the anchor still
    // reports 09:00 on the seed date.
    await freshModules(REF_DATE.getTime() + 30 * DAY);
    const { db } = await import("./db");
    const { buildDb } = await import("./seed");
    db.setState(buildDb(), true);

    const { apiNow } = await loadHttp();
    expect(Date.now()).toBe(REF_DATE.getTime() + 30 * DAY);
    expect(apiNow().toISOString()).toBe("2026-09-08T09:00:00.000Z");
  });

  it("nowIso() is strictly increasing within one instant", async () => {
    const { nowIso } = await loadHttp();
    const issued = Array.from({ length: 1000 }, () => nowIso());

    expect(issued[0]).toBe("2026-09-08T09:00:00.000Z");
    expect(issued[1]).toBe("2026-09-08T09:00:00.001Z");
    expect(issued[999]).toBe("2026-09-08T09:00:00.999Z");
    for (let i = 1; i < issued.length; i++) {
      expect(issued[i]! > issued[i - 1]!).toBe(true);
    }
  });

  it("nowIso() follows the clock forward", async () => {
    const { nowIso } = await loadHttp();
    vi.advanceTimersByTime(60_000);
    expect(nowIso()).toBe("2026-09-08T09:01:00.000Z");
  });

  it("never runs backwards when system time does", async () => {
    const { apiNow, nowIso } = await loadHttp();
    const before = nowIso();

    vi.setSystemTime(REF_DATE.getTime() - HOUR);

    const after = nowIso();
    expect(new Date(after).getTime()).toBe(new Date(before).getTime() + 1);
    expect(apiNow().getTime()).toBeGreaterThanOrEqual(
      new Date(after).getTime(),
    );
  });
});

describe("settle()", () => {
  beforeEach(async () => {
    await seededWorld();
  });

  it("advances the fake clock through a fixed-latency call", async () => {
    const { simulate } = await loadHttp();
    await expect(settle(simulate(() => 42, { ms: 700 }))).resolves.toBe(42);
  });

  it("propagates a rejection", async () => {
    const { simulate } = await loadHttp();
    const failing = simulate(() => {
      throw new Error("boom");
    });
    await expect(settle(failing)).rejects.toThrow("boom");
  });

  it("fails loudly instead of hanging on a promise that never settles", async () => {
    await expect(settle(new Promise<never>(() => {}))).rejects.toThrow(
      /still pending/,
    );
  });
});
