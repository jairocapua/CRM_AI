import type { ID, Tag } from "@/types";
import { db } from "@/lib/mock/db";
import { newId } from "@/lib/mock/ids";
import { invalidate } from "./cache";
import { notFound, nowIso, simulate } from "./http";

export interface TagWithCount extends Tag {
  contactCount: number;
}

/** Counts are derived on read rather than denormalised, so they cannot drift. */
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
        .map((tag) => ({ ...tag, contactCount: counts.get(tag.id) ?? 0 }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    { canFail: false },
  );
}

export async function create(input: Pick<Tag, "name" | "color">): Promise<Tag> {
  const tag = await simulate(() => {
    const at = nowIso();
    const record: Tag = {
      id: newId("tag"),
      name: input.name,
      slug: input.name.toLowerCase().replace(/\s+/g, "-"),
      color: input.color,
      createdAt: at,
      updatedAt: at,
    };
    db.setState((s) => ({ tags: { ...s.tags, [record.id]: record } }));
    return record;
  });
  invalidate("tags");
  return tag;
}

export async function update(id: ID, patch: Partial<Tag>): Promise<Tag> {
  const tag = await simulate(() => {
    const prev = db.getState().tags[id] ?? notFound("Tag", id);
    const next: Tag = {
      ...prev,
      ...patch,
      id,
      updatedAt: nowIso(),
    };
    db.setState((s) => ({ tags: { ...s.tags, [id]: next } }));
    return next;
  });
  invalidate("tags", "contacts");
  return tag;
}

export async function remove(id: ID): Promise<void> {
  await simulate(() => {
    db.setState((s) => {
      const tags = { ...s.tags };
      delete tags[id];
      // Strip the tag from every contact, or saved filters match a tag that no
      // longer exists.
      const contacts = Object.fromEntries(
        Object.entries(s.contacts).map(([key, contact]) => [
          key,
          contact.tagIds.includes(id)
            ? { ...contact, tagIds: contact.tagIds.filter((t) => t !== id) }
            : contact,
        ]),
      );
      return { tags, contacts };
    });
  });
  invalidate("tags", "contacts");
}

/** Folds `sourceId` into `targetId`, then deletes the source. */
export async function merge(sourceId: ID, targetId: ID): Promise<void> {
  await simulate(
    () => {
      db.setState((s) => {
        const tags = { ...s.tags };
        delete tags[sourceId];
        const contacts = Object.fromEntries(
          Object.entries(s.contacts).map(([key, contact]) => {
            if (!contact.tagIds.includes(sourceId)) return [key, contact];
            const tagIds = [
              ...new Set(
                contact.tagIds.map((t) => (t === sourceId ? targetId : t)),
              ),
            ];
            return [key, { ...contact, tagIds }];
          }),
        );
        return { tags, contacts };
      });
    },
    { ms: 400 },
  );
  invalidate("tags", "contacts");
}
