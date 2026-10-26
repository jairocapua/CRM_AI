import type { ID, Pipeline, PipelineStage, TagColor } from "@/types";
import { db } from "@/lib/mock/db";
import type { DbState } from "@/lib/mock/db-state";
import { newId } from "@/lib/mock/ids";
import {
  cascadePipelineDelete,
  cascadeStageDelete,
  countPipelineDeals,
  countStageDeals,
  nextDefaultPipeline,
  stageRemovalNeighbour,
  stagesInOrder,
  type ClosedDealCounts,
} from "@/lib/mock/cascade";
import { pipelineSchema, stageSchema } from "@/lib/validation/pipeline";
import { invalidate } from "./cache";

export type { ClosedDealCounts } from "@/lib/mock/cascade";
import { ApiError, notFound, nowIso, simulate } from "./http";
import { parsePatch } from "./patch";

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

const INVALID_PIPELINE = "INVALID_PIPELINE";
const INVALID_STAGE = "INVALID_STAGE";

/** What `create()` takes: the pipeline dialog's one key. */
export interface PipelineDraft {
  name: string;
}

/** What `update()` saves: the name, and nothing else. */
export interface PipelinePatch {
  name?: string;
}

/** What `addStage()` takes: the stage dialog's keys. */
export interface StageDraft {
  name: string;
  color: TagColor;
  probability: number;
}

/** What `updateStage()` saves: the stage dialog's keys. */
export type StagePatch = Partial<StageDraft>;

/** Whether two names read the same, ignoring letter case. */
function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Throws 409 `NAME_TAKEN` (field `name`) when a pipeline other than
 * `exceptId` already has `name`, in any letter case: the board's pipeline
 * picker would list two the same. The pipelines are read through
 * `Object.entries`, so an e2e pipelines read fault leaves this write alone.
 */
function refuseTakenName(state: DbState, name: string, exceptId?: ID): void {
  const holder = Object.entries(state.pipelines)
    .map(([, p]) => p)
    .find((p) => p.id !== exceptId && sameName(p.name, name));
  if (holder) {
    throw new ApiError(
      `A pipeline named ${holder.name} already exists.`,
      409,
      "NAME_TAKEN",
      "name",
    );
  }
}

/**
 * Throws 409 `STAGE_NAME_TAKEN` (field `name`) when a stage of `pipeline`
 * other than `exceptId` already has `name`, in any letter case: the board
 * would show two columns the same. Another pipeline's stage may share it.
 */
function refuseTakenStageName(
  pipeline: Pipeline,
  name: string,
  exceptId?: ID,
): void {
  const holder = pipeline.stages.find(
    (s) => s.id !== exceptId && sameName(s.name, name),
  );
  if (holder) {
    throw new ApiError(
      `${pipeline.name} already has a stage named ${holder.name}.`,
      409,
      "STAGE_NAME_TAKEN",
      "name",
    );
  }
}

/** `stageId` of `pipeline`, or a 404. */
function stageOf(pipeline: Pipeline, stageId: ID): PipelineStage {
  return (
    pipeline.stages.find((s) => s.id === stageId) ?? notFound("Stage", stageId)
  );
}

/**
 * Adds a pipeline after the last one, with two stages, New (10%) and Won
 * (100%, the won stage), and returns it.
 *
 * Refusals write nothing: 422 `INVALID_PIPELINE` (field `name`, the dialog's
 * sentence, `pipelineSchema`), then 409 `NAME_TAKEN` (field `name`) for a
 * name another pipeline has in any letter case. The name is saved trimmed;
 * keys other than the name are ignored, so a new pipeline is never the
 * default and is in USD. Its position is one past the highest. One write.
 */
export async function create(draft: PipelineDraft): Promise<Pipeline> {
  const pipeline = await simulate(() => {
    const { name } = parsePatch(
      pipelineSchema,
      { name: draft.name },
      INVALID_PIPELINE,
      "Those pipeline details are not valid.",
    );
    const state = db.getState();
    refuseTakenName(state, name);
    const at = nowIso();
    const record: Pipeline = {
      id: newId("pipe"),
      name,
      position:
        Math.max(
          -1,
          ...Object.entries(state.pipelines).map(([, p]) => p.position),
        ) + 1,
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

/**
 * Renames a pipeline and returns it. An allow-list: only `name` is saved;
 * the stages, the default flag, the currency, the position, the id and
 * every other key are ignored (stages change through the stage calls).
 *
 * Refusals write nothing: 404 `NOT_FOUND`, 422 `INVALID_PIPELINE` (field
 * `name`), 409 `NAME_TAKEN` (field `name`) for another pipeline's name in
 * any letter case (its own name in another case is fine). One write.
 */
export async function update(id: ID, patch: PipelinePatch): Promise<Pipeline> {
  const pipeline = await simulate(() => {
    const state = db.getState();
    const prev = state.pipelines[id] ?? notFound("Pipeline", id);
    const { name } = parsePatch(
      pipelineSchema,
      { name: patch.name ?? prev.name },
      INVALID_PIPELINE,
      "Those pipeline details are not valid.",
    );
    refuseTakenName(state, name, id);
    const next: Pipeline = { ...prev, name, updatedAt: nowIso() };
    db.setState((s) => ({ pipelines: { ...s.pipelines, [id]: next } }));
    return next;
  });
  invalidate("pipelines", "opportunities", "analytics");
  return pipeline;
}

/** Stores `stages` as `pipeline`'s, bumping its `updatedAt`. */
function saveStages(pipeline: Pipeline, stages: PipelineStage[]): Pipeline {
  const next: Pipeline = { ...pipeline, stages, updatedAt: nowIso() };
  db.setState((s) => ({ pipelines: { ...s.pipelines, [pipeline.id]: next } }));
  return next;
}

/**
 * Adds an open stage (neither won nor lost) to a pipeline and returns the
 * pipeline. It goes just before the first closed stage (won or lost) in
 * board order, so the funnel still ends in its outcomes; at the end when the
 * pipeline has none. The stages are renumbered 0..n-1.
 *
 * Refusals write nothing: 404 `NOT_FOUND` for an unknown pipeline, 422
 * `INVALID_STAGE` (with `field`: name, color or probability, and the
 * dialog's sentence, `stageSchema`), 409 `STAGE_NAME_TAKEN` (field `name`)
 * for a name the pipeline already has in any letter case. Values are saved
 * trimmed; an id, a position or closed flags in the draft are ignored. One
 * write.
 */
export async function addStage(
  pipelineId: ID,
  draft: StageDraft,
): Promise<Pipeline> {
  const pipeline = await simulate(() => {
    const prev =
      db.getState().pipelines[pipelineId] ?? notFound("Pipeline", pipelineId);
    const values = parsePatch(
      stageSchema,
      { name: draft.name, color: draft.color, probability: draft.probability },
      INVALID_STAGE,
      "Those stage details are not valid.",
    );
    refuseTakenStageName(prev, values.name);
    const stages = stagesInOrder(prev);
    const firstClosed = stages.findIndex((s) => s.isWon || s.isLost);
    const at = firstClosed < 0 ? stages.length : firstClosed;
    stages.splice(at, 0, {
      id: newId("stg"),
      name: values.name,
      color: values.color,
      probability: values.probability,
      position: at,
    });
    return saveStages(
      prev,
      stages.map((s, position) =>
        s.position === position ? s : { ...s, position },
      ),
    );
  });
  invalidate("pipelines", "opportunities", "analytics");
  return pipeline;
}

/**
 * Edits one stage and returns the pipeline. An allow-list: the name, the
 * colour and the probability; the id, the position and the won and lost
 * flags are kept (a stage's outcome decides its deals' status, so it is not
 * editable here).
 *
 * Refusals write nothing: 404 `NOT_FOUND` for an unknown pipeline or a stage
 * it does not have, 422 `INVALID_STAGE` (with `field`), 409
 * `STAGE_NAME_TAKEN` (field `name`) for another stage's name in any letter
 * case. One write.
 */
export async function updateStage(
  pipelineId: ID,
  stageId: ID,
  patch: StagePatch,
): Promise<Pipeline> {
  const pipeline = await simulate(() => {
    const prev =
      db.getState().pipelines[pipelineId] ?? notFound("Pipeline", pipelineId);
    const stage = stageOf(prev, stageId);
    const values = parsePatch(
      stageSchema,
      {
        name: patch.name ?? stage.name,
        color: patch.color ?? stage.color,
        probability: patch.probability ?? stage.probability,
      },
      INVALID_STAGE,
      "Those stage details are not valid.",
    );
    refuseTakenStageName(prev, values.name, stageId);
    return saveStages(
      prev,
      prev.stages.map((s) =>
        s.id === stageId
          ? {
              ...s,
              name: values.name,
              color: values.color,
              probability: values.probability,
            }
          : s,
      ),
    );
  });
  invalidate("pipelines", "opportunities", "analytics");
  return pipeline;
}

/**
 * Stores `orderedStageIds` as the pipeline's board order (positions 0..n-1)
 * and returns the pipeline. A 422 `INVALID_ORDER` unless the list is exactly
 * the pipeline's stages, each once: a stale list that dropped a stage would
 * leave its deals in no column. 404 for an unknown pipeline. Refusals write
 * nothing. One write.
 */
export async function reorderStages(
  pipelineId: ID,
  orderedStageIds: ID[],
): Promise<Pipeline> {
  const pipeline = await simulate(() => {
    const prev =
      db.getState().pipelines[pipelineId] ?? notFound("Pipeline", pipelineId);
    const byId = new Map(prev.stages.map((s) => [s.id, s]));
    const sent = new Set(orderedStageIds);
    if (
      orderedStageIds.length !== prev.stages.length ||
      sent.size !== orderedStageIds.length ||
      orderedStageIds.some((id) => !byId.has(id))
    ) {
      throw new ApiError(
        "The stages changed since this list loaded. Try again.",
        422,
        "INVALID_ORDER",
      );
    }
    return saveStages(
      prev,
      orderedStageIds.map((id, position) => ({ ...byId.get(id)!, position })),
    );
  });
  invalidate("pipelines", "opportunities", "analytics");
  return pipeline;
}

/**
 * Why `removeStage()` would refuse `stage` of `pipeline`, or nothing: 409
 * `LAST_STAGE` for the pipeline's only stage, since the board needs one.
 * `removeStage()` throws it and `stageRemovalPreview()` reports its message,
 * so the dialog never repeats the rule.
 */
function stageRemovalRefusal(
  pipeline: Pipeline,
  stage: PipelineStage,
): ApiError | undefined {
  if (pipeline.stages.length <= 1) {
    return new ApiError(
      `${stage.name} is the only stage in ${pipeline.name}, and a pipeline needs at least one stage.`,
      409,
      "LAST_STAGE",
    );
  }
  return undefined;
}

/**
 * Removing a stage moves its deals to the neighbouring stage rather than
 * deleting them — losing deals because a stage was renamed away would be a
 * genuinely bad outcome. They join the end of the previous stage's column
 * (the next stage's, when the first stage goes), in their old order
 * (`stageRemovalNeighbour`). Their time in stage starts again now
 * (`stageEnteredAt` and `updatedAt`, one timestamp, the pipeline's new
 * `updatedAt` too); their status is kept, so won deals stay won.
 *
 * - 404 for an unknown pipeline, or a stage the pipeline does not have.
 * - 409 `LAST_STAGE` for the pipeline's only stage (`stageRemovalRefusal`).
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
    const stage = stageOf(prev, stageId);
    const refusal = stageRemovalRefusal(prev, stage);
    if (refusal) throw refusal;
    const fallback = stageRemovalNeighbour(prev, stageId)!;
    const at = nowIso();
    const changes = cascadeStageDelete(
      state,
      pipelineId,
      stageId,
      fallback.id,
      at,
    );
    const next: Pipeline = {
      ...changes.pipelines![pipelineId]!,
      updatedAt: at,
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

/** What removing a stage would do, before anyone confirms. */
export interface StageRemovalPreview {
  /** How many deals sit in the stage (`countStageDeals`, the ones moved). */
  count: number;
  /** How many of those are won, lost or abandoned: they keep that status. */
  closed: ClosedDealCounts;
  /** The stage they move to; none when the removal is refused. */
  moveTo?: { id: ID; name: string };
  /** Why `removeStage()` would refuse (`stageRemovalRefusal`), if it would. */
  refusal?: string;
}

/**
 * What `removeStage(pipelineId, stageId)` would do now: how many deals it
 * moves and where to, or its refusal's sentence. 404 `NOT_FOUND` for an
 * unknown pipeline or stage, as `removeStage()`. A read: never fails on the
 * Demo Data failure rate.
 */
export async function stageRemovalPreview(
  pipelineId: ID,
  stageId: ID,
): Promise<StageRemovalPreview> {
  return simulate(
    () => {
      const state = db.getState();
      const pipeline =
        state.pipelines[pipelineId] ?? notFound("Pipeline", pipelineId);
      const stage = stageOf(pipeline, stageId);
      const preview: StageRemovalPreview = countStageDeals(
        state,
        pipelineId,
        stageId,
      );
      const refusal = stageRemovalRefusal(pipeline, stage);
      if (refusal) {
        preview.refusal = refusal.message;
      } else {
        const neighbour = stageRemovalNeighbour(pipeline, stageId)!;
        preview.moveTo = { id: neighbour.id, name: neighbour.name };
      }
      return preview;
    },
    { canFail: false },
  );
}

/**
 * Why `remove()` would refuse `pipeline`, or nothing: 409 `LAST_PIPELINE`
 * for the only pipeline left, since the board needs one. `remove()` throws
 * it and `removalPreview()` reports its message. Counts the pipelines with
 * `Object.keys`, which the e2e read fault leaves alone.
 */
function pipelineRemovalRefusal(
  state: DbState,
  pipeline: Pipeline,
): ApiError | undefined {
  if (Object.keys(state.pipelines).length <= 1) {
    return new ApiError(
      `${pipeline.name} is the only pipeline, and the board needs one, so it can't be deleted.`,
      409,
      "LAST_PIPELINE",
    );
  }
  return undefined;
}

/**
 * Deletes a pipeline with its deals, through the same cascade as deleting a
 * deal: their timeline entries go and their tasks are detached.
 *
 * - 404 for an unknown pipeline.
 * - 409 `LAST_PIPELINE` for the only pipeline left (`pipelineRemovalRefusal`).
 *
 * When the default pipeline goes, the first one left becomes the default.
 * One write; it reads every pipeline through `Object.entries`, so an e2e
 * pipelines read fault leaves it alone.
 */
export async function remove(id: ID): Promise<void> {
  await simulate(() => {
    const state = db.getState();
    const pipeline = state.pipelines[id] ?? notFound("Pipeline", id);
    const refusal = pipelineRemovalRefusal(state, pipeline);
    if (refusal) throw refusal;
    db.setState((s) => cascadePipelineDelete(s, id));
  });
  invalidate("pipelines", "opportunities", "tasks", "activities", "analytics");
}

/** What deleting a pipeline would do, before anyone confirms. */
export interface PipelineRemovalPreview {
  /** How many deals are deleted with it (`countPipelineDeals`). */
  deals: number;
  /** The pipeline that becomes the default, when the default goes. */
  becomesDefault?: { id: ID; name: string };
  /** Why `remove()` would refuse (`pipelineRemovalRefusal`), if it would. */
  refusal?: string;
}

/**
 * What `remove(id)` would do now: how many deals go with the pipeline and
 * which pipeline becomes the default, or its refusal's sentence. 404
 * `NOT_FOUND` for an unknown pipeline, as `remove()`. A read: never fails on
 * the Demo Data failure rate.
 */
export async function removalPreview(id: ID): Promise<PipelineRemovalPreview> {
  return simulate(
    () => {
      const state = db.getState();
      const pipeline = state.pipelines[id] ?? notFound("Pipeline", id);
      const preview: PipelineRemovalPreview = {
        deals: countPipelineDeals(state, id),
      };
      const refusal = pipelineRemovalRefusal(state, pipeline);
      if (refusal) {
        preview.refusal = refusal.message;
      } else {
        const next = nextDefaultPipeline(state, id);
        if (next) preview.becomesDefault = { id: next.id, name: next.name };
      }
      return preview;
    },
    { canFail: false },
  );
}
