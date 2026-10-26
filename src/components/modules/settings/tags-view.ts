import type { ID, ISODate, Tag } from "@/types";
import type { TagWithCount } from "@/lib/api";

/**
 * What the tags page shows, worked out from what it read and what it did
 * since. Pure, so each rule is unit-tested.
 */

/**
 * A target's contact count as a merge returned it, standing in for the
 * listed count until a list read at least as new (`asOf`, the target's
 * `updatedAt` after the merge) comes in.
 */
export interface MergedCount {
  contactCount: number;
  asOf: ISODate;
}

/** A tag's own stored fields, without anything a read adds. */
export function storedTag(tag: Tag): Tag {
  return {
    id: tag.id,
    name: tag.name,
    slug: tag.slug,
    color: tag.color,
    createdAt: tag.createdAt,
    updatedAt: tag.updatedAt,
  };
}

/**
 * The tags to show, by name:
 *
 * - per tag, whichever of the listed copy and the last copy a save returned
 *   (`saved`) has the newer `updatedAt` (ties go to the listed copy), so a
 *   failed refetch never brings back older values; the count and the rename
 *   refusal always come from the list;
 * - a merge target's count is the one the merge returned (`counts`) while
 *   the listed copy is older than the merge, so a failed refetch never shows
 *   the count from before it;
 * - a tag created since the list was read is added (no contacts yet, unless
 *   a merge since says otherwise);
 * - a removed or merged-away tag (`removed`) is gone at once.
 */
export function shownTags(
  listed: readonly TagWithCount[] | undefined,
  saved: ReadonlyMap<ID, Tag>,
  removed: ReadonlySet<ID>,
  counts: ReadonlyMap<ID, MergedCount>,
): TagWithCount[] {
  const rows = listed ?? [];
  const listedIds = new Set(rows.map((t) => t.id));
  const shown = rows.map((row): TagWithCount => {
    const s = saved.get(row.id);
    const c = counts.get(row.id);
    const newest = s && s.updatedAt > row.updatedAt ? { ...row, ...s } : row;
    return c && c.asOf > row.updatedAt
      ? { ...newest, contactCount: c.contactCount }
      : newest;
  });
  const created = [...saved.values()]
    .filter((t) => !listedIds.has(t.id))
    .map((t): TagWithCount => ({
      ...t,
      contactCount: counts.get(t.id)?.contactCount ?? 0,
    }));
  return [...shown, ...created]
    .filter((t) => !removed.has(t.id))
    .sort((a, b) => a.name.localeCompare(b.name));
}
