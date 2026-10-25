import type { ID } from "@/types";

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
