import { describe, expect, it } from "vitest";

import type { Opportunity, OpportunityStatus } from "@/types";
// The module directly, not the `@/lib/api` barrel, which re-exports the
// client-only `use-resource.ts`.
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
