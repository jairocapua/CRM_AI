import type { ID, Tag, TagColor } from "@/types";
import { db } from "@/lib/mock/db";
import type { DbState } from "@/lib/mock/db-state";
import { AUTOMATIONS } from "@/lib/automations";
import { referencedKeys } from "@/lib/automations/keys";
import {
  cascadeTagDelete,
  cascadeTagMerge,
  countContactsAfterMerge,
  countTaggedRecords,
  holdsTag,
} from "@/lib/mock/cascade";
import { newId } from "@/lib/mock/ids";
import { listNames } from "@/lib/format";
import { tagSchema, tagSlug } from "@/lib/validation/tag";
import { invalidate } from "./cache";
import { ApiError, notFound, nowIso, simulate } from "./http";
import { parsePatch } from "./patch";

export interface TagWithCount extends Tag {
  /** How many contacts carry the tag, counted at read time. */
  contactCount: number;
  /**
   * Why `update()` would refuse to rename the tag (an automation names it),
   * or unset. Read-time, never stored; recolouring is still allowed.
   */
  renameRefusal?: string;
}

/**
 * Every tag by name, each with how many contacts carry it. Counts are
 * derived on read rather than denormalised, so they cannot drift. It reads
 * the contacts and the tags with `Object.values`, so an e2e fault on either
 * table fails it.
 */
export async function list(): Promise<TagWithCount[]> {
  return simulate(
    () => {
      const { tags, contacts } = db.getState();
      const counts = new Map<ID, number>();
      for (const contact of Object.values(contacts)) {
        for (const tagId of contact.tagIds) {
          counts.set(tagId, (counts.get(tagId) ?? 0) + 1);
        }
      }
      return Object.values(tags)
        .map((tag) => {
          const row: TagWithCount = {
            ...tag,
            contactCount: counts.get(tag.id) ?? 0,
          };
          const refusal = automationRefusal(tag, "rename");
          if (refusal) row.renameRefusal = refusal.message;
          return row;
        })
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    { canFail: false },
  );
}

const INVALID_TAG = "INVALID_TAG";
const INVALID_TAG_FALLBACK = "Those tag details are not valid.";

/** What `create()` takes: the tag dialog's keys. */
export interface TagDraft {
  name: string;
  color: TagColor;
}

/** What `update()` saves: the name and the colour, and nothing else. */
export type TagPatch = Partial<TagDraft>;

/** Whether two names read the same, ignoring letter case. */
function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Throws 409 `NAME_TAKEN` (field `name`) when a tag other than `exceptId`
 * already has `name`, in any letter case: the tag picker would list two the
 * same. The tags are read through `Object.entries`, so an e2e tags read
 * fault leaves this write alone.
 */
function refuseTakenName(state: DbState, name: string, exceptId?: ID): void {
  const holder = Object.entries(state.tags)
    .map(([, t]) => t)
    .find((t) => t.id !== exceptId && sameName(t.name, name));
  if (holder) {
    throw new ApiError(
      `A tag named ${holder.name} already exists.`,
      409,
      "NAME_TAKEN",
      "name",
    );
  }
}

/** What a refused change would do to a tag an automation names. */
export type TagChange = "rename" | "remove" | "merge";

const CHANGE_WORDS: Record<TagChange, (name: string) => string> = {
  rename: (name) => `renaming ${name}`,
  remove: (name) => `removing ${name}`,
  merge: (name) => `merging ${name} into another tag`,
};

/**
 * Why `change` would be refused for `tag`, or nothing: 409
 * `NAMED_IN_AUTOMATION` while an automation names the tag (automations name
 * tags by name, `referencedKeys`). Automations are code staff cannot edit,
 * and renaming, removing or merging the tag away would leave the automation
 * resolving nothing (the integrity report turns red), so a developer
 * changes them first. The message names them. The one place the rule
 * lives: `update()` (on a rename), `remove()` and `merge()` (for the
 * source) throw it, and `list()`, `removalPreview()` and `mergePreview()`
 * report its message. Recolouring, and being merged into, are allowed.
 */
function automationRefusal(
  tag: Pick<Tag, "name">,
  change: TagChange,
): ApiError | undefined {
  const naming = Object.values(AUTOMATIONS)
    .filter((d) => referencedKeys(d).tags.includes(tag.name))
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b));
  if (naming.length === 0) return undefined;
  const one = naming.length === 1;
  return new ApiError(
    `${tag.name} is named in the ${listNames(naming)} ${
      one ? "automation" : "automations"
    }. Ask your developer to change ${one ? "it" : "them"} before ${CHANGE_WORDS[
      change
    ](tag.name)}.`,
    409,
    "NAMED_IN_AUTOMATION",
  );
}

/**
 * Adds a tag and returns it.
 *
 * Refusals write nothing: 422 `INVALID_TAG` (with `field`, name or color,
 * and the dialog's sentence, `tagSchema`), then 409 `NAME_TAKEN` (field
 * `name`) for a name another tag has in any letter case. Only the name
 * (trimmed) and the colour are saved; the slug comes from the name. One
 * write.
 */
export async function create(draft: TagDraft): Promise<Tag> {
  const tag = await simulate(() => {
    const values = parsePatch(
      tagSchema,
      { name: draft.name, color: draft.color },
      INVALID_TAG,
      INVALID_TAG_FALLBACK,
    );
    refuseTakenName(db.getState(), values.name);
    const at = nowIso();
    const record: Tag = {
      id: newId("tag"),
      name: values.name,
      slug: tagSlug(values.name),
      color: values.color,
      createdAt: at,
      updatedAt: at,
    };
    db.setState((s) => ({ tags: { ...s.tags, [record.id]: record } }));
    return record;
  });
  invalidate("tags");
  return tag;
}

/**
 * Renames and/or recolours a tag and returns it. An allow-list: the name
 * and the colour; the id, the slug (it follows the name), the timestamps
 * and every other key are ignored.
 *
 * Refusals write nothing, in order: 404 `NOT_FOUND`, 422 `INVALID_TAG`
 * (with `field`), 409 `NAMED_IN_AUTOMATION` when the name changes (in any
 * way, letter case included: automations match it exactly) on a tag an
 * automation names, 409 `NAME_TAKEN` (field `name`) for another tag's name
 * in any letter case. One write.
 */
export async function update(id: ID, patch: TagPatch): Promise<Tag> {
  const tag = await simulate(() => {
    const state = db.getState();
    const prev = state.tags[id] ?? notFound("Tag", id);
    const values = parsePatch(
      tagSchema,
      { name: patch.name ?? prev.name, color: patch.color ?? prev.color },
      INVALID_TAG,
      INVALID_TAG_FALLBACK,
    );
    if (values.name !== prev.name) {
      const refusal = automationRefusal(prev, "rename");
      if (refusal) throw refusal;
    }
    refuseTakenName(state, values.name, id);
    const next: Tag = {
      ...prev,
      name: values.name,
      slug: tagSlug(values.name),
      color: values.color,
      updatedAt: nowIso(),
    };
    db.setState((s) => ({ tags: { ...s.tags, [id]: next } }));
    return next;
  });
  invalidate("tags");
  return tag;
}

/**
 * Deletes a tag and takes it off every contact and deal
 * (`cascadeTagDelete`).
 *
 * - 404 `NOT_FOUND` for an unknown tag.
 * - 409 `NAMED_IN_AUTOMATION` while an automation names it.
 *
 * One simulated write: a refusal or a simulated failure changes nothing.
 */
export async function remove(id: ID): Promise<void> {
  await simulate(() => {
    const tag = db.getState().tags[id] ?? notFound("Tag", id);
    const refusal = automationRefusal(tag, "remove");
    if (refusal) throw refusal;
    db.setState((s) => cascadeTagDelete(s, id));
  });
  invalidate("tags", "contacts", "opportunities");
}

/**
 * Folds `sourceId` into `targetId`: every contact and deal tagged with the
 * source carries the target instead, and the source is deleted
 * (`cascadeTagMerge`). Returns the target, its `updatedAt` bumped, with its
 * contact count after the merge (counted in the same write, through
 * `Object.entries`).
 *
 * Refusals write nothing, in order: 404 `NOT_FOUND` for an unknown source,
 * 404 `NOT_FOUND` (field `targetId`) for an unknown target, 400
 * `MERGE_INTO_SELF`, 409 `NAMED_IN_AUTOMATION` while an automation names
 * the source (the target may be named). One simulated write.
 */
export async function merge(sourceId: ID, targetId: ID): Promise<TagWithCount> {
  const merged = await simulate(
    () => {
      const state = db.getState();
      const { source } = mergeTags(state, sourceId, targetId);
      const refusal = automationRefusal(source, "merge");
      if (refusal) throw refusal;
      const changes = cascadeTagMerge(state, sourceId, targetId);
      const target: Tag = { ...state.tags[targetId]!, updatedAt: nowIso() };
      db.setState({
        ...changes,
        tags: { ...changes.tags, [targetId]: target },
      });
      const contactCount = Object.entries(changes.contacts!).filter(([, c]) =>
        holdsTag(c, targetId),
      ).length;
      const row: TagWithCount = { ...target, contactCount };
      const renameRefusal = automationRefusal(target, "rename");
      if (renameRefusal) row.renameRefusal = renameRefusal.message;
      return row;
    },
    // No fixed `ms`: the merge takes the Demo Data latency like every other
    // write, so a slowed demo (and the e2e pending checks) slows it too.
  );
  invalidate("tags", "contacts", "opportunities");
  return merged;
}

/**
 * The two tags of a merge, or the refusal about its arguments: 404 for an
 * unknown source, 404 (field `targetId`) for an unknown target, 400
 * `MERGE_INTO_SELF`. `merge()` and `mergePreview()` share it.
 */
function mergeTags(
  state: DbState,
  sourceId: ID,
  targetId: ID,
): { source: Tag; target: Tag } {
  const source = state.tags[sourceId] ?? notFound("Tag", sourceId);
  const target = state.tags[targetId];
  if (!target) {
    throw new ApiError(
      "The tag picked to merge into no longer exists. Pick another one.",
      404,
      "NOT_FOUND",
      "targetId",
    );
  }
  if (sourceId === targetId) {
    throw new ApiError(
      `Pick another tag to merge ${source.name} into.`,
      400,
      "MERGE_INTO_SELF",
      "targetId",
    );
  }
  return { source, target };
}

/** What removing a tag would do, before anyone confirms. */
export interface TagRemovalPreview {
  /** How many contacts carry the tag (they lose it). */
  contacts: number;
  /** How many deals carry the tag (they lose it). */
  deals: number;
  /** Why `remove()` would refuse (an automation names it), if it would. */
  refusal?: string;
}

/**
 * What `remove(id)` would do now: how many contacts and deals lose the tag
 * (`countTaggedRecords`, the cascade's own test), or its refusal's
 * sentence. 404 `NOT_FOUND` for an unknown tag, as `remove()`. A read:
 * never fails on the Demo Data failure rate.
 */
export async function removalPreview(id: ID): Promise<TagRemovalPreview> {
  return simulate(
    () => {
      const state = db.getState();
      const tag = state.tags[id] ?? notFound("Tag", id);
      const preview: TagRemovalPreview = countTaggedRecords(state, id);
      const refusal = automationRefusal(tag, "remove");
      if (refusal) preview.refusal = refusal.message;
      return preview;
    },
    { canFail: false },
  );
}

/** What merging one tag into another would do, before anyone confirms. */
export interface TagMergePreview {
  /** How many contacts carry the source (they carry the target instead). */
  contacts: number;
  /** How many deals carry the source (they carry the target instead). */
  deals: number;
  /**
   * How many contacts carry the target after the merge: those tagged with
   * either, each once. Only when a target is given and nothing refuses.
   */
  contactsAfter?: number;
  /** Why `merge()` would refuse (an automation names the source), if so. */
  refusal?: string;
}

/**
 * What `merge(sourceId, targetId)` would do now: how many contacts and deals
 * carry the source, and how many contacts the target ends up on
 * (`countContactsAfterMerge`), or the refusal's sentence. Without a target,
 * only the source's counts and refusal, so a dialog can tell before a target
 * is picked. 404s and 400 `MERGE_INTO_SELF` as `merge()`. A read: never
 * fails on the Demo Data failure rate.
 */
export async function mergePreview(
  sourceId: ID,
  targetId?: ID,
): Promise<TagMergePreview> {
  return simulate(
    () => {
      const state = db.getState();
      const source =
        targetId === undefined
          ? (state.tags[sourceId] ?? notFound("Tag", sourceId))
          : mergeTags(state, sourceId, targetId).source;
      const preview: TagMergePreview = countTaggedRecords(state, sourceId);
      const refusal = automationRefusal(source, "merge");
      if (refusal) {
        preview.refusal = refusal.message;
      } else if (targetId !== undefined) {
        preview.contactsAfter = countContactsAfterMerge(
          state,
          sourceId,
          targetId,
        );
      }
      return preview;
    },
    { canFail: false },
  );
}
