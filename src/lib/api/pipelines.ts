import type { ID, Pipeline, PipelineStage } from "@/types";
import { db } from "@/lib/mock/db";
import { newId } from "@/lib/mock/ids";
import { invalidate } from "./cache";
import { notFound, nowIso, simulate } from "./http";

export async function list(): Promise<Pipeline[]> {
  return simulate(
    () =>
      Object.values(db.getState().pipelines).sort(
        (a, b) => a.position - b.position,
      ),
    { canFail: false },
  );
}

export async function get(id: ID): Promise<Pipeline> {
  return simulate(
    () => db.getState().pipelines[id] ?? notFound("Pipeline", id),
    { canFail: false },
  );
}

export async function create(name: string): Promise<Pipeline> {
  const pipeline = await simulate(() => {
    const at = nowIso();
    const record: Pipeline = {
      id: newId("pipe"),
      name,
      position: Object.keys(db.getState().pipelines).length,
      isDefault: false,
      currency: "USD",
      stages: [
        {
          id: newId("stg"),
          name: "New",
          position: 0,
          color: "slate",
          probability: 10,
        },
        {
          id: newId("stg"),
          name: "Won",
          position: 1,
          color: "green",
          probability: 100,
          isWon: true,
        },
      ],
      createdAt: at,
      updatedAt: at,
    };
    db.setState((s) => ({
      pipelines: { ...s.pipelines, [record.id]: record },
    }));
    return record;
  });
  invalidate("pipelines", "opportunities");
  return pipeline;
}

export async function update(
  id: ID,
  patch: Partial<Pipeline>,
): Promise<Pipeline> {
  const pipeline = await simulate(() => {
    const prev = db.getState().pipelines[id] ?? notFound("Pipeline", id);
    const next: Pipeline = {
      ...prev,
      ...patch,
      id,
      updatedAt: nowIso(),
    };
    db.setState((s) => ({ pipelines: { ...s.pipelines, [id]: next } }));
    return next;
  });
  invalidate("pipelines", "opportunities", "analytics");
  return pipeline;
}

export async function addStage(
  pipelineId: ID,
  stage: Pick<PipelineStage, "name" | "color" | "probability">,
): Promise<Pipeline> {
  const pipeline = await get(pipelineId);
  const stages = [
    ...pipeline.stages,
    { ...stage, id: newId("stg"), position: pipeline.stages.length },
  ];
  return update(pipelineId, { stages });
}

export async function updateStage(
  pipelineId: ID,
  stageId: ID,
  patch: Partial<PipelineStage>,
): Promise<Pipeline> {
  const pipeline = await get(pipelineId);
  const stages = pipeline.stages.map((s) =>
    s.id === stageId ? { ...s, ...patch, id: stageId } : s,
  );
  return update(pipelineId, { stages });
}

/**
 * Removing a stage moves its deals to the neighbouring stage rather than
 * deleting them — losing deals because a stage was renamed away would be a
 * genuinely bad outcome.
 */
export async function removeStage(
  pipelineId: ID,
  stageId: ID,
): Promise<Pipeline> {
  const pipeline = await get(pipelineId);
  if (pipeline.stages.length <= 1) {
    return pipeline;
  }
  const index = pipeline.stages.findIndex((s) => s.id === stageId);
  const fallback = pipeline.stages[index === 0 ? 1 : index - 1]!;

  db.setState((s) => {
    const opportunities = Object.fromEntries(
      Object.entries(s.opportunities).map(([key, opp]) => [
        key,
        opp.stageId === stageId ? { ...opp, stageId: fallback.id } : opp,
      ]),
    );
    return { opportunities };
  });

  const stages = pipeline.stages
    .filter((s) => s.id !== stageId)
    .map((s, position) => ({ ...s, position }));

  return update(pipelineId, { stages });
}

export async function reorderStages(
  pipelineId: ID,
  orderedStageIds: ID[],
): Promise<Pipeline> {
  const pipeline = await get(pipelineId);
  const byId = new Map(pipeline.stages.map((s) => [s.id, s]));
  const stages = orderedStageIds
    .map((id, position) => {
      const stage = byId.get(id);
      return stage ? { ...stage, position } : undefined;
    })
    .filter((s): s is PipelineStage => Boolean(s));
  return update(pipelineId, { stages });
}

export async function remove(id: ID): Promise<void> {
  await simulate(() => {
    db.setState((s) => {
      const pipelines = { ...s.pipelines };
      delete pipelines[id];
      const opportunities = Object.fromEntries(
        Object.entries(s.opportunities).filter(([, o]) => o.pipelineId !== id),
      );
      return { pipelines, opportunities };
    });
  });
  invalidate("pipelines", "opportunities", "analytics");
}
