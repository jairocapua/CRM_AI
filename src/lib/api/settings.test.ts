import { describe, expect, it } from "vitest";

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
  it("is on seed version 4", () => {
    expect(SEED_VERSION).toBe(4);
  });

  it("reseeds a workspace saved at seed version 3", async () => {
    const state = await boot(3);

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
