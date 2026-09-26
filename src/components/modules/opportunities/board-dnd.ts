import type { ID, Opportunity } from "@/types";

/**
 * The board's drag ids share one namespace: a deal is dropped either onto
 * another deal (id = the deal's id) or onto a column's empty space. Columns
 * therefore need a prefixed id, and the column that registers it and the
 * handler that decodes it must agree — so both come from here.
 */
const STAGE_PREFIX = "stage:";

export function stageDroppableId(stageId: ID): string {
  return `${STAGE_PREFIX}${stageId}`;
}

/** The stage id if this is a column drop target, otherwise undefined. */
export function stageIdFromDroppable(droppableId: string): ID | undefined {
  return droppableId.startsWith(STAGE_PREFIX)
    ? droppableId.slice(STAGE_PREFIX.length)
    : undefined;
}

/**
 * Lost and abandoned deals are dead: they stay visible for the record but are
 * never counted in a forecast, and cannot be dragged.
 *
 * Dragging them would silently resurrect them — `api.opportunities.move`
 * recomputes `status` from the destination stage, and since no seeded stage
 * carries `isLost`, every destination reads as "open". That would clear
 * `closedAt` while leaving a stale `lostReason` attached to a live deal.
 */
export function isDeadDeal(deal: Opportunity): boolean {
  return deal.status === "lost" || deal.status === "abandoned";
}
