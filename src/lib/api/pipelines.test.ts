import { describe, expect, it } from "vitest";

import type { ID, Opportunity, Pipeline, PipelineStage } from "@/types";
import { seededWorld, settle } from "@/lib/mock/testing";

/**
 * Removing a stage or a pipeline from a seeded workspace (P9-T01). Each test
 * starts from a fresh seed, and every successful removal ends with a clean
 * integrity report: removing a stage must leave no deal in a stage that does
 * not exist, and deleting a pipeline must leave no activity or task pointing
 * at one of its deals.
 */

async function world() {
  const { db } = await seededWorld();
  const pipelines = await import("./pipelines");
  const settings = await import("./settings");
  const http = await import("./http");
  const cache = await import("./cache");

  const byName = (name: string): Pipeline =>
    Object.values(db.getState().pipelines).find((p) => p.name === name)!;
  const ordered = (pipeline: Pipeline): PipelineStage[] =>
    [...pipeline.stages].sort((a, b) => a.position - b.position);
  /** The stage's deals in board order. */
  const column = (stageId: ID): Opportunity[] =>
    Object.values(db.getState().opportunities)
      .filter((o) => o.stageId === stageId)
      .sort((a, b) => a.position - b.position);
  const report = () => settle(settings.integrityReport());

  return { db, pipelines, http, cache, byName, ordered, column, report };
}

type World = Awaited<ReturnType<typeof world>>;

/**
 * Removes the stage `pick` chooses from the seeded Sales Pipeline and checks
 * that its deals joined the end of `neighbour`'s column, in their old order.
 */
async function removeAndCheck(
  w: World,
  pick: (stages: PipelineStage[]) => number,
  neighbourOf: (index: number) => number,
) {
  const sales = w.byName("Sales Pipeline");
  const stages = w.ordered(sales);
  const index = pick(stages);
  const removed = stages[index]!;
  const neighbour = stages[neighbourOf(index)]!;
  const moving = w.column(removed.id).map((o) => o.id);
  const staying = w.column(neighbour.id).map((o) => o.id);
  const total = Object.keys(w.db.getState().opportunities).length;
  // Not vacuous: the removed stage really holds deals.
  expect(moving.length).toBeGreaterThan(0);

  const before = {
    pipelines: w.cache.revisionOf("pipelines"),
    opportunities: w.cache.revisionOf("opportunities"),
    analytics: w.cache.revisionOf("analytics"),
  };
  const result = await settle(w.pipelines.removeStage(sales.id, removed.id));

  const left = stages.filter((s) => s.id !== removed.id);
  expect(result.stages.map((s) => s.id)).toEqual(left.map((s) => s.id));
  expect(result.stages.map((s) => s.position)).toEqual(left.map((_, i) => i));
  expect(w.db.getState().pipelines[sales.id]).toEqual(result);

  expect(w.column(removed.id)).toEqual([]);
  const after = w.column(neighbour.id);
  expect(after.map((o) => o.id)).toEqual([...staying, ...moving]);
  expect(after.map((o) => o.position)).toEqual(after.map((_, i) => i));
  expect(after.every((o) => o.pipelineId === sales.id)).toBe(true);
  expect(Object.keys(w.db.getState().opportunities)).toHaveLength(total);

  expect(w.cache.revisionOf("pipelines")).toBeGreaterThan(before.pipelines);
  expect(w.cache.revisionOf("opportunities")).toBeGreaterThan(
    before.opportunities,
  );
  expect(w.cache.revisionOf("analytics")).toBeGreaterThan(before.analytics);
  expect(await w.report()).toEqual([]);
}

describe("pipelines.removeStage()", () => {
  it("moves a middle stage's deals to the stage before it", async () => {
    const w = await world();
    await removeAndCheck(
      w,
      (stages) =>
        stages.findIndex(
          (s, i) => i > 0 && i < stages.length - 1 && w.column(s.id).length > 0,
        ),
      (index) => index - 1,
    );
  });

  it("moves the last stage's deals to the stage before it", async () => {
    const w = await world();
    await removeAndCheck(
      w,
      (stages) => stages.length - 1,
      (index) => index - 1,
    );
  });

  it("moves the first stage's deals to the stage after it", async () => {
    const w = await world();
    await removeAndCheck(
      w,
      () => 0,
      () => 1,
    );
  });

  it("moves the deals and the stages in one simulated write", async () => {
    const w = await world();
    const sales = w.byName("Sales Pipeline");
    const first = w.ordered(sales)[0]!;
    expect(w.column(first.id).length).toBeGreaterThan(0);
    const before = w.db.getState();

    // Every mutation fails: nothing may have moved by the time it does.
    w.http.setTuning({ failureRate: 1 });
    await expect(
      settle(w.pipelines.removeStage(sales.id, first.id)),
    ).rejects.toMatchObject({ status: 503, code: "MOCK_FAILURE" });

    expect(w.db.getState()).toBe(before);
  });

  it("refuses an unknown stage with a 404 and writes nothing", async () => {
    const w = await world();
    const sales = w.byName("Sales Pipeline");
    const before = w.db.getState();

    await expect(
      settle(w.pipelines.removeStage(sales.id, "stg_nope")),
    ).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });

    expect(w.db.getState()).toBe(before);
  });

  it("refuses a stage of another pipeline with a 404 and writes nothing", async () => {
    const w = await world();
    const sales = w.byName("Sales Pipeline");
    const renewals = w.byName("Renewals");
    const before = w.db.getState();

    await expect(
      settle(w.pipelines.removeStage(sales.id, renewals.stages[0]!.id)),
    ).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });

    expect(w.db.getState()).toBe(before);
  });

  it("refuses an unknown pipeline with a 404 and writes nothing", async () => {
    const w = await world();
    const sales = w.byName("Sales Pipeline");
    const before = w.db.getState();

    await expect(
      settle(w.pipelines.removeStage("pipe_nope", sales.stages[0]!.id)),
    ).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });

    expect(w.db.getState()).toBe(before);
  });

  it("refuses to remove a pipeline's only stage with a 409", async () => {
    const w = await world();
    const solo = await settle(w.pipelines.create("Solo"));
    await settle(w.pipelines.removeStage(solo.id, solo.stages[0]!.id));
    const last = w.db.getState().pipelines[solo.id]!.stages;
    expect(last).toHaveLength(1);
    const before = w.db.getState();

    const error = await settle(
      w.pipelines.removeStage(solo.id, last[0]!.id),
    ).catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 409, code: "LAST_STAGE" });
    expect((error as Error).message).toMatch(/^[A-Z].*\.$/);
    expect(w.db.getState()).toBe(before);
    expect(await w.report()).toEqual([]);
  });
});

describe("pipelines.remove()", () => {
  it("deletes the pipeline's deals with their timeline and detaches their tasks", async () => {
    const w = await world();
    const sales = w.byName("Sales Pipeline");
    const s = w.db.getState();
    const deals = new Set(
      Object.values(s.opportunities)
        .filter((o) => o.pipelineId === sales.id)
        .map((o) => o.id),
    );
    const theirActivities = Object.values(s.activities).filter(
      (a) => a.opportunityId && deals.has(a.opportunityId),
    );
    const theirTasks = Object.values(s.tasks).filter(
      (t) => t.opportunityId && deals.has(t.opportunityId),
    );
    // Not vacuous: the pipeline has deals, and they have both.
    expect(deals.size).toBeGreaterThan(0);
    expect(theirActivities.length).toBeGreaterThan(0);
    expect(theirTasks.length).toBeGreaterThan(0);
    const counts = {
      opportunities: Object.keys(s.opportunities).length,
      activities: Object.keys(s.activities).length,
      tasks: Object.keys(s.tasks).length,
      contacts: Object.keys(s.contacts).length,
    };
    const revisions = {
      tasks: w.cache.revisionOf("tasks"),
      activities: w.cache.revisionOf("activities"),
    };

    await settle(w.pipelines.remove(sales.id));

    const after = w.db.getState();
    expect(after.pipelines[sales.id]).toBeUndefined();
    expect(Object.keys(after.opportunities)).toHaveLength(
      counts.opportunities - deals.size,
    );
    expect(Object.keys(after.activities)).toHaveLength(
      counts.activities - theirActivities.length,
    );
    expect(Object.keys(after.tasks)).toHaveLength(counts.tasks);
    for (const task of theirTasks) {
      expect(after.tasks[task.id]).toBeDefined();
      expect(after.tasks[task.id]!.opportunityId).toBeUndefined();
    }
    expect(Object.keys(after.contacts)).toHaveLength(counts.contacts);
    expect(w.cache.revisionOf("tasks")).toBeGreaterThan(revisions.tasks);
    expect(w.cache.revisionOf("activities")).toBeGreaterThan(
      revisions.activities,
    );
    expect(await w.report()).toEqual([]);
  });

  it("hands the default to the first pipeline left and renumbers positions", async () => {
    const w = await world();
    const sales = w.byName("Sales Pipeline");
    expect(sales.isDefault).toBe(true);

    await settle(w.pipelines.remove(sales.id));

    const left = Object.values(w.db.getState().pipelines).sort(
      (a, b) => a.position - b.position,
    );
    expect(left.map((p) => [p.name, p.position, p.isDefault])).toEqual([
      ["Client Onboarding", 0, true],
      ["Renewals", 1, false],
    ]);
  });

  it("refuses an unknown pipeline with a 404 and writes nothing", async () => {
    const w = await world();
    const before = w.db.getState();

    await expect(settle(w.pipelines.remove("pipe_nope"))).rejects.toMatchObject(
      { status: 404, code: "NOT_FOUND" },
    );

    expect(w.db.getState()).toBe(before);
  });

  it("refuses to delete the last pipeline with a 409", async () => {
    const w = await world();
    await settle(w.pipelines.remove(w.byName("Sales Pipeline").id));
    await settle(w.pipelines.remove(w.byName("Client Onboarding").id));
    const renewals = w.byName("Renewals");
    const before = w.db.getState();

    const error = await settle(w.pipelines.remove(renewals.id)).catch(
      (e: unknown) => e,
    );

    expect(error).toMatchObject({ status: 409, code: "LAST_PIPELINE" });
    expect((error as Error).message).toMatch(/^[A-Z].*\.$/);
    expect(w.db.getState()).toBe(before);
    expect(await w.report()).toEqual([]);
  });
});
