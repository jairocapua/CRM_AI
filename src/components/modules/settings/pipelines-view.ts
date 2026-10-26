import type { ID, Pipeline, PipelineStage } from "@/types";

/**
 * What the pipelines page shows, worked out from what it read and what it
 * did since. Pure, so each rule is unit-tested.
 */

/**
 * The pipelines to show, in the list's order: per pipeline, whichever of the
 * listed copy and the last copy a save returned (`saved`) has the newer
 * `updatedAt`, so a failed refetch never brings back older values; one
 * created since the list was read goes last; a deleted one (`deleted`) is
 * gone at once.
 */
export function shownPipelines(
  listed: readonly Pipeline[] | undefined,
  saved: ReadonlyMap<ID, Pipeline>,
  deleted: ReadonlySet<ID>,
): Pipeline[] {
  const rows = listed ?? [];
  const listedIds = new Set(rows.map((p) => p.id));
  const newest = rows.map((p) => {
    const s = saved.get(p.id);
    return s && s.updatedAt > p.updatedAt ? s : p;
  });
  const created = [...saved.values()]
    .filter((p) => !listedIds.has(p.id))
    .sort((a, b) => a.position - b.position);
  return [...newest, ...created].filter((p) => !deleted.has(p.id));
}

/** The pipeline picked, else the default, else the first; none when empty. */
export function selectedPipeline(
  shown: readonly Pipeline[],
  selectedId: ID | null,
): Pipeline | undefined {
  return (
    shown.find((p) => p.id === selectedId) ??
    shown.find((p) => p.isDefault) ??
    shown[0]
  );
}

/**
 * The order a reorder asked for, shown while the stored order is still
 * `over`: until the copy the reorder returns (or a later read) replaces it.
 */
export interface PickedOrder {
  pipelineId: ID;
  ids: ID[];
  /** The stored order (ids joined) it was picked over. */
  over: string;
}

/** A pipeline's stage ids in board order, joined: its stored order. */
export function storedOrderOf(pipeline: Pipeline | undefined): string {
  return pipeline
    ? [...pipeline.stages]
        .sort((a, b) => a.position - b.position)
        .map((s) => s.id)
        .join(",")
    : "";
}

/**
 * `pipeline`'s stages as the list shows them: in board order, without the
 * removed ones (`removed`), or in the order a reorder picked while the
 * stored order is still the one it was picked over.
 */
export function shownStages(
  pipeline: Pipeline | undefined,
  removed: ReadonlySet<ID>,
  picked: PickedOrder | null,
): PipelineStage[] {
  if (!pipeline) return [];
  const stored = [...pipeline.stages]
    .sort((a, b) => a.position - b.position)
    .filter((s) => !removed.has(s.id));
  if (
    !picked ||
    picked.pipelineId !== pipeline.id ||
    picked.over !== storedOrderOf(pipeline)
  ) {
    return stored;
  }
  const byId = new Map(stored.map((s) => [s.id, s]));
  return picked.ids.flatMap((id) => {
    const s = byId.get(id);
    return s ? [s] : [];
  });
}
