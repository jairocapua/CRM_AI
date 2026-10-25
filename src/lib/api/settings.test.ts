import { describe, expect, it, vi } from "vitest";

import { SEED_VERSION } from "@/lib/mock/db-state";
import {
  freshModules,
  seededWorld,
  settle,
  stubLocalStorage,
} from "@/lib/mock/testing";

/**
 * P7 changed what seeded appointments look like (Los Angeles wall-clock hours,
 * no overlaps), so a workspace saved by an earlier build must be reseeded
 * rather than kept: `persist` compares its stored version with SEED_VERSION
 * and throws the old store away on a mismatch.
 */

const ANCHOR = "2026-09-08T09:00:00.000Z";
const STORE_KEY = "nimbus-crm-db";

/** A saved workspace holding nothing but one recognisable contact. */
function savedStore(version: number) {
  return JSON.stringify({
    state: {
      seededAt: ANCHOR,
      contacts: {
        marker: { id: "marker", firstName: "Saved", lastName: "Earlier" },
      },
      appointments: {},
    },
    version,
  });
}

async function boot(version: number) {
  await freshModules();
  const storage = stubLocalStorage();
  storage.setItem(STORE_KEY, savedStore(version));
  const { db } = await import("@/lib/mock/db");
  const settings = await import("./settings");
  await settle(settings.bootstrap());
  return db.getState();
}

describe("bootstrap()", () => {
  it("is on seed version 5", () => {
    expect(SEED_VERSION).toBe(5);
  });

  it("reseeds a workspace saved at seed version 4", async () => {
    // P8 deleted the workflows table (automations are code now).
    const state = await boot(4);

    expect(state.contacts.marker).toBeUndefined();
    expect(Object.keys(state.contacts)).toHaveLength(240);
    expect(Object.keys(state.appointments)).toHaveLength(120);
    expect(state.seededAt).toBe(ANCHOR);
  });

  it("keeps a workspace saved at the current seed version", async () => {
    // Positive control: the reseed above is the version check, not a boot
    // that always reseeds.
    const state = await boot(SEED_VERSION);

    expect(state.contacts.marker?.firstName).toBe("Saved");
    expect(Object.keys(state.appointments)).toHaveLength(0);
  });
});

describe("reseed()", () => {
  it("throws away a booking and restores the seeded appointments", async () => {
    const { db } = await seededWorld();
    const calendars = await import("./calendars");
    const settings = await import("./settings");

    const discovery = (await settle(calendars.list())).find(
      (c) => c.slug === "discovery",
    )!;
    const [first] = await settle(
      calendars.availableSlots(discovery.id, "2026-09-15"),
    );
    expect(first).toBeDefined();
    const booked = await settle(
      calendars.book({
        calendarId: discovery.id,
        contactId: Object.keys(db.getState().contacts)[0]!,
        startAt: first!,
      }),
    );
    expect(Object.keys(db.getState().appointments)).toHaveLength(121);

    await settle(settings.reseed());

    const state = db.getState();
    expect(Object.keys(state.appointments)).toHaveLength(120);
    expect(state.appointments[booked.id]).toBeUndefined();
    expect(state.seededAt).toBe(ANCHOR);
  });
});

describe("automations on the Demo Data page", () => {
  it("counts the registry as automations and no longer counts a workflows table", async () => {
    await seededWorld();
    const settings = await import("./settings");
    const { AUTOMATIONS } = await import("@/lib/automations");

    const { counts } = await settle(settings.stats());

    expect(counts.automations).toBe(Object.keys(AUTOMATIONS).length);
    expect(counts.automations).toBe(8);
    expect(Object.keys(counts)).not.toContain("workflows");
  });

  it("keeps the integrity report clean across two reseeds", async () => {
    const { db } = await seededWorld();
    const settings = await import("./settings");
    expect(await settle(settings.integrityReport())).toEqual([]);

    const firstTags = Object.keys(db.getState().tags);
    await settle(settings.reseed());
    const secondTags = Object.keys(db.getState().tags);
    await settle(settings.reseed());
    const thirdTags = Object.keys(db.getState().tags);

    // Each reseed mints new tag ids; the report must not care.
    expect(secondTags.filter((id) => firstTags.includes(id))).toEqual([]);
    expect(thirdTags.filter((id) => secondTags.includes(id))).toEqual([]);
    expect(await settle(settings.integrityReport())).toEqual([]);
  });

  it("reports an automation whose tag or user key no longer resolves", async () => {
    const { db } = await seededWorld();
    const settings = await import("./settings");
    db.setState((s) => ({
      tags: Object.fromEntries(
        Object.entries(s.tags).filter(([, t]) => t.name !== "Newsletter"),
      ),
      users: Object.fromEntries(
        Object.entries(s.users).filter(([, u]) => u.slug !== "priya"),
      ),
    }));

    const report = await settle(settings.integrityReport());
    expect(report.sort()).toEqual([
      'New Lead Nurture references a missing tag "Newsletter"',
      'Speed to Lead references a missing user "priya"',
    ]);
  });

  it("reports a malformed definition through definitionProblems()", async () => {
    await seededWorld();
    const real = await import("@/lib/automations");
    const speed = real.AUTOMATIONS["speed-to-lead"]!;
    vi.doMock("@/lib/automations", () => ({
      AUTOMATIONS: {
        "speed-to-lead": {
          ...speed,
          steps: [speed.steps[0], { ...speed.steps[0] }],
        },
      },
    }));
    try {
      const settings = await import("./settings");
      expect(await settle(settings.integrityReport())).toEqual([
        `Speed to Lead repeats node id "${speed.steps[0]!.id}"`,
      ]);
    } finally {
      vi.doUnmock("@/lib/automations");
    }
  });

  it("reports nodes a layout draws over each other", async () => {
    await seededWorld();
    // A layout that piles every node onto one spot.
    vi.doMock("@/lib/automations/layout", async (importOriginal) => {
      const real =
        await importOriginal<typeof import("@/lib/automations/layout")>();
      return {
        ...real,
        layout: (d: Parameters<typeof real.layout>[0]) => {
          const { nodes, edges } = real.layout(d);
          return {
            edges,
            nodes: nodes.map((n) => ({ ...n, position: { x: 0, y: 0 } })),
          };
        },
      };
    });
    try {
      const settings = await import("./settings");
      const report = await settle(settings.integrityReport());
      expect(report).toContain(
        'Review Request has overlapping nodes "trigger" and "wait_2_days"',
      );
      expect(new Set(report.map((line) => line.split(" has ")[0])).size).toBe(
        8,
      );
      expect(report.every((line) => line.includes("overlapping nodes"))).toBe(
        true,
      );
    } finally {
      vi.doUnmock("@/lib/automations/layout");
    }
  });
});
