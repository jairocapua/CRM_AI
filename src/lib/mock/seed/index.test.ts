import { describe, expect, it, vi } from "vitest";

import { freshModules } from "../testing";

const ANCHOR = "2026-09-08T09:00:00.000Z";
const OFFENDERS_MESSAGE = "Seed wrote timestamps after seededAt:";

/**
 * `seedDatabase()` runs `assertNothingAfterAnchor` outside production and
 * reports offenders through `console.error`. NODE_ENV is stubbed so the check
 * always runs, whatever the shell sets.
 */
async function seedWithErrorSpy() {
  vi.stubEnv("NODE_ENV", "development");
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const { seedDatabase } = await import("./index");
  return { state: seedDatabase(), error };
}

describe("seedDatabase", () => {
  it("writes nothing that has already happened after seededAt", async () => {
    await freshModules();
    const { state, error } = await seedWithErrorSpy();

    expect(error).not.toHaveBeenCalled();
    expect(state.seededAt).toBe(ANCHOR);
    expect(Object.keys(state.contacts)).toHaveLength(240);
  });

  it("reports offenders when a seeder dates the past after the anchor", async () => {
    // Negative control: if `refPast` were plain `refPlusDays` again, day-0 and
    // future offsets would land after the anchor, and the check must say so.
    await freshModules();
    vi.doMock("./rng", async (importOriginal) => {
      const rng = await importOriginal<typeof import("./rng")>();
      return { ...rng, refPast: rng.refPlusDays };
    });
    try {
      const { error } = await seedWithErrorSpy();
      expect(error).toHaveBeenCalledWith(
        OFFENDERS_MESSAGE,
        expect.objectContaining({ "tasks.updatedAt": expect.any(Number) }),
      );
    } finally {
      vi.doUnmock("./rng");
    }
  });
});
