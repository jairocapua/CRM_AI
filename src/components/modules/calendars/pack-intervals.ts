/**
 * Side-by-side placement for a time grid: overlapping appointments share the
 * day's width instead of covering each other.
 *
 * Intervals are half-open, [start, end), in any unit (the time grid uses
 * minutes into the day), so two that touch (one ends at 10:00, the next starts
 * at 10:00) do not overlap and each keeps the full width.
 *
 * Pure: numbers in, placements out. No React, no API.
 */

export interface Placement {
  /** The interval's column, 0 being the leftmost. */
  column: number;
  /** How many columns its overlap group splits the width into. */
  columns: number;
}

/**
 * Each interval's column and column count, in input order.
 *
 * Intervals are taken by start (ties: longer first, then input order) and
 * swept into overlap groups: a group closes when the next start is at or
 * after the latest end so far. Inside a group each interval takes the
 * leftmost column whose last interval has ended by its start, else a new
 * column, so a chain A–B–C where only neighbours overlap fits in two columns.
 * Every member of a group shares the group's column count, so widths line up
 * across the group.
 *
 * The order of the input does not change any interval's placement, so a
 * caller can sort for display (say, live before cancelled) without moving
 * blocks.
 */
export function packIntervals<T extends { start: number; end: number }>(
  items: readonly T[],
): Placement[] {
  const sorted = items
    .map((item, index) => ({ start: item.start, end: item.end, index }))
    .sort((a, b) => a.start - b.start || b.end - a.end || a.index - b.index);
  const placements: Placement[] = items.map(() => ({ column: 0, columns: 1 }));

  let group: Placement[] = [];
  // The end of the last interval in each of the open group's columns.
  let columnEnds: number[] = [];
  let groupEnd = -Infinity;

  const closeGroup = () => {
    for (const placement of group) placement.columns = columnEnds.length;
    group = [];
    columnEnds = [];
    groupEnd = -Infinity;
  };

  for (const { start, end, index } of sorted) {
    if (start >= groupEnd) closeGroup();

    let column = columnEnds.findIndex((columnEnd) => columnEnd <= start);
    if (column === -1) column = columnEnds.length;
    columnEnds[column] = end;

    const placement = placements[index];
    if (placement) {
      placement.column = column;
      group.push(placement);
    }
    groupEnd = Math.max(groupEnd, end);
  }
  closeGroup();

  return placements;
}
