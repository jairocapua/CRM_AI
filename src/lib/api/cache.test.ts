import { describe, expect, it, vi } from "vitest";

import type { ResourceKey } from "./cache";

/**
 * Every resource key. Typed as a Record so adding a key to the union without
 * adding it here is a compile error: this list cannot fall behind the type,
 * which is exactly how `invalidateAll()`'s hand-written list could.
 */
const EVERY_KEY: Record<ResourceKey, true> = {
  contacts: true,
  conversations: true,
  opportunities: true,
  pipelines: true,
  appointments: true,
  calendars: true,
  workflows: true,
  workflowRuns: true,
  tasks: true,
  notes: true,
  activities: true,
  tags: true,
  customFields: true,
  users: true,
  smartLists: true,
  templates: true,
  settings: true,
  analytics: true,
};

describe("invalidateAll()", () => {
  it("bumps every resource key, including ones nothing has read yet", async () => {
    vi.resetModules();
    const cache = await import("./cache");
    const keys = Object.keys(EVERY_KEY) as ResourceKey[];
    expect(keys.every((key) => cache.revisionOf(key) === 0)).toBe(true);

    cache.invalidateAll();

    for (const key of keys) expect(cache.revisionOf(key), key).toBe(1);
  });
});
