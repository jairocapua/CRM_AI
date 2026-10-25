import { describe, expect, it, vi } from "vitest";

import type { AutomationRequest, WorkflowRun } from "@/types";
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
  it("is on seed version 7", () => {
    expect(SEED_VERSION).toBe(7);
  });

  it("reseeds a workspace saved at seed version 6", async () => {
    // P8-T08 added the automationRequests table (seeded requests).
    const state = await boot(6);

    expect(state.contacts.marker).toBeUndefined();
    expect(Object.keys(state.contacts)).toHaveLength(240);
    expect(Object.keys(state.appointments)).toHaveLength(120);
    expect(Object.keys(state.workflowRuns).length).toBeGreaterThan(0);
    expect(Object.keys(state.automationRequests).length).toBeGreaterThan(0);
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
      // Priya's slug changes: her records still resolve by id, so the only
      // line is the automation's. (Deleting her outright would also orphan
      // every record she owns.)
      users: {
        ...s.users,
        usr_priya: { ...s.users["usr_priya"]!, slug: "priya-renamed" },
      },
    }));

    const report = await settle(settings.integrityReport());
    expect(report.sort()).toEqual([
      'New Lead Nurture references a missing tag "Newsletter"',
      'Speed to Lead references a missing user "priya"',
    ]);
  });

  it("reports a malformed definition through definitionProblems()", async () => {
    const { db } = await seededWorld();
    // The stand-in registry below holds one automation, so every other
    // automation's seeded runs, and the requests shipped as them, would be
    // reported as orphans.
    db.setState({ workflowRuns: {}, automationRequests: {} });
    const real = await import("@/lib/automations");
    const speed = real.AUTOMATIONS["speed-to-lead"]!;
    vi.doMock("@/lib/automations", () => ({
      AUTOMATIONS: {
        "speed-to-lead": {
          ...speed,
          steps: [speed.steps[0], { ...speed.steps[0] }],
        },
      },
      LAYOUTS: { "speed-to-lead": real.LAYOUTS["speed-to-lead"] },
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

describe("automation runs on the Demo Data page", () => {
  /** A seeded world whose run table is one real run plus `broken` copies. */
  async function withRuns(broken: (run: WorkflowRun) => Partial<WorkflowRun>) {
    const { db } = await seededWorld();
    const settings = await import("./settings");
    const real = Object.values(db.getState().workflowRuns).find(
      (r) => r.workflowId === "wf_speed_to_lead",
    )!;
    const copy: WorkflowRun = { ...real, id: "run_broken", ...broken(real) };
    db.setState({ workflowRuns: { [real.id]: real, [copy.id]: copy } });
    return settle(settings.integrityReport());
  }

  it("counts the seeded runs", async () => {
    const { db } = await seededWorld();
    const settings = await import("./settings");
    const { counts } = await settle(settings.stats());
    const runs = Object.keys(db.getState().workflowRuns).length;
    expect(runs).toBeGreaterThan(0);
    expect(counts.automationRuns).toBe(runs);
  });

  it("reports a run whose contact is gone", async () => {
    expect(await withRuns(() => ({ contactId: "con_gone" }))).toEqual([
      "1 automation runs point at a missing contact",
    ]);
  });

  it("reports a run whose automation is gone", async () => {
    expect(await withRuns(() => ({ workflowId: "wf_gone" }))).toEqual([
      "1 automation runs point at a missing automation",
    ]);
  });

  it("reports a run that logs a step its automation does not have", async () => {
    expect(
      await withRuns((run) => ({
        steps: [...run.steps, { ...run.steps[0]!, nodeId: "not_a_step" }],
      })),
    ).toEqual(["1 automation runs log a step their automation does not have"]);
  });

  it("checks a run's steps against its own automation, not any automation", async () => {
    // Review Request has a "send_email" step; Speed to Lead does not.
    expect(
      await withRuns((run) => ({
        steps: [...run.steps, { ...run.steps[0]!, nodeId: "send_email" }],
      })),
    ).toEqual(["1 automation runs log a step their automation does not have"]);
  });
});

describe("automation requests on the Demo Data page", () => {
  it("counts the seeded requests", async () => {
    const { db } = await seededWorld();
    const settings = await import("./settings");
    const { counts } = await settle(settings.stats());
    const requests = Object.keys(db.getState().automationRequests).length;
    expect(requests).toBeGreaterThan(0);
    expect(counts.automationRequests).toBe(requests);
  });

  it("finds nothing wrong with the seeded requests", async () => {
    const { db } = await seededWorld();
    const settings = await import("./settings");
    const shipped = Object.values(db.getState().automationRequests).filter(
      (r) => r.status === "shipped",
    );
    // Not vacuous: the seed ships some requests to real automations.
    expect(shipped.length).toBeGreaterThan(0);
    expect(await settle(settings.integrityReport())).toEqual([]);
  });

  it("reports a shipped request whose automation is gone", async () => {
    const { db } = await seededWorld();
    const settings = await import("./settings");
    const shipped = Object.values(db.getState().automationRequests).find(
      (r) => r.status === "shipped",
    )!;
    const broken: AutomationRequest = {
      ...shipped,
      shippedWorkflowId: "wf_gone",
    };
    db.setState((s) => ({
      automationRequests: { ...s.automationRequests, [broken.id]: broken },
    }));

    expect(await settle(settings.integrityReport())).toEqual([
      "1 automation requests point at a missing automation",
    ]);
  });
});

/**
 * What the settings removals keep consistent (P9-T01): every person a record
 * names, and every custom value's field. Each case breaks one seeded record.
 */
describe("teammates and custom fields on the Demo Data page", () => {
  type State = Awaited<ReturnType<typeof seededWorld>>["db"] extends {
    getState: () => infer S;
  }
    ? S
    : never;
  type TableName =
    | "contacts"
    | "opportunities"
    | "tasks"
    | "conversations"
    | "appointments"
    | "calendars"
    | "smartLists";

  /** The report after `patch` is applied to the table's first record. */
  async function reportWith<K extends TableName>(
    table: K,
    patch: (row: State[K][string]) => Partial<State[K][string]>,
  ) {
    const { db } = await seededWorld();
    const settings = await import("./settings");
    expect(await settle(settings.integrityReport())).toEqual([]);
    db.setState((s) => {
      const rows = s[table] as Record<string, State[K][string]>;
      const first = Object.values(rows)[0]!;
      return {
        [table]: { ...rows, [first.id]: { ...first, ...patch(first) } },
      } as Partial<State>;
    });
    return settle(settings.integrityReport());
  }

  it("finds nothing wrong with a fresh seed that names people and custom values", async () => {
    const { db } = await seededWorld();
    const settings = await import("./settings");
    const s = db.getState();
    // Not vacuous: the seed fills every field the checks below read.
    const contacts = Object.values(s.contacts);
    expect(contacts.filter((c) => c.ownerId).length).toBeGreaterThan(0);
    expect(contacts.filter((c) => c.followers.length).length).toBeGreaterThan(
      0,
    );
    expect(
      contacts.filter((c) => Object.keys(c.customFields).length).length,
    ).toBeGreaterThan(0);
    expect(
      Object.values(s.opportunities).filter(
        (o) => Object.keys(o.customFields).length,
      ).length,
    ).toBeGreaterThan(0);
    expect(
      Object.values(s.smartLists).filter((l) => l.ownerId).length,
    ).toBeGreaterThan(0);
    expect(await settle(settings.integrityReport())).toEqual([]);
  });

  it.each([
    {
      line: "1 contacts are owned by a missing user",
      run: () => reportWith("contacts", () => ({ ownerId: "usr_gone" })),
    },
    {
      line: "1 contacts are followed by a missing user",
      run: () =>
        reportWith("contacts", () => ({
          followers: ["usr_priya", "usr_gone"],
        })),
    },
    {
      line: "1 opportunities are owned by a missing user",
      run: () => reportWith("opportunities", () => ({ ownerId: "usr_gone" })),
    },
    {
      line: "1 tasks are assigned to a missing user",
      run: () => reportWith("tasks", () => ({ assigneeId: "usr_gone" })),
    },
    {
      line: "1 conversations are assigned to a missing user",
      run: () =>
        reportWith("conversations", () => ({ assigneeId: "usr_gone" })),
    },
    {
      line: "1 appointments are assigned to a missing user",
      run: () =>
        reportWith("appointments", () => ({ assignedUserId: "usr_gone" })),
    },
    {
      line: "1 calendars list a missing team member",
      run: () =>
        reportWith("calendars", (c) => ({
          teamMemberIds: [...c.teamMemberIds, "usr_gone"],
        })),
    },
    {
      line: "1 smart lists are owned by a missing user",
      run: () => reportWith("smartLists", () => ({ ownerId: "usr_gone" })),
    },
    {
      line: "1 contacts hold a value for a missing custom field",
      run: () =>
        reportWith("contacts", (c) => ({
          customFields: { ...c.customFields, gone_field: "x" },
        })),
    },
    {
      // A deal field's key is not a contact field.
      line: "1 contacts hold a value for a missing custom field",
      run: () =>
        reportWith("contacts", (c) => ({
          customFields: { ...c.customFields, competitor: "Keap" },
        })),
    },
    {
      line: "1 opportunities hold a value for a missing custom field",
      run: () =>
        reportWith("opportunities", (o) => ({
          customFields: { ...o.customFields, budget_range: "10k" },
        })),
    },
  ])("reports: $line", async ({ line, run }) => {
    expect(await run()).toEqual([line]);
  });
});

/**
 * The business page saves through `updateLocation` (P9-T02): only the keys
 * the form edits, checked with the form's own rules.
 */
describe("updateLocation()", () => {
  async function world() {
    const { db } = await seededWorld();
    const settings = await import("./settings");
    const id = db.getState().locationId;
    return { db, settings, id };
  }

  it.each([
    ["name", { name: "   " }, "Enter the business name."],
    [
      "email",
      { email: "hello@" },
      "Enter a valid email address, like name@example.com.",
    ],
    [
      "website",
      { website: "northwind.studio" },
      "Enter a web address that starts with https://.",
    ],
    [
      "timezone",
      { timezone: "Mars/Olympus" },
      "Choose a time zone from the list.",
    ],
    ["timezone", { timezone: "" }, "Choose a time zone."],
  ] as const)(
    "refuses a bad %s with a 422 naming it, and writes nothing",
    async (field, patch, message) => {
      const { db, settings, id } = await world();
      const before = db.getState();
      await expect(
        settle(settings.updateLocation(id, patch)),
      ).rejects.toMatchObject({
        status: 422,
        code: "INVALID_LOCATION",
        field,
        message,
      });
      expect(db.getState()).toBe(before);
    },
  );

  it("saves the business details trimmed and removes emptied optional values", async () => {
    const { db, settings, id } = await world();
    const saved = await settle(
      settings.updateLocation(id, {
        name: " Northwind Creative ",
        email: "",
        phone: " +1 555 0142 ",
        website: "",
        industry: " Design ",
        timezone: "Asia/Singapore",
      }),
    );
    expect(saved).toMatchObject({
      id,
      name: "Northwind Creative",
      phone: "+1 555 0142",
      industry: "Design",
      timezone: "Asia/Singapore",
      currency: "USD",
    });
    expect(saved).not.toHaveProperty("email");
    expect(saved).not.toHaveProperty("website");
    expect(db.getState().locations[id]).toEqual(saved);
    expect((await settle(settings.activeLocation())).name).toBe(
      "Northwind Creative",
    );
  });

  it("ignores every key the business form does not edit", async () => {
    const { db, settings, id } = await world();
    const prev = db.getState().locations[id]!;
    const saved = await settle(
      settings.updateLocation(id, {
        name: "Renamed",
        currency: "EUR",
        address: { city: "Oslo" },
        createdAt: "2020-01-01T00:00:00.000Z",
        id: "loc_other",
      }),
    );
    expect(saved).toMatchObject({
      id,
      name: "Renamed",
      currency: prev.currency,
      address: prev.address,
      createdAt: prev.createdAt,
    });
  });

  it("is a 404 for an unknown location", async () => {
    const { settings } = await world();
    await expect(
      settle(settings.updateLocation("loc_nope", { name: "X" })),
    ).rejects.toMatchObject({ status: 404 });
  });
});
