import { describe, expect, it } from "vitest";

import type { Conversation } from "@/types";
import { seededWorld, settle } from "@/lib/mock/testing";

/**
 * The thread header's flag writes (P10-T05 folded `setStarred` and
 * `setArchived` into one setter; these pin the behaviour both had).
 */

async function world() {
  const { db } = await seededWorld();
  const conversations = await import("./conversations");
  const cache = await import("./cache");
  const first = (): Conversation =>
    Object.values(db.getState().conversations)[0]!;
  return { db, conversations, cache, first };
}

describe.each([
  ["setStarred", "isStarred"],
  ["setArchived", "isArchived"],
] as const)("%s", (fn, flag) => {
  it(`sets ${flag} both ways and nothing else`, async () => {
    const { db, conversations, first } = await world();
    const before = first();
    const others = { ...db.getState().conversations };
    delete others[before.id];

    await settle(conversations[fn](before.id, !before[flag]));
    expect(db.getState().conversations[before.id]).toEqual({
      ...before,
      [flag]: !before[flag],
    });

    await settle(conversations[fn](before.id, before[flag]));
    expect(db.getState().conversations[before.id]).toEqual(before);

    const after = { ...db.getState().conversations };
    delete after[before.id];
    expect(after).toEqual(others);
  });

  it("writes nothing for an unknown id", async () => {
    const { db, conversations } = await world();
    const before = db.getState();
    await settle(conversations[fn]("cnv_gone", true));
    expect(db.getState()).toEqual(before);
  });

  it("invalidates conversations", async () => {
    const { conversations, cache, first } = await world();
    const revision = cache.revisionOf("conversations");
    await settle(conversations[fn](first().id, true));
    expect(cache.revisionOf("conversations")).toBe(revision + 1);
  });
});
