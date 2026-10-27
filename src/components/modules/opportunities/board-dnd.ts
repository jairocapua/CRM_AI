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

/** What the drop maths needs of a deal. */
export interface BoardDeal {
  id: ID;
  name: string;
  stageId: ID;
  position: number;
}

/** Where a drop lands: the stage, the 0-based index in that stage's column
 *  once the deal is in it, the column's length then, and whether that is
 *  where the deal already is. */
export interface BoardDropTarget {
  stageId: ID;
  index: number;
  total: number;
  inPlace: boolean;
}

function columnOf<T extends BoardDeal>(deals: readonly T[], stageId: ID): T[] {
  return deals
    .filter((d) => d.stageId === stageId)
    .sort((a, b) => a.position - b.position);
}

/**
 * Where dropping `activeId` over `overId` (a deal, or a column's
 * `stageDroppableId`) puts it, in the terms `api.opportunities.move` takes:
 * `index` is the position in the destination column with the dragged deal
 * taken out first.
 *
 * - Over itself: where it is (in place).
 * - Over a deal in its own column: that deal's place, in either direction,
 *   as dnd-kit's sorting preview shows it.
 * - Over a deal in another column: just before that deal.
 * - Over a column's empty space: the end of that column.
 *
 * Undefined when either id is unknown.
 */
export function boardDropTarget(
  deals: readonly BoardDeal[],
  activeId: ID,
  overId: string,
): BoardDropTarget | undefined {
  const dragged = deals.find((d) => d.id === activeId);
  if (!dragged) return undefined;
  const ownColumn = columnOf(deals, dragged.stageId);
  const rank = ownColumn.findIndex((d) => d.id === dragged.id);

  if (overId === activeId) {
    return {
      stageId: dragged.stageId,
      index: rank,
      total: ownColumn.length,
      inPlace: true,
    };
  }

  const overDeal = deals.find((d) => d.id === overId);
  const stageId = stageIdFromDroppable(overId) ?? overDeal?.stageId;
  if (stageId === undefined) return undefined;

  if (stageId === dragged.stageId) {
    const index = overDeal
      ? ownColumn.findIndex((d) => d.id === overDeal.id)
      : ownColumn.length - 1;
    return {
      stageId,
      index,
      total: ownColumn.length,
      inPlace: index === rank,
    };
  }

  const column = columnOf(deals, stageId);
  const overIndex = overDeal
    ? column.findIndex((d) => d.id === overDeal.id)
    : -1;
  return {
    stageId,
    index: overIndex < 0 ? column.length : overIndex,
    total: column.length + 1,
    inPlace: false,
  };
}

/** What a screen reader hears about a deal card before a drag. */
export const DEAL_DRAG_INSTRUCTIONS =
  "To move a deal, press Space or Enter on its card, then the left and right arrow keys to change the stage and the up and down arrow keys to change its place, then Space or Enter again to drop it. Escape puts it back.";

type DragEventLike = {
  active: { id: string | number };
  over: { id: string | number } | null;
};

/**
 * What a screen reader hears while a deal is dragged, naming the deal, the
 * stage and the position: "Picked up Acme renewal, in New Lead, position 2
 * of 5.", "Acme renewal is over Contacted, position 1 of 4.", "Acme renewal
 * moved to Contacted, position 1 of 4.", "Moving Acme renewal was cancelled;
 * it stays in New Lead, position 2 of 5." `deals` is the board before the
 * drag as shown: only the cards on screen (no hidden lost deals, none the
 * search filters out), so positions are counted among the cards the user
 * sees. The drop itself is computed against every deal of the pipeline;
 * since a deal lands next to the visible card it is over (or at a column's
 * end), both agree on the order of the cards shown.
 */
export function boardDragAnnouncements(
  deals: readonly BoardDeal[],
  stages: readonly { id: ID; name: string }[],
) {
  const dealName = (id: string | number) =>
    deals.find((d) => d.id === id)?.name;
  const stageName = (id: ID) =>
    stages.find((s) => s.id === id)?.name ?? "the stage";
  const where = (target: BoardDropTarget) =>
    `${stageName(target.stageId)}, position ${target.index + 1} of ${target.total}`;
  const home = (id: string | number) =>
    boardDropTarget(deals, String(id), String(id));
  const targetOf = ({ active, over }: DragEventLike) =>
    over
      ? boardDropTarget(deals, String(active.id), String(over.id))
      : undefined;

  return {
    onDragStart: ({ active }: Pick<DragEventLike, "active">) => {
      const name = dealName(active.id);
      const target = home(active.id);
      return name && target
        ? `Picked up ${name}, in ${where(target)}.`
        : "Picked up the deal.";
    },
    onDragOver: (event: DragEventLike) => {
      const name = dealName(event.active.id) ?? "The deal";
      const target = targetOf(event);
      return target
        ? `${name} is over ${where(target)}.`
        : `${name} is not over a stage.`;
    },
    onDragEnd: (event: DragEventLike) => {
      const name = dealName(event.active.id) ?? "The deal";
      const target = targetOf(event);
      if (target && !target.inPlace)
        return `${name} moved to ${where(target)}.`;
      const stay = home(event.active.id);
      return stay
        ? `${name} dropped; it stays in ${where(stay)}.`
        : `${name} dropped.`;
    },
    onDragCancel: ({ active }: Pick<DragEventLike, "active">) => {
      const name = dealName(active.id) ?? "the deal";
      const stay = home(active.id);
      return stay
        ? `Moving ${name} was cancelled; it stays in ${where(stay)}.`
        : `Moving ${name} was cancelled.`;
    },
  };
}
