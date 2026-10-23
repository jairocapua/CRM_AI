import { describe, expect, it, vi } from "vitest";

import type { Opportunity, OpportunityStatus } from "@/types";
import { freshModules, settle } from "@/lib/mock/testing";
import { dateInputToIso, isoToDateInput } from "@/lib/validation/opportunity";
// The module directly, not the `@/lib/api` barrel, which re-exports the
// client-only `use-resource.ts`. Only the pure helpers come from this static
// import: it loads before any fake clock, so the API calls below import the
// module afresh inside `world()` (see `mock/testing.ts`).
import { isDeadDeal, rollupByStage } from "./opportunities";

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

/** A fresh store holding only the fixture deal. */
async function world() {
  await freshModules();
  const { db } = await import("@/lib/mock/db");
  const api = await import("./opportunities");
  const activities = await import("./activities");
  db.setState({ opportunities: { [FIXTURE.id]: FIXTURE } });
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
  { name: "null", value: null },
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
