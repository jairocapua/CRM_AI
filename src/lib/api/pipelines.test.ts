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
  /** The stage of `pipeline` named `name`. */
  const stageNamed = (pipeline: Pipeline, name: string): PipelineStage =>
    pipeline.stages.find((s) => s.name === name)!;
  /** Every deal of a pipeline. */
  const dealsOf = (pipelineId: ID): Opportunity[] =>
    Object.values(db.getState().opportunities).filter(
      (o) => o.pipelineId === pipelineId,
    );

  return {
    db,
    pipelines,
    http,
    cache,
    byName,
    ordered,
    column,
    report,
    stageNamed,
    dealsOf,
  };
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
    const solo = await settle(w.pipelines.create({ name: "Solo" }));
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

/**
 * The pipelines manager's writes (P9-T05). Every refusal and every simulated
 * failure writes nothing: zustand's `setState` always makes a new state
 * object, so `toBe(before)` proves no write happened.
 */

/** Runs `call` with every mutation failing and checks nothing was written. */
async function failsWithoutWriting(w: World, call: () => Promise<unknown>) {
  const before = w.db.getState();
  w.http.setTuning({ failureRate: 1 });
  await expect(settle(call())).rejects.toMatchObject({
    status: 503,
    code: "MOCK_FAILURE",
  });
  w.http.setTuning({ failureRate: 0 });
  expect(w.db.getState()).toBe(before);
}

/** Expects `call` to be refused with `match`, writing nothing. */
async function refused(
  w: World,
  call: () => Promise<unknown>,
  match: Record<string, unknown>,
) {
  const before = w.db.getState();
  const error = await settle(call()).catch((e: unknown) => e);
  expect(error).toMatchObject(match);
  expect((error as Error).message).toMatch(/^[A-Z0-9].*\.$/);
  expect(w.db.getState()).toBe(before);
  return error as Error;
}

describe("pipelines.create()", () => {
  it("adds a pipeline after the last one with the New and Won stages", async () => {
    const w = await world();
    const revision = w.cache.revisionOf("pipelines");

    const created = await settle(w.pipelines.create({ name: "  Partners  " }));

    expect(created.name).toBe("Partners");
    expect(created.position).toBe(3);
    expect(created.isDefault).toBe(false);
    expect(created.currency).toBe("USD");
    expect(
      w.ordered(created).map((s) => [s.name, s.position, !!s.isWon]),
    ).toEqual([
      ["New", 0, false],
      ["Won", 1, true],
    ]);
    expect(w.db.getState().pipelines[created.id]).toEqual(created);
    expect(w.cache.revisionOf("pipelines")).toBeGreaterThan(revision);
    expect(await w.report()).toEqual([]);
  });

  it("takes one past the highest position, whatever the gaps", async () => {
    const w = await world();
    const renewals = w.byName("Renewals");
    w.db.setState((s) => ({
      pipelines: {
        ...s.pipelines,
        [renewals.id]: { ...renewals, position: 7 },
      },
    }));

    const created = await settle(w.pipelines.create({ name: "Partners" }));

    expect(created.position).toBe(8);
  });

  it("ignores every key but the name", async () => {
    const w = await world();
    const draft = {
      name: "Partners",
      isDefault: true,
      currency: "EUR",
      position: 0,
      stages: [],
      id: "pipe_mine",
    } as unknown as { name: string };

    const created = await settle(w.pipelines.create(draft));

    expect(created.id).not.toBe("pipe_mine");
    expect(created.isDefault).toBe(false);
    expect(created.currency).toBe("USD");
    expect(created.position).toBe(3);
    expect(created.stages).toHaveLength(2);
    expect(w.byName("Sales Pipeline").isDefault).toBe(true);
  });

  it("refuses an empty or too long name with a 422 on name", async () => {
    const w = await world();
    await refused(w, () => w.pipelines.create({ name: "  " }), {
      status: 422,
      code: "INVALID_PIPELINE",
      field: "name",
      message: "Enter a pipeline name.",
    });
    await refused(w, () => w.pipelines.create({ name: "x".repeat(61) }), {
      status: 422,
      code: "INVALID_PIPELINE",
      field: "name",
      message: "Keep the pipeline name to 60 characters or fewer.",
    });
  });

  it("refuses a name another pipeline has, in any letter case, with a 409", async () => {
    const w = await world();
    await refused(w, () => w.pipelines.create({ name: " renewals " }), {
      status: 409,
      code: "NAME_TAKEN",
      field: "name",
      message: "A pipeline named Renewals already exists.",
    });
  });

  it("writes nothing when the simulated write fails", async () => {
    const w = await world();
    await failsWithoutWriting(w, () =>
      w.pipelines.create({ name: "Partners" }),
    );
  });
});

describe("pipelines.update()", () => {
  it("renames a pipeline, trimmed, and keeps everything else", async () => {
    const w = await world();
    const renewals = w.byName("Renewals");

    const saved = await settle(
      w.pipelines.update(renewals.id, { name: " Retention " }),
    );

    expect(saved).toEqual({
      ...renewals,
      name: "Retention",
      updatedAt: saved.updatedAt,
    });
    expect(saved.updatedAt > renewals.updatedAt).toBe(true);
    expect(w.db.getState().pipelines[renewals.id]).toEqual(saved);
  });

  it("ignores stages, the default flag, currency, position and the id", async () => {
    const w = await world();
    const renewals = w.byName("Renewals");
    const patch = {
      name: "Retention",
      stages: [],
      isDefault: true,
      currency: "EUR",
      position: 0,
      id: "pipe_other",
      createdAt: "2020-01-01T00:00:00.000Z",
    } as unknown as { name: string };

    const saved = await settle(w.pipelines.update(renewals.id, patch));

    expect(saved.id).toBe(renewals.id);
    expect(saved.stages).toEqual(renewals.stages);
    expect(saved.isDefault).toBe(false);
    expect(saved.currency).toBe("USD");
    expect(saved.position).toBe(renewals.position);
    expect(saved.createdAt).toBe(renewals.createdAt);
    expect(w.db.getState().pipelines.pipe_other).toBeUndefined();
  });

  it("lets a pipeline keep its own name in another letter case", async () => {
    const w = await world();
    const renewals = w.byName("Renewals");
    const saved = await settle(
      w.pipelines.update(renewals.id, { name: "RENEWALS" }),
    );
    expect(saved.name).toBe("RENEWALS");
  });

  it("refuses another pipeline's name with a 409 and a bad name with a 422", async () => {
    const w = await world();
    const renewals = w.byName("Renewals");
    await refused(
      w,
      () => w.pipelines.update(renewals.id, { name: "sales PIPELINE" }),
      {
        status: 409,
        code: "NAME_TAKEN",
        field: "name",
        message: "A pipeline named Sales Pipeline already exists.",
      },
    );
    await refused(w, () => w.pipelines.update(renewals.id, { name: "" }), {
      status: 422,
      code: "INVALID_PIPELINE",
      field: "name",
    });
    await refused(w, () => w.pipelines.update("pipe_nope", { name: "X" }), {
      status: 404,
      code: "NOT_FOUND",
    });
  });

  it("writes nothing when the simulated write fails", async () => {
    const w = await world();
    const renewals = w.byName("Renewals");
    await failsWithoutWriting(w, () =>
      w.pipelines.update(renewals.id, { name: "Retention" }),
    );
  });
});

describe("pipelines.addStage()", () => {
  const DRAFT = { name: "Qualified", color: "teal", probability: 35 } as const;

  it("adds an open stage before the first closed stage and renumbers", async () => {
    const w = await world();
    const sales = w.byName("Sales Pipeline");
    const names = w.ordered(sales).map((s) => s.name);
    expect(names.at(-1)).toBe("Closed Won");

    const saved = await settle(
      w.pipelines.addStage(sales.id, { ...DRAFT, name: "  Qualified " }),
    );

    const stages = w.ordered(saved);
    expect(stages.map((s) => s.name)).toEqual([
      ...names.slice(0, -1),
      "Qualified",
      "Closed Won",
    ]);
    expect(stages.map((s) => s.position)).toEqual(stages.map((_, i) => i));
    const added = w.stageNamed(saved, "Qualified");
    expect(added).toEqual({
      id: added.id,
      name: "Qualified",
      color: "teal",
      probability: 35,
      position: names.length - 1,
    });
    expect(added.isWon).toBeUndefined();
    expect(added.isLost).toBeUndefined();
    expect(saved.updatedAt > sales.updatedAt).toBe(true);
    expect(w.db.getState().pipelines[sales.id]).toEqual(saved);
    expect(await w.report()).toEqual([]);
  });

  it("goes before the first closed stage in position order, lost ones too", async () => {
    const w = await world();
    const sales = w.byName("Sales Pipeline");
    // Mark Negotiation lost and store the stages back to front.
    const stages = w
      .ordered(sales)
      .map((s) => (s.name === "Negotiation" ? { ...s, isLost: true } : s))
      .reverse();
    w.db.setState((s) => ({
      pipelines: { ...s.pipelines, [sales.id]: { ...sales, stages } },
    }));

    const saved = await settle(w.pipelines.addStage(sales.id, DRAFT));

    expect(w.ordered(saved).map((s) => s.name)).toEqual([
      "New Lead",
      "Contacted",
      "Discovery Booked",
      "Proposal Sent",
      "Qualified",
      "Negotiation",
      "Closed Won",
    ]);
  });

  it("goes last in a pipeline with no closed stage", async () => {
    const w = await world();
    const solo = await settle(w.pipelines.create({ name: "Solo" }));
    await settle(
      w.pipelines.removeStage(solo.id, w.stageNamed(solo, "Won").id),
    );

    const saved = await settle(w.pipelines.addStage(solo.id, DRAFT));

    expect(w.ordered(saved).map((s) => [s.name, s.position])).toEqual([
      ["New", 0],
      ["Qualified", 1],
    ]);
  });

  it("ignores an id, a position and the closed flags in the draft", async () => {
    const w = await world();
    const sales = w.byName("Sales Pipeline");
    const draft = {
      ...DRAFT,
      id: "stg_mine",
      position: 0,
      isWon: true,
      isLost: true,
    } as unknown as typeof DRAFT;

    const saved = await settle(w.pipelines.addStage(sales.id, draft));

    const added = w.stageNamed(saved, "Qualified");
    expect(added.id).not.toBe("stg_mine");
    expect(added.position).toBe(sales.stages.length - 1);
    expect(added.isWon).toBeUndefined();
    expect(added.isLost).toBeUndefined();
  });

  it("refuses a name the pipeline already has, in any case, with a 409", async () => {
    const w = await world();
    const sales = w.byName("Sales Pipeline");
    await refused(
      w,
      () => w.pipelines.addStage(sales.id, { ...DRAFT, name: " contacted " }),
      {
        status: 409,
        code: "STAGE_NAME_TAKEN",
        field: "name",
        message: "Sales Pipeline already has a stage named Contacted.",
      },
    );
  });

  it("allows a name another pipeline's stage has", async () => {
    const w = await world();
    const renewals = w.byName("Renewals");
    const saved = await settle(
      w.pipelines.addStage(renewals.id, { ...DRAFT, name: "Contacted" }),
    );
    expect(w.ordered(saved).map((s) => s.name)).toContain("Contacted");
  });

  it("refuses a broken draft with a 422 on its field, and an unknown pipeline with a 404", async () => {
    const w = await world();
    const sales = w.byName("Sales Pipeline");
    const cases: [Record<string, unknown>, string, string][] = [
      [{ name: "" }, "name", "Enter a stage name."],
      [
        { name: "x".repeat(41) },
        "name",
        "Keep the stage name to 40 characters or fewer.",
      ],
      [{ color: "gold" }, "color", "Choose a colour."],
      [
        { probability: 140 },
        "probability",
        "Enter a probability from 0 to 100.",
      ],
      [
        { probability: 2.5 },
        "probability",
        "Enter a whole number from 0 to 100.",
      ],
    ];
    for (const [change, field, message] of cases) {
      await refused(
        w,
        () =>
          w.pipelines.addStage(sales.id, {
            ...DRAFT,
            ...change,
          } as typeof DRAFT),
        { status: 422, code: "INVALID_STAGE", field, message },
      );
    }
    await refused(w, () => w.pipelines.addStage("pipe_nope", DRAFT), {
      status: 404,
      code: "NOT_FOUND",
    });
  });

  it("writes nothing when the simulated write fails", async () => {
    const w = await world();
    const sales = w.byName("Sales Pipeline");
    await failsWithoutWriting(w, () => w.pipelines.addStage(sales.id, DRAFT));
  });
});

describe("pipelines.updateStage()", () => {
  it("saves the name, colour and probability, and keeps the rest", async () => {
    const w = await world();
    const sales = w.byName("Sales Pipeline");
    const stage = w.stageNamed(sales, "Contacted");

    const saved = await settle(
      w.pipelines.updateStage(sales.id, stage.id, {
        name: " Reached ",
        color: "pink",
        probability: 30,
      }),
    );

    expect(w.ordered(saved)).toEqual(
      w
        .ordered(sales)
        .map((s) =>
          s.id === stage.id
            ? { ...s, name: "Reached", color: "pink", probability: 30 }
            : s,
        ),
    );
    expect(saved.updatedAt > sales.updatedAt).toBe(true);
    expect(w.db.getState().pipelines[sales.id]).toEqual(saved);
  });

  it("changes only the keys sent", async () => {
    const w = await world();
    const sales = w.byName("Sales Pipeline");
    const stage = w.stageNamed(sales, "Contacted");
    const saved = await settle(
      w.pipelines.updateStage(sales.id, stage.id, { probability: 33 }),
    );
    expect(w.stageNamed(saved, "Contacted")).toEqual({
      ...stage,
      probability: 33,
    });
  });

  it("ignores the id, the position and the closed flags", async () => {
    const w = await world();
    const sales = w.byName("Sales Pipeline");
    const won = w.stageNamed(sales, "Closed Won");
    const patch = {
      name: "Signed",
      id: "stg_mine",
      position: 0,
      isWon: false,
      isLost: true,
    } as unknown as { name: string };

    const saved = await settle(
      w.pipelines.updateStage(sales.id, won.id, patch),
    );

    expect(w.stageNamed(saved, "Signed")).toEqual({ ...won, name: "Signed" });
  });

  it("lets a stage keep its own name in another case, and refuses another stage's", async () => {
    const w = await world();
    const sales = w.byName("Sales Pipeline");
    const stage = w.stageNamed(sales, "Contacted");
    await refused(
      w,
      () =>
        w.pipelines.updateStage(sales.id, stage.id, { name: "NEGOTIATION" }),
      {
        status: 409,
        code: "STAGE_NAME_TAKEN",
        field: "name",
        message: "Sales Pipeline already has a stage named Negotiation.",
      },
    );
    const saved = await settle(
      w.pipelines.updateStage(sales.id, stage.id, { name: "CONTACTED" }),
    );
    expect(w.stageNamed(saved, "CONTACTED").id).toBe(stage.id);
  });

  it("refuses a broken patch with a 422, and unknown records with a 404", async () => {
    const w = await world();
    const sales = w.byName("Sales Pipeline");
    const renewals = w.byName("Renewals");
    const stage = w.stageNamed(sales, "Contacted");
    await refused(
      w,
      () => w.pipelines.updateStage(sales.id, stage.id, { probability: -5 }),
      { status: 422, code: "INVALID_STAGE", field: "probability" },
    );
    await refused(
      w,
      () =>
        w.pipelines.updateStage(sales.id, stage.id, {
          color: "gold" as never,
        }),
      { status: 422, code: "INVALID_STAGE", field: "color" },
    );
    await refused(
      w,
      () =>
        w.pipelines.updateStage(sales.id, renewals.stages[0]!.id, {
          name: "X",
        }),
      { status: 404, code: "NOT_FOUND" },
    );
    await refused(
      w,
      () => w.pipelines.updateStage("pipe_nope", stage.id, { name: "X" }),
      { status: 404, code: "NOT_FOUND" },
    );
  });

  it("writes nothing when the simulated write fails", async () => {
    const w = await world();
    const sales = w.byName("Sales Pipeline");
    const stage = w.stageNamed(sales, "Contacted");
    await failsWithoutWriting(w, () =>
      w.pipelines.updateStage(sales.id, stage.id, { name: "Reached" }),
    );
  });
});

describe("pipelines.reorderStages()", () => {
  it("stores the order as positions 0..n-1", async () => {
    const w = await world();
    const sales = w.byName("Sales Pipeline");
    const ids = w.ordered(sales).map((s) => s.id);
    const next = [ids[1]!, ids[0]!, ...ids.slice(2).reverse()];

    const saved = await settle(w.pipelines.reorderStages(sales.id, next));

    expect(w.ordered(saved).map((s) => s.id)).toEqual(next);
    expect(w.ordered(saved).map((s) => s.position)).toEqual(
      next.map((_, i) => i),
    );
    expect(w.db.getState().pipelines[sales.id]).toEqual(saved);
    // The stages themselves are unchanged.
    const byId = new Map(sales.stages.map((s) => [s.id, s]));
    for (const stage of saved.stages) {
      expect({ ...stage, position: 0 }).toEqual({
        ...byId.get(stage.id),
        position: 0,
      });
    }
    expect(await w.report()).toEqual([]);
  });

  it("refuses anything but each of the pipeline's stages once with a 422", async () => {
    const w = await world();
    const sales = w.byName("Sales Pipeline");
    const renewals = w.byName("Renewals");
    const ids = w.ordered(sales).map((s) => s.id);
    const lists = [
      ids.slice(1), // one missing
      [...ids, renewals.stages[0]!.id], // one extra
      [...ids.slice(1), ids[1]!], // one twice, one missing
      [...ids.slice(1), "stg_nope"], // one unknown
      [], // none
    ];
    for (const list of lists) {
      await refused(w, () => w.pipelines.reorderStages(sales.id, list), {
        status: 422,
        code: "INVALID_ORDER",
        message: "The stages changed since this list loaded. Try again.",
      });
    }
    await refused(w, () => w.pipelines.reorderStages("pipe_nope", ids), {
      status: 404,
      code: "NOT_FOUND",
    });
  });

  it("writes nothing when the simulated write fails", async () => {
    const w = await world();
    const sales = w.byName("Sales Pipeline");
    const ids = w.ordered(sales).map((s) => s.id);
    await failsWithoutWriting(w, () =>
      w.pipelines.reorderStages(sales.id, [...ids].reverse()),
    );
  });
});

/**
 * Stage writes sent side by side (P9-T05). Each reads the pipeline and
 * writes it in the same simulated call, so a second write never starts from
 * a copy read before the first one landed. Both calls' sleeps are queued
 * before either runs, so a read made in one call and a write made in a
 * later one would interleave here and lose one of the changes.
 */
describe("pipelines stage writes sent at once", () => {
  it("keeps both of two stages added at once", async () => {
    const w = await world();
    const sales = w.byName("Sales Pipeline");
    const draft = { color: "teal", probability: 35 } as const;

    await settle(
      Promise.all([
        w.pipelines.addStage(sales.id, { ...draft, name: "Qualified" }),
        w.pipelines.addStage(sales.id, { ...draft, name: "Scoped" }),
      ]),
    );

    const names = w
      .ordered(w.db.getState().pipelines[sales.id]!)
      .map((s) => s.name);
    expect(names).toEqual([
      ...w
        .ordered(sales)
        .slice(0, -1)
        .map((s) => s.name),
      "Qualified",
      "Scoped",
      "Closed Won",
    ]);
  });

  // Each order: the call sent second is the one a stale read would undo.
  it.each(["rename first", "reorder first"])(
    "keeps both a rename and a reorder made at once (%s)",
    async (first) => {
      const w = await world();
      const sales = w.byName("Sales Pipeline");
      const stage = w.stageNamed(sales, "Contacted");
      const reversed = w
        .ordered(sales)
        .map((s) => s.id)
        .reverse();
      const rename = () =>
        w.pipelines.updateStage(sales.id, stage.id, { name: "Reached" });
      const reorder = () => w.pipelines.reorderStages(sales.id, reversed);

      await settle(
        Promise.all(
          first === "rename first"
            ? [rename(), reorder()]
            : [reorder(), rename()],
        ),
      );

      const after = w.ordered(w.db.getState().pipelines[sales.id]!);
      expect(after.map((s) => s.id)).toEqual(reversed);
      expect(after.find((s) => s.id === stage.id)!.name).toBe("Reached");
    },
  );
});

describe("pipelines.removeStage() timestamps and status", () => {
  it("restarts the moved deals' time in stage from one now, and keeps their status", async () => {
    const w = await world();
    const sales = w.byName("Sales Pipeline");
    const stages = w.ordered(sales);
    const won = stages.at(-1)!;
    const moving = w.column(won.id);
    const staying = w.column(stages.at(-2)!.id);
    expect(moving.length).toBeGreaterThan(0);
    expect(moving.every((o) => o.status === "won")).toBe(true);
    const before = new Map(moving.map((o) => [o.id, o]));

    const saved = await settle(w.pipelines.removeStage(sales.id, won.id));

    const at = saved.updatedAt;
    expect(at > sales.updatedAt).toBe(true);
    for (const deal of moving) {
      const after = w.db.getState().opportunities[deal.id]!;
      expect(after.stageEnteredAt).toBe(at);
      expect(after.updatedAt).toBe(at);
      // Won deals stay won, closed when they were.
      expect(after.status).toBe("won");
      expect(after.closedAt).toBe(before.get(deal.id)!.closedAt);
    }
    // The deals already in the neighbour column keep their timestamps.
    for (const deal of staying) {
      expect(w.db.getState().opportunities[deal.id]).toEqual({
        ...deal,
        position: w.db.getState().opportunities[deal.id]!.position,
      });
    }
  });
});

describe("pipelines.stageRemovalPreview()", () => {
  it("says what removeStage() then does: the count and the neighbour", async () => {
    for (const pick of ["first", "middle", "last"] as const) {
      const w = await world();
      const sales = w.byName("Sales Pipeline");
      const stages = w.ordered(sales);
      const index =
        pick === "first"
          ? 0
          : pick === "last"
            ? stages.length - 1
            : stages.findIndex(
                (s, i) =>
                  i > 0 && i < stages.length - 1 && w.column(s.id).length > 0,
              );
      const stage = stages[index]!;
      const moving = w.column(stage.id);
      expect(moving.length).toBeGreaterThan(0);

      const preview = await settle(
        w.pipelines.stageRemovalPreview(sales.id, stage.id),
      );
      await settle(w.pipelines.removeStage(sales.id, stage.id));

      const target = stages[index === 0 ? 1 : index - 1]!;
      const moved = moving.map((o) => w.db.getState().opportunities[o.id]!);
      expect(moved.every((o) => o.stageId === preview.moveTo!.id)).toBe(true);
      expect(preview).toEqual({
        count: moved.length,
        closed: {
          won: moving.filter((o) => o.status === "won").length,
          lost: moving.filter((o) => o.status === "lost").length,
          abandoned: moving.filter((o) => o.status === "abandoned").length,
        },
        moveTo: { id: target.id, name: target.name },
      });
    }
  });

  it("counts no deals for an empty stage", async () => {
    const w = await world();
    const sales = w.byName("Sales Pipeline");
    const added = await settle(
      w.pipelines.addStage(sales.id, {
        name: "Qualified",
        color: "teal",
        probability: 35,
      }),
    );
    const stage = w.stageNamed(added, "Qualified");
    const preview = await settle(
      w.pipelines.stageRemovalPreview(sales.id, stage.id),
    );
    expect(preview.count).toBe(0);
    expect(preview.closed).toEqual({ won: 0, lost: 0, abandoned: 0 });
    expect(preview.moveTo).toEqual({
      id: w.stageNamed(added, "Negotiation").id,
      name: "Negotiation",
    });
  });

  it("reports the refusal removeStage() throws for the only stage", async () => {
    const w = await world();
    const solo = await settle(w.pipelines.create({ name: "Solo" }));
    await settle(
      w.pipelines.removeStage(solo.id, w.stageNamed(solo, "Won").id),
    );
    const only = w.stageNamed(w.db.getState().pipelines[solo.id]!, "New");

    const preview = await settle(
      w.pipelines.stageRemovalPreview(solo.id, only.id),
    );
    const error = await settle(w.pipelines.removeStage(solo.id, only.id)).catch(
      (e: unknown) => e as Error,
    );

    expect(error).toMatchObject({ status: 409, code: "LAST_STAGE" });
    expect(preview).toEqual({
      count: 0,
      closed: { won: 0, lost: 0, abandoned: 0 },
      refusal: (error as Error).message,
    });
  });

  it("is a 404 for unknown records, and a read that never fails", async () => {
    const w = await world();
    const sales = w.byName("Sales Pipeline");
    await expect(
      settle(w.pipelines.stageRemovalPreview(sales.id, "stg_nope")),
    ).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    await expect(
      settle(w.pipelines.stageRemovalPreview("pipe_nope", sales.stages[0]!.id)),
    ).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    w.http.setTuning({ failureRate: 1 });
    await expect(
      settle(w.pipelines.stageRemovalPreview(sales.id, sales.stages[0]!.id)),
    ).resolves.toMatchObject({ moveTo: expect.anything() });
  });
});

describe("pipelines.removalPreview()", () => {
  it("counts the deals remove() deletes and names the next default", async () => {
    const w = await world();
    const sales = w.byName("Sales Pipeline");
    const deals = w.dealsOf(sales.id).length;
    const total = Object.keys(w.db.getState().opportunities).length;
    expect(deals).toBeGreaterThan(0);

    const preview = await settle(w.pipelines.removalPreview(sales.id));
    await settle(w.pipelines.remove(sales.id));

    const next = w.byName("Client Onboarding");
    expect(preview).toEqual({
      deals: total - Object.keys(w.db.getState().opportunities).length,
      becomesDefault: { id: next.id, name: "Client Onboarding" },
    });
    expect(preview.deals).toBe(deals);
    expect(next.isDefault).toBe(true);
    expect(await w.report()).toEqual([]);
  });

  it("names no new default when the pipeline is not the default", async () => {
    const w = await world();
    const renewals = w.byName("Renewals");
    const preview = await settle(w.pipelines.removalPreview(renewals.id));
    expect(preview).toEqual({ deals: w.dealsOf(renewals.id).length });
  });

  it("reports the refusal remove() throws for the last pipeline", async () => {
    const w = await world();
    await settle(w.pipelines.remove(w.byName("Sales Pipeline").id));
    await settle(w.pipelines.remove(w.byName("Client Onboarding").id));
    const renewals = w.byName("Renewals");

    const preview = await settle(w.pipelines.removalPreview(renewals.id));
    const error = await settle(w.pipelines.remove(renewals.id)).catch(
      (e: unknown) => e as Error,
    );

    expect(error).toMatchObject({ status: 409, code: "LAST_PIPELINE" });
    expect(preview).toEqual({
      deals: w.dealsOf(renewals.id).length,
      refusal: (error as Error).message,
    });
  });

  it("is a 404 for an unknown pipeline, and a read that never fails", async () => {
    const w = await world();
    await expect(
      settle(w.pipelines.removalPreview("pipe_nope")),
    ).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    w.http.setTuning({ failureRate: 1 });
    await expect(
      settle(w.pipelines.removalPreview(w.byName("Renewals").id)),
    ).resolves.toMatchObject({ deals: expect.any(Number) });
  });
});

describe("pipelines.remove() as one write", () => {
  it("deletes nothing when the write fails", async () => {
    const w = await world();
    const sales = w.byName("Sales Pipeline");
    await failsWithoutWriting(w, () => w.pipelines.remove(sales.id));
  });
});

describe("the integrity report on deals and stages", () => {
  it("reports a deal in a missing pipeline and a deal in another pipeline's stage", async () => {
    const w = await world();
    const sales = w.byName("Sales Pipeline");
    const renewals = w.byName("Renewals");
    const [a, b] = w.dealsOf(sales.id);
    w.db.setState((s) => ({
      opportunities: {
        ...s.opportunities,
        [a!.id]: { ...a!, pipelineId: "pipe_gone" },
        [b!.id]: { ...b!, stageId: renewals.stages[0]!.id },
      },
    }));

    const report = await w.report();

    expect(report).toContain("1 opportunities point at a missing pipeline");
    // The deal in a missing pipeline sits in no stage of it either.
    expect(report).toContain(
      "2 opportunities sit in a stage that does not exist",
    );
  });
});
