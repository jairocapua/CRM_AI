import type { ID, Pipeline, PipelineStage } from "@/types";
import { db } from "@/lib/mock/db";
import { newId } from "@/lib/mock/ids";
import { cascadePipelineDelete, cascadeStageDelete } from "@/lib/mock/cascade";
import { invalidate } from "./cache";
import { ApiError, notFound, nowIso, simulate } from "./http";

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
 * genuinely bad outcome. They join the end of the previous stage's column
 * (the next stage's, when the first stage goes), in their old order.
 *
 * - 404 for an unknown pipeline, or a stage the pipeline does not have.
 * - 409 `LAST_STAGE` for the pipeline's only stage: the board needs one.
 *
 * One simulated write: a refusal or a simulated failure moves nothing.
 */
export async function removeStage(
  pipelineId: ID,
  stageId: ID,
): Promise<Pipeline> {
  const pipeline = await simulate(() => {
    const state = db.getState();
    const prev =
      state.pipelines[pipelineId] ?? notFound("Pipeline", pipelineId);
    const stages = [...prev.stages].sort((a, b) => a.position - b.position);
    const index = stages.findIndex((s) => s.id === stageId);
    if (index < 0) notFound("Stage", stageId);
    if (stages.length <= 1) {
      throw new ApiError(
        `${stages[index]!.name} is the only stage in ${prev.name}, and a pipeline needs at least one stage.`,
        409,
        "LAST_STAGE",
      );
    }
    const fallback = stages[index === 0 ? 1 : index - 1]!;
    const changes = cascadeStageDelete(state, pipelineId, stageId, fallback.id);
    const next: Pipeline = {
      ...changes.pipelines![pipelineId]!,
      updatedAt: nowIso(),
    };
    db.setState({
      ...changes,
      pipelines: { ...changes.pipelines, [pipelineId]: next },
    });
    return next;
  });
  invalidate("pipelines", "opportunities", "analytics");
  return pipeline;
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

/**
 * Deletes a pipeline with its deals, through the same cascade as deleting a
 * deal: their timeline entries go and their tasks are detached.
 *
 * - 404 for an unknown pipeline.
 * - 409 `LAST_PIPELINE` for the only pipeline left: the board needs one.
 *
 * When the default pipeline goes, the first one left becomes the default.
 */
export async function remove(id: ID): Promise<void> {
  await simulate(() => {
    const state = db.getState();
    const pipeline = state.pipelines[id] ?? notFound("Pipeline", id);
    if (Object.keys(state.pipelines).length <= 1) {
      throw new ApiError(
        `${pipeline.name} is the only pipeline, and the board needs one, so it can't be deleted.`,
        409,
        "LAST_PIPELINE",
      );
    }
    db.setState((s) => cascadePipelineDelete(s, id));
  });
  invalidate("pipelines", "opportunities", "tasks", "activities", "analytics");
}
