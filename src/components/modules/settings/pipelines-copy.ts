import type { PipelineStage } from "@/types";
import type { ClosedDealCounts } from "@/lib/api";
import { pluralize } from "@/lib/format";
import { serverErrorField } from "./team-copy";

/**
 * The pipelines page's words (`/settings/pipelines`). Pure, so each is
 * unit-tested.
 */

/** The polite status while a new stage order saves (handles disabled). */
export const STAGE_ORDER_SAVING = "Saving the new order…";

/** A closed stage's badge: "Won" or "Lost"; nothing for an open stage. */
export function stageOutcome(
  stage: Pick<PipelineStage, "isWon" | "isLost">,
): "Won" | "Lost" | null {
  if (stage.isWon) return "Won";
  if (stage.isLost) return "Lost";
  return null;
}

/** Whether `stage` is won or lost: new stages go before the first one. */
export function isClosedStage(
  stage: Pick<PipelineStage, "isWon" | "isLost">,
): boolean {
  return stageOutcome(stage) !== null;
}

/**
 * Where removing a stage moves its deals, from `stageRemovalPreview`: "3
 * deals move to Contacted.", "1 deal moves to Contacted.", or "No deals are
 * in this stage."
 */
export function stageMoveSentence(count: number, moveTo: string): string {
  if (count === 0) return "No deals are in this stage.";
  return `${pluralize(count, "deal")} ${count === 1 ? "moves" : "move"} to ${moveTo}.`;
}

const CLOSED_WORDS: [keyof ClosedDealCounts, string, string][] = [
  ["won", "Won", "won"],
  ["lost", "Lost", "lost"],
  ["abandoned", "Abandoned", "abandoned"],
];

/**
 * That the closed deals among those moved keep their status: "Won deals
 * stay won.", "Won and lost deals keep their status.", "Won, lost and
 * abandoned deals keep their status."; null when none of them is closed.
 */
export function keepsStatusSentence(closed: ClosedDealCounts): string | null {
  const present = CLOSED_WORDS.filter(([key]) => closed[key] > 0);
  if (present.length === 0) return null;
  if (present.length === 1) {
    const [, Word, word] = present[0]!;
    return `${Word} deals stay ${word}.`;
  }
  const words = present.map(([, , word]) => word);
  const list = `${words.slice(0, -1).join(", ")} and ${words.at(-1)!}`;
  return `${list.charAt(0).toUpperCase()}${list.slice(1)} deals keep their status.`;
}

/**
 * What deleting a pipeline deletes, from `removalPreview`: "12 deals are
 * deleted with it, with their timeline entries; their tasks stay, detached
 * from the deal." (as `cascadeOpportunityDelete` does), or "It has no
 * deals."
 */
export function pipelineDeletionSentence(deals: number): string {
  if (deals === 0) return "It has no deals.";
  return deals === 1
    ? "1 deal is deleted with it, with its timeline entries; its tasks stay, detached from the deal."
    : `${pluralize(deals, "deal")} are deleted with it, with their timeline entries; their tasks stay, detached from the deal.`;
}

/** The toast after a stage removal: where its deals went, if any moved. */
export function stageRemovedDescription(
  count: number,
  moveTo: string,
): string | undefined {
  if (count === 0) return undefined;
  return `${pluralize(count, "deal")} moved to ${moveTo}.`;
}

/** What a screen reader hears about the drag handles before a drag. */
export const STAGE_DRAG_INSTRUCTIONS =
  "To move a stage, press Space or Enter on its handle, then the up and down arrow keys, then Space or Enter again to drop it. Escape puts it back.";

/**
 * What a screen reader hears while a stage is dragged, naming the stage and
 * its position: "Picked up Contacted, position 2 of 6.", "Contacted is over
 * position 3 of 6.", "Contacted dropped at position 3 of 6.", "Moving
 * Contacted was cancelled; it stays at position 2 of 6." `stages` is the
 * list in its order before the drag; a drop over position `n` puts the
 * stage there.
 */
export function stageDragAnnouncements(
  stages: readonly Pick<PipelineStage, "id" | "name">[],
) {
  const total = stages.length;
  const nameOf = (id: string | number) =>
    stages.find((s) => s.id === id)?.name ?? "The stage";
  const positionOf = (id: string | number) =>
    stages.findIndex((s) => s.id === id) + 1;
  type Event = {
    active: { id: string | number };
    over: { id: string | number } | null;
  };
  return {
    onDragStart: ({ active }: Pick<Event, "active">) =>
      `Picked up ${nameOf(active.id)}, position ${positionOf(active.id)} of ${total}.`,
    onDragOver: ({ active, over }: Event) =>
      over
        ? `${nameOf(active.id)} is over position ${positionOf(over.id)} of ${total}.`
        : `${nameOf(active.id)} is not over a position.`,
    onDragEnd: ({ active, over }: Event) =>
      over
        ? `${nameOf(active.id)} dropped at position ${positionOf(over.id)} of ${total}.`
        : `${nameOf(active.id)} dropped; it stays at position ${positionOf(active.id)} of ${total}.`,
    onDragCancel: ({ active }: Pick<Event, "active">) =>
      `Moving ${nameOf(active.id)} was cancelled; it stays at position ${positionOf(active.id)} of ${total}.`,
  };
}

/** The pipeline dialog's inputs an API refusal can be about. */
const PIPELINE_FIELDS = ["name"] as const;

/** The stage dialog's inputs an API refusal can be about. */
const STAGE_FIELDS = ["name", "color", "probability"] as const;

/** The pipeline dialog's input a refusal is about, or null (root error). */
export function pipelineErrorField(error: unknown): "name" | null {
  return serverErrorField(error, PIPELINE_FIELDS);
}

/** The stage dialog's input a refusal is about, or null (root error). */
export function stageErrorField(
  error: unknown,
): (typeof STAGE_FIELDS)[number] | null {
  return serverErrorField(error, STAGE_FIELDS);
}
