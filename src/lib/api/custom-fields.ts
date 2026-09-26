import type { CustomField, ID } from "@/types";
import { db } from "@/lib/mock/db";
import { newId } from "@/lib/mock/ids";
import { invalidate } from "./cache";
import { notFound, nowIso, simulate } from "./http";

export async function list(
  objectType?: CustomField["objectType"],
): Promise<CustomField[]> {
  return simulate(
    () =>
      Object.values(db.getState().customFields)
        .filter((f) => !objectType || f.objectType === objectType)
        .sort((a, b) => a.position - b.position),
    { canFail: false },
  );
}

export type CustomFieldDraft = Omit<
  CustomField,
  "id" | "createdAt" | "updatedAt" | "position" | "key"
> & { key?: string };

export async function create(draft: CustomFieldDraft): Promise<CustomField> {
  const field = await simulate(() => {
    const at = nowIso();
    const siblings = Object.values(db.getState().customFields).filter(
      (f) => f.objectType === draft.objectType,
    );
    const record: CustomField = {
      ...draft,
      /**
       * A stable machine key derived from the label. Values are stored under
       * this key, so renaming the label later does not orphan the data.
       */
      key: draft.key ?? draft.label.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
      id: newId("cf"),
      position: siblings.length,
      createdAt: at,
      updatedAt: at,
    };
    db.setState((s) => ({
      customFields: { ...s.customFields, [record.id]: record },
    }));
    return record;
  });
  invalidate("customFields", "contacts");
  return field;
}

export async function update(
  id: ID,
  patch: Partial<CustomField>,
): Promise<CustomField> {
  const field = await simulate(() => {
    const prev = db.getState().customFields[id] ?? notFound("Custom field", id);
    const next: CustomField = {
      ...prev,
      ...patch,
      id,
      updatedAt: nowIso(),
    };
    db.setState((s) => ({ customFields: { ...s.customFields, [id]: next } }));
    return next;
  });
  invalidate("customFields");
  return field;
}

export async function remove(id: ID): Promise<void> {
  await simulate(() => {
    db.setState((s) => {
      const customFields = { ...s.customFields };
      delete customFields[id];
      return { customFields };
    });
  });
  invalidate("customFields", "contacts");
}

/** Persists a drag-reordered list in a single write. */
export async function reorder(orderedIds: ID[]): Promise<void> {
  await simulate(() => {
    db.setState((s) => {
      const customFields = { ...s.customFields };
      orderedIds.forEach((id, position) => {
        const field = customFields[id];
        if (field) customFields[id] = { ...field, position };
      });
      return { customFields };
    });
  });
  invalidate("customFields");
}
