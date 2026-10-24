import { describe, expect, it, vi } from "vitest";

import type { Opportunity, OpportunityStatus } from "@/types";
import {
  freshModules,
  seededWorld,
  settle,
  stubLocalStorage,
} from "@/lib/mock/testing";
import { dateInputToIso, isoToDateInput } from "@/lib/validation/opportunity";
// The module directly, not the `@/lib/api` barrel, which re-exports the
// client-only `use-resource.ts`. Only the pure helpers come from this static
// import: it loads before any fake clock, so the API calls below import the
// module afresh inside `world()` (see `mock/testing.ts`).
import {
  isDeadDeal,
  rollupByStage,
  type OpportunityDraft,
  type OpportunityPatch,
} from "./opportunities";

const AT = "2026-09-01T09:00:00.000Z";

function deal(overrides: Partial<Opportunity>): Opportunity {
  return {
    id: "opp_fixture",
    name: "Fixture deal",
    contactId: "con_fixture",
    pipelineId: "pipe_fixture",
    stageId: "A",
    position: 0,
    value: 0,
    currency: "USD",
    status: "open",
    source: "manual",
    tagIds: [],
    customFields: {},
    stageEnteredAt: AT,
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

const STAGES = [
  { id: "A", probability: 10 },
  { id: "B", probability: 50 },
  { id: "C", probability: 100 },
];

describe("rollupByStage", () => {
  it("totals count, value and the probability-weighted forecast per stage", () => {
    const rollups = rollupByStage(
      [
        deal({ stageId: "A", value: 100_000 }),
        deal({ stageId: "A", value: 33_333 }),
        deal({ stageId: "B", value: 12_345 }),
      ],
      STAGES,
    );

    expect(rollups.get("A")).toEqual({
      stageId: "A",
      count: 2,
      total: 133_333,
      weighted: 13_333,
    });
    // 12_345 * 50% = 6_172.5, rounded half up.
    expect(rollups.get("B")).toEqual({
      stageId: "B",
      count: 1,
      total: 12_345,
      weighted: 6_173,
    });
  });

  it("rounds each deal's weight to whole cents before summing", () => {
    // Each 3¢ deal at 50% weighs 1.5¢ -> 2¢, so two make 4¢ (not round(3¢)).
    const rollups = rollupByStage(
      [deal({ stageId: "B", value: 3 }), deal({ stageId: "B", value: 3 })],
      STAGES,
    );
    expect(rollups.get("B")).toMatchObject({ total: 6, weighted: 4 });
  });

  it("returns zeros for an empty stage and keys follow the stage order", () => {
    const rollups = rollupByStage([deal({ stageId: "B", value: 500 })], STAGES);

    expect([...rollups.keys()]).toEqual(["A", "B", "C"]);
    expect(rollups.get("C")).toEqual({
      stageId: "C",
      count: 0,
      total: 0,
      weighted: 0,
    });
  });

  it("ignores a deal whose stage is not in the list", () => {
    const rollups = rollupByStage(
      [deal({ stageId: "A", value: 1_000 }), deal({ stageId: "Z", value: 99 })],
      STAGES,
    );

    expect(rollups.has("Z")).toBe(false);
    const totals = [...rollups.values()].reduce((sum, r) => sum + r.total, 0);
    expect(totals).toBe(1_000);
  });

  it("counts whatever it is given; the live-deal filter drops dead deals", () => {
    const deals = [
      deal({ stageId: "A", value: 100, status: "open" }),
      deal({ stageId: "A", value: 200, status: "lost" }),
      deal({ stageId: "B", value: 300, status: "abandoned" }),
      deal({ stageId: "C", value: 500, status: "won" }),
    ];

    const everything = rollupByStage(deals, STAGES);
    expect(everything.get("A")).toMatchObject({ count: 2, total: 300 });
    expect(everything.get("B")).toMatchObject({ count: 1, total: 300 });

    // The rule the board and the dashboard share.
    const live = rollupByStage(
      deals.filter((d) => !isDeadDeal(d)),
      STAGES,
    );
    expect(live.get("A")).toMatchObject({ count: 1, total: 100, weighted: 10 });
    expect(live.get("B")).toMatchObject({ count: 0, total: 0, weighted: 0 });
    expect(live.get("C")).toMatchObject({
      count: 1,
      total: 500,
      weighted: 500,
    });
  });
});

describe("isDeadDeal", () => {
  it.each<[OpportunityStatus, boolean]>([
    ["open", false],
    ["won", false],
    ["lost", true],
    ["abandoned", true],
  ])("a %s deal -> %s", (status, dead) => {
    expect(isDeadDeal(deal({ status }))).toBe(dead);
  });
});

/**
 * The expected close a deal is saved with. A caller other than the deal form
 * (a script, a future JSON client) must not be able to store a value the app
 * cannot read back as one instant.
 */

/** The deal every API case starts from. */
const FIXTURE = deal({ expectedCloseAt: "2026-11-05T17:00:00.000Z" });

/** A new deal on the fixture's contact, pipeline and stage. */
const DRAFT = {
  name: "New deal",
  contactId: FIXTURE.contactId,
  pipelineId: FIXTURE.pipelineId,
  stageId: FIXTURE.stageId,
};

/** The 422 every refused expected close gets, word for word. */
const INVALID_CLOSE = {
  status: 422,
  code: "INVALID_OPPORTUNITY",
  field: "expectedCloseAt",
  message:
    "Expected close: Not a valid date and time. Send an ISO date-time ending in Z or an offset, such as 2026-12-01T00:00:00Z.",
};

/** A fresh store holding only `start` (the fixture deal by default). */
async function world(start: Opportunity = FIXTURE) {
  await freshModules();
  const { db } = await import("@/lib/mock/db");
  const api = await import("./opportunities");
  const activities = await import("./activities");
  db.setState({ opportunities: { [start.id]: start } });
  return { api, activities };
}

type World = Awaited<ReturnType<typeof world>>;
type Operation = "create" | "update";

/**
 * Sends `expectedCloseAt` as it is, typed or not, through create() (a new
 * deal) or update() (the fixture).
 */
function sendClose(
  { api }: World,
  operation: Operation,
  expectedCloseAt: unknown,
): Promise<Opportunity> {
  const close = { expectedCloseAt } as unknown as Partial<Opportunity>;
  return settle(
    operation === "create"
      ? api.create({ ...DRAFT, ...close })
      : api.update(FIXTURE.id, close),
  );
}

/** What a refused call must leave as it was: every deal and the timeline. */
async function snapshot({ api, activities }: World) {
  return {
    deals: (await settle(api.list())).rows,
    timeline: await settle(activities.listForContact(FIXTURE.contactId)),
  };
}

const JUNK: { name: string; value: unknown }[] = [
  { name: "free text", value: "banana" },
  { name: "an empty string", value: "" },
  { name: "a date with no time", value: "2026-12-01" },
  // Read in the server's own zone, this would be a different instant on
  // every machine.
  { name: "a time with no zone", value: "2026-12-01T00:00:00" },
  // `Date.parse` reads this one as 2 March.
  { name: "an impossible date", value: "2026-02-30T00:00:00.000Z" },
  { name: "an impossible hour", value: "2026-12-01T24:00:00Z" },
  // A real date whose instant is in UTC year 10000.
  { name: "an instant past the year 9999", value: "9999-12-31T23:00:00-12:00" },
  // No `null` row: since P7-T45, null removes the date (see below).
  { name: "epoch milliseconds", value: 1764547200000 },
];

/** Spellings of an instant, and the one UTC spelling each is stored as. */
const VALID: { sent: string; stored: string }[] = [
  { sent: "2026-12-01T00:00:00.000Z", stored: "2026-12-01T00:00:00.000Z" },
  { sent: "2026-12-01T00:00:00Z", stored: "2026-12-01T00:00:00.000Z" },
  { sent: "2026-12-01T00:00+08:00", stored: "2026-11-30T16:00:00.000Z" },
  { sent: "2026-12-01T08:30:15.5-07:00", stored: "2026-12-01T15:30:15.500Z" },
];

describe.each<Operation>(["create", "update"])(
  "%s() checks the expected close",
  (operation) => {
    it.each(JUNK)("rejects $name with a 422 and writes nothing", async (c) => {
      const w = await world();
      const before = await snapshot(w);

      await expect(sendClose(w, operation, c.value)).rejects.toMatchObject(
        INVALID_CLOSE,
      );
      expect(await snapshot(w)).toEqual(before);
      // updatedAt included: a refused update touches nothing.
      expect(await settle(w.api.get(FIXTURE.id))).toEqual(FIXTURE);
    });

    it.each(VALID)("stores $sent as $stored", async ({ sent, stored }) => {
      const w = await world();

      const saved = await sendClose(w, operation, sent);

      expect(saved.expectedCloseAt).toBe(stored);
      expect((await settle(w.api.get(saved.id))).expectedCloseAt).toBe(stored);
    });
  },
);

describe.each<[string, number]>([
  ["UTC", 0],
  ["Asia/Singapore", -480],
  ["America/Los_Angeles", 420],
])("update() saves every day the deal form allows in %s", (zone, offset) => {
  it.each([
    "2026-09-08",
    "2028-02-29",
    // The US clocks change on these two days.
    "2026-03-08",
    "2026-11-01",
    // Local midnight here falls in UTC year 0099 east of UTC.
    "0100-01-01",
    "9999-12-31",
  ])("%s", async (day) => {
    vi.stubEnv("TZ", zone);
    // A TZ override that silently failed would run every case in UTC.
    expect(new Date("2026-09-08T00:00:00Z").getTimezoneOffset()).toBe(offset);
    const w = await world();
    const sent = dateInputToIso(day);
    expect(sent).toBeDefined();

    const saved = await settle(
      w.api.update(FIXTURE.id, { expectedCloseAt: sent }),
    );

    const stored = (await settle(w.api.get(FIXTURE.id))).expectedCloseAt;
    expect(saved.expectedCloseAt).toBe(sent);
    expect(stored).toBe(sent);
    expect(isoToDateInput(stored)).toBe(day);
  });
});

describe("the expected close when it is left out", () => {
  it("create() without an expected close stores none", async () => {
    const w = await world();

    const created = await settle(w.api.create(DRAFT));

    expect(Object.keys(created)).not.toContain("expectedCloseAt");
    const stored = await settle(w.api.get(created.id));
    expect(Object.keys(stored)).not.toContain("expectedCloseAt");
  });

  it("update() with expectedCloseAt undefined clears it, as the form's empty field does", async () => {
    const w = await world();

    const saved = await settle(
      w.api.update(FIXTURE.id, { expectedCloseAt: undefined }),
    );

    expect(saved.expectedCloseAt).toBeUndefined();
    expect(
      (await settle(w.api.get(FIXTURE.id))).expectedCloseAt,
    ).toBeUndefined();
  });

  it("update() without the key keeps the stored close", async () => {
    const w = await world();

    const saved = await settle(w.api.update(FIXTURE.id, { name: "Renamed" }));

    expect(saved).toMatchObject({
      name: "Renamed",
      expectedCloseAt: "2026-11-05T17:00:00.000Z",
    });
    expect((await settle(w.api.get(FIXTURE.id))).expectedCloseAt).toBe(
      "2026-11-05T17:00:00.000Z",
    );
  });

  it("update() on an unknown id is a 404 before the expected close is checked", async () => {
    const w = await world();

    await expect(
      settle(w.api.update("opp_missing", { expectedCloseAt: "banana" })),
    ).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
  });
});

/**
 * `null` removes an optional field (P7-T45), as it does on calendars: a JSON
 * client cannot send `undefined`, so `null` is how it clears one. The key is
 * deleted, never stored as null.
 */

/** A deal holding every field `null` can remove. */
const FULL = deal({
  ...FIXTURE,
  ownerId: "usr_fixture",
  status: "lost",
  lostReason: "Went with a competitor",
  closedAt: AT,
});

type Removable = "expectedCloseAt" | "ownerId" | "lostReason";
/**
 * A copy of the module's private `REMOVABLE` list, written out so the tests
 * name each key. It must stay in step with the one in `opportunities.ts`: a
 * key added there and not here goes untested.
 */
const REMOVABLE: Removable[] = ["expectedCloseAt", "ownerId", "lostReason"];

/**
 * One typed patch per key, with no cast: the typecheck proves
 * `OpportunityPatch` takes null for each of them.
 */
const NULL_PATCH: Record<Removable, OpportunityPatch> = {
  expectedCloseAt: { expectedCloseAt: null },
  ownerId: { ownerId: null },
  lostReason: { lostReason: null },
};

describe("create() removes an optional field sent as null", () => {
  it.each(REMOVABLE)("%s", async (key) => {
    const w = await world();

    const created = await settle(
      w.api.create({ ...DRAFT, ...NULL_PATCH[key] }),
    );

    expect(created).not.toHaveProperty(key);
    expect(await settle(w.api.get(created.id))).not.toHaveProperty(key);
  });
});

describe("update() removes an optional field sent as null", () => {
  it.each(REMOVABLE)("%s", async (key) => {
    const w = await world(FULL);

    const saved = await settle(w.api.update(FULL.id, NULL_PATCH[key]));

    const stored = await settle(w.api.get(FULL.id));
    for (const record of [saved, stored]) {
      expect(record).not.toHaveProperty(key);
      for (const other of REMOVABLE.filter((k) => k !== key)) {
        expect(record[other]).toBe(FULL[other]);
      }
      expect(record.name).toBe(FULL.name);
      expect(record.updatedAt).not.toBe(FULL.updatedAt);
    }
  });
});

describe("null from a JSON client", () => {
  it("a JSON body of nulls removes all three in one update", async () => {
    const w = await world(FULL);
    const body: OpportunityPatch = JSON.parse(
      JSON.stringify({
        expectedCloseAt: null,
        ownerId: null,
        lostReason: null,
      }),
    );

    await settle(w.api.update(FULL.id, body));

    const stored = await settle(w.api.get(FULL.id));
    const expected: Partial<Opportunity> = { ...FULL };
    for (const key of REMOVABLE) delete expected[key];
    // Strict: a key holding null or undefined would fail here too.
    expect(stored).toStrictEqual({ ...expected, updatedAt: stored.updatedAt });
    expect(stored.updatedAt).not.toBe(FULL.updatedAt);
  });

  it("a value sent after null sets the field again", async () => {
    const w = await world(FULL);
    await settle(
      w.api.update(FULL.id, {
        expectedCloseAt: null,
        ownerId: null,
        lostReason: null,
      }),
    );

    await settle(
      w.api.update(FULL.id, {
        expectedCloseAt: "2026-12-01T00:00+08:00",
        ownerId: "usr_other",
        lostReason: "Budget",
      }),
    );

    expect(await settle(w.api.get(FULL.id))).toMatchObject({
      expectedCloseAt: "2026-11-30T16:00:00.000Z",
      ownerId: "usr_other",
      lostReason: "Budget",
    });
  });

  it("a refused patch with a null beside it writes nothing", async () => {
    const w = await world(FULL);
    const before = await snapshot(w);

    await expect(
      settle(
        w.api.update(FULL.id, { expectedCloseAt: "banana", ownerId: null }),
      ),
    ).rejects.toMatchObject(INVALID_CLOSE);

    // ownerId kept and updatedAt unchanged: the null was not applied.
    expect(await settle(w.api.get(FULL.id))).toEqual(FULL);
    expect(await snapshot(w)).toEqual(before);
  });
});

/**
 * The allow-list (P7-T46). create() and update() save what their schema
 * parses, never the input itself: a key the API owns or does not know is
 * ignored, and a wrong-typed value is a 422 that names the field in the deal
 * form's words.
 */

/** Sends `input` as it is, typed or not: a JSON client can send anything. */
function sendRaw(
  { api }: World,
  operation: Operation,
  input: unknown,
): Promise<Opportunity> {
  return settle(
    operation === "create"
      ? api.create(input as OpportunityDraft)
      : api.update(FIXTURE.id, input as OpportunityPatch),
  );
}

const BAD_PATCHES: {
  name: string;
  patch: Record<string, unknown>;
  field: string;
  message: string;
}[] = [
  {
    name: "name null",
    patch: { name: null },
    field: "name",
    message: "Deal name: Not a valid value.",
  },
  {
    name: "a blank name",
    patch: { name: "   " },
    field: "name",
    message: "Deal name: Can't be empty.",
  },
  {
    name: "a numeric name",
    patch: { name: 5 },
    field: "name",
    message: "Deal name: Not a valid value.",
  },
  {
    name: "an empty contactId",
    patch: { contactId: "" },
    field: "contactId",
    message: "Contact: Not a valid value.",
  },
  {
    name: "pipelineId null",
    patch: { pipelineId: null },
    field: "pipelineId",
    message: "Pipeline: Not a valid value.",
  },
  {
    name: "a negative value",
    patch: { value: -1 },
    field: "value",
    message: "Value: Not a valid amount.",
  },
  {
    name: "a value in fractions of a cent",
    patch: { value: 1.5 },
    field: "value",
    message: "Value: Not a valid amount.",
  },
  {
    name: "a value sent as a string",
    patch: { value: "100" },
    field: "value",
    message: "Value: Not a valid amount.",
  },
  {
    name: "value null",
    patch: { value: null },
    field: "value",
    message: "Value: Not a valid amount.",
  },
  {
    name: "an unknown currency",
    patch: { currency: "BTC" },
    field: "currency",
    message: "Currency: Not a valid value.",
  },
  {
    name: "an unknown source",
    patch: { source: "tv" },
    field: "source",
    message: "Source: Not a valid value.",
  },
  {
    name: "an empty ownerId",
    patch: { ownerId: "" },
    field: "ownerId",
    message: "Owner: Not a valid value.",
  },
  {
    name: "a numeric ownerId",
    patch: { ownerId: 5 },
    field: "ownerId",
    message: "Owner: Not a valid value.",
  },
  {
    name: "tagIds null",
    patch: { tagIds: null },
    field: "tagIds",
    message: "Tags: Not a valid value.",
  },
  {
    name: "an empty tag id",
    patch: { tagIds: [""] },
    field: "tagIds.0",
    message: "Tags: Not a valid value.",
  },
  {
    name: "customFields null",
    patch: { customFields: null },
    field: "customFields",
    message: "Deal details: Not a valid value.",
  },
  {
    name: "a custom field holding an object",
    patch: { customFields: { x: {} } },
    field: "customFields.x",
    message: "Deal details: Not a valid value.",
  },
  {
    name: "a numeric lostReason",
    patch: { lostReason: 5 },
    field: "lostReason",
    message: "Lost reason: Not a valid value.",
  },
];

describe.each<Operation>(["create", "update"])(
  "%s() checks every field it saves",
  (operation) => {
    it.each(BAD_PATCHES)(
      "refuses $name with a 422 and writes nothing",
      async ({ patch, field, message }) => {
        const w = await world();
        const before = await snapshot(w);
        const input = operation === "create" ? { ...DRAFT, ...patch } : patch;

        await expect(sendRaw(w, operation, input)).rejects.toMatchObject({
          status: 422,
          code: "INVALID_OPPORTUNITY",
          field,
          message,
        });
        expect(await snapshot(w)).toEqual(before);
        expect(await settle(w.api.get(FIXTURE.id))).toEqual(FIXTURE);
      },
    );
  },
);

describe("create() checks the draft's required keys", () => {
  it.each([
    {
      name: "a draft with no name",
      draft: {
        contactId: DRAFT.contactId,
        pipelineId: DRAFT.pipelineId,
        stageId: DRAFT.stageId,
      },
      field: "name",
      message: "Deal name: Not a valid value.",
    },
    {
      name: "an empty stageId",
      draft: { ...DRAFT, stageId: "" },
      field: "stageId",
      message: "Stage: Not a valid value.",
    },
  ])("refuses $name with a 422", async ({ draft, field, message }) => {
    const w = await world();
    const before = await snapshot(w);

    await expect(sendRaw(w, "create", draft)).rejects.toMatchObject({
      status: 422,
      code: "INVALID_OPPORTUNITY",
      field,
      message,
    });
    expect(await snapshot(w)).toEqual(before);
  });
});

describe("a patch that is not an object is a 422", () => {
  it.each<Operation>(["create", "update"])(
    "%s(null) is 'Deal: Not a valid value.', not a TypeError",
    async (operation) => {
      const w = await world();
      const before = await snapshot(w);

      const error: unknown = await sendRaw(w, operation, null).catch(
        (e: unknown) => e,
      );

      expect(error).toMatchObject({
        status: 422,
        code: "INVALID_OPPORTUNITY",
        message: "Deal: Not a valid value.",
      });
      // About no one field, so no field at all (not even "").
      expect((error as { field?: unknown }).field).toBeUndefined();
      expect(await snapshot(w)).toEqual(before);
      expect(await settle(w.api.get(FIXTURE.id))).toEqual(FIXTURE);
    },
  );

  it("update() on an unknown id is still a 404 first", async () => {
    const w = await world();

    await expect(
      settle(w.api.update("opp_missing", null as unknown as OpportunityPatch)),
    ).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
  });
});

/** Keys only the API writes, plus one it does not know. */
const API_OWNED = {
  id: "opp_sent",
  stageId: "B",
  position: 7,
  status: "won",
  closedAt: "2020-01-01T00:00:00.000Z",
  stageEnteredAt: "2020-01-01T00:00:00.000Z",
  createdAt: "2020-01-01T00:00:00.000Z",
  createdBy: "usr_sent",
  updatedAt: "2020-01-02T00:00:00.000Z",
  foo: "bar",
};

describe("keys the API owns are ignored", () => {
  it("update() ignores id, stage, position, status, dates, createdBy and unknown keys", async () => {
    const w = await world(FULL);
    const ids = (await settle(w.api.list())).rows.map((d) => d.id);

    const saved = await sendRaw(w, "update", { ...API_OWNED, value: 12_345 });

    const stored = await settle(w.api.get(FULL.id));
    for (const record of [saved, stored]) {
      expect(record).toEqual({
        ...FULL,
        value: 12_345,
        updatedAt: expect.any(String),
      });
      expect(record.updatedAt).not.toBe(API_OWNED.updatedAt);
      expect(record.updatedAt).not.toBe(FULL.updatedAt);
      expect(record).not.toHaveProperty("foo");
      expect(record).not.toHaveProperty("createdBy");
    }
    await expect(settle(w.api.get(API_OWNED.id))).rejects.toMatchObject({
      status: 404,
    });
    expect((await settle(w.api.list())).rows.map((d) => d.id)).toEqual(ids);
  });

  it("create() ignores id, createdAt, position, status and other API-owned keys", async () => {
    const w = await world();

    const created = await sendRaw(w, "create", { ...API_OWNED, ...DRAFT });

    expect(created.id).toMatch(/^opp_/);
    expect(created.id).not.toBe(API_OWNED.id);
    expect(created.createdAt).not.toBe(API_OWNED.createdAt);
    expect(created.updatedAt).toBe(created.createdAt);
    expect(created.stageEnteredAt).toBe(created.createdAt);
    // The fixture already sits in stage A, so the new deal goes after it.
    expect(created.position).toBe(1);
    expect(created.status).toBe("open");
    for (const key of ["closedAt", "createdBy", "foo"]) {
      expect(created).not.toHaveProperty(key);
    }
    expect(await settle(w.api.get(created.id))).toEqual(created);
    await expect(settle(w.api.get(API_OWNED.id))).rejects.toMatchObject({
      status: 404,
    });
  });
});

/** One valid value for every editable key but the expected close. */
const VALID_FIELDS = {
  name: "  Renamed  ",
  value: 12_345,
  currency: "EUR",
  source: "referral",
  ownerId: "usr_other",
  tagIds: ["tag_a"],
  lostReason: "",
  customFields: {
    text: "Blue",
    count: 3,
    flag: true,
    picks: ["a", "b"],
    cleared: null,
  },
} satisfies OpportunityPatch;

describe.each<Operation>(["create", "update"])(
  "%s() saves valid values",
  (operation) => {
    it("trims the name and stores every other value as sent", async () => {
      const w = await world();

      const saved = await settle(
        operation === "create"
          ? w.api.create({ ...DRAFT, ...VALID_FIELDS })
          : w.api.update(FIXTURE.id, VALID_FIELDS),
      );

      const expected = { ...VALID_FIELDS, name: "Renamed" };
      expect(saved).toMatchObject(expected);
      expect(await settle(w.api.get(saved.id))).toMatchObject(expected);
    });
  },
);

describe("a whole record sent back", () => {
  it("every seeded deal re-saves unchanged", async () => {
    const { db } = await seededWorld();
    const api = await import("./opportunities");
    const deals = Object.values(db.getState().opportunities);
    expect(deals.length).toBeGreaterThan(0);

    for (const before of deals) {
      // What a JSON client would send back after reading the deal.
      const sent: OpportunityPatch = JSON.parse(JSON.stringify(before));
      await settle(api.update(before.id, sent));

      const after = await settle(api.get(before.id));
      expect(after).toEqual({ ...before, updatedAt: after.updatedAt });
    }
  });
});

describe("undefined in a patch", () => {
  it("undefined on a required field is ignored", async () => {
    const w = await world(FULL);

    const saved = await settle(
      w.api.update(FULL.id, {
        name: undefined,
        value: undefined,
        tagIds: undefined,
      }),
    );

    const stored = await settle(w.api.get(FULL.id));
    for (const record of [saved, stored]) {
      expect(record).toEqual({ ...FULL, updatedAt: expect.any(String) });
    }
  });

  it("undefined clears the three optional fields on update, as the form's empty fields do", async () => {
    const w = await world(FULL);

    const saved = await settle(
      w.api.update(FULL.id, {
        ownerId: undefined,
        expectedCloseAt: undefined,
        lostReason: undefined,
      }),
    );

    const stored = await settle(w.api.get(FULL.id));
    for (const record of [saved, stored]) {
      for (const key of REMOVABLE) {
        expect(Object.keys(record)).not.toContain(key);
      }
      expect(record.name).toBe(FULL.name);
    }
  });

  it("create() with undefined optional fields stores no keys", async () => {
    const w = await world();

    const created = await settle(
      w.api.create({
        ...DRAFT,
        expectedCloseAt: undefined,
        ownerId: undefined,
        lostReason: undefined,
      }),
    );

    const stored = await settle(w.api.get(created.id));
    for (const record of [created, stored]) {
      for (const key of REMOVABLE) {
        expect(Object.keys(record)).not.toContain(key);
      }
    }
  });
});

describe("the lost reason", () => {
  it("clearing the lost reason of a lost deal is allowed", async () => {
    const w = await world(FULL);

    const saved = await settle(w.api.update(FULL.id, { lostReason: null }));

    const stored = await settle(w.api.get(FULL.id));
    for (const record of [saved, stored]) {
      expect(record.status).toBe("lost");
      expect(Object.keys(record)).not.toContain("lostReason");
    }
  });
});

describe("setStatus()", () => {
  it("lost with a reason stores the status, the reason and a close date, and logs the loss", async () => {
    const w = await world();

    const saved = await settle(w.api.setStatus(FIXTURE.id, "lost", "Budget"));

    const stored = await settle(w.api.get(FIXTURE.id));
    for (const record of [saved, stored]) {
      expect(record).toMatchObject({
        status: "lost",
        lostReason: "Budget",
        closedAt: expect.any(String),
      });
    }
    expect(
      await settle(w.activities.listForContact(FIXTURE.contactId)),
    ).toEqual([
      expect.objectContaining({
        type: "opportunity.lost",
        opportunityId: FIXTURE.id,
        summary: 'Lost "Fixture deal" - Budget',
      }),
    ]);
  });

  it("open removes the close date and the reason, and logs a reopen", async () => {
    const w = await world(FULL);

    const saved = await settle(w.api.setStatus(FULL.id, "open"));

    const stored = await settle(w.api.get(FULL.id));
    for (const record of [saved, stored]) {
      expect(record.status).toBe("open");
      expect(Object.keys(record)).not.toContain("closedAt");
      expect(Object.keys(record)).not.toContain("lostReason");
    }
    expect(await settle(w.activities.listForContact(FULL.contactId))).toEqual([
      expect.objectContaining({
        type: "opportunity.stage_changed",
        summary: 'Reopened "Fixture deal"',
      }),
    ]);
  });

  it.each<OpportunityStatus>(["won", "lost", "abandoned", "open"])(
    "%s on an unknown id is a 404 and writes nothing",
    async (status) => {
      const w = await world();
      const before = {
        deals: (await settle(w.api.list())).rows,
        feed: await settle(w.activities.listRecent(100)),
      };

      await expect(
        settle(w.api.setStatus("opp_missing", status, "Budget")),
      ).rejects.toMatchObject({
        name: "ApiError",
        status: 404,
        code: "NOT_FOUND",
      });
      expect({
        deals: (await settle(w.api.list())).rows,
        feed: await settle(w.activities.listRecent(100)),
      }).toEqual(before);
      // updatedAt included: the fixture deal is untouched.
      expect(await settle(w.api.get(FIXTURE.id))).toEqual(FIXTURE);
      await expect(settle(w.api.get("opp_missing"))).rejects.toMatchObject({
        status: 404,
      });
    },
  );

  it("won stores a new close date and no lost reason", async () => {
    const w = await world(FULL);

    const saved = await settle(w.api.setStatus(FULL.id, "won"));

    const stored = await settle(w.api.get(FULL.id));
    for (const record of [saved, stored]) {
      expect(record.status).toBe("won");
      expect(record.closedAt).toEqual(expect.any(String));
      expect(record.closedAt).not.toBe(FULL.closedAt);
      expect(Object.keys(record)).not.toContain("lostReason");
    }
    expect(await settle(w.activities.listForContact(FULL.contactId))).toEqual([
      expect.objectContaining({
        type: "opportunity.won",
        summary: 'Won "Fixture deal"',
      }),
    ]);
  });
});

describe("the demo clock", () => {
  it("a refused call does not move the demo clock", async () => {
    await freshModules();
    // Before the first API call: the clock reads its mark once.
    const storage = stubLocalStorage();
    const { db } = await import("@/lib/mock/db");
    const api = await import("./opportunities");
    db.setState({ seededAt: AT, opportunities: { [FIXTURE.id]: FIXTURE } });

    const refused = [
      () => api.create({ ...DRAFT, expectedCloseAt: "banana" }),
      () => api.update(FIXTURE.id, { expectedCloseAt: "banana" }),
      () => api.update(FIXTURE.id, null as unknown as OpportunityPatch),
      () => api.create({ ...DRAFT, name: null } as unknown as OpportunityDraft),
    ];
    for (const call of refused) {
      await expect(settle(call())).rejects.toMatchObject({ status: 422 });
      expect(storage.getItem("nimbus-crm-clock")).toBeNull();
    }

    // Positive control: an accepted call does write the mark through the stub.
    await settle(api.update(FIXTURE.id, { name: "Renamed" }));
    expect(storage.getItem("nimbus-crm-clock")).not.toBeNull();
  });
});
