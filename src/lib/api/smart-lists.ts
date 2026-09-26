import type { ID, SmartList } from "@/types";
import { db } from "@/lib/mock/db";
import { newId } from "@/lib/mock/ids";
import { invalidate } from "./cache";
import { notFound, nowIso, simulate } from "./http";

export async function list(
  objectType: SmartList["objectType"] = "contact",
): Promise<SmartList[]> {
  return simulate(
    () =>
      Object.values(db.getState().smartLists)
        .filter((l) => l.objectType === objectType)
        .sort(
          (a, b) =>
            Number(b.isPinned) - Number(a.isPinned) ||
            a.name.localeCompare(b.name),
        ),
    { canFail: false },
  );
}

export async function get(id: ID): Promise<SmartList> {
  return simulate(
    () => db.getState().smartLists[id] ?? notFound("Smart list", id),
    { canFail: false },
  );
}

export type SmartListDraft = Omit<SmartList, "id" | "createdAt" | "updatedAt">;

export async function create(draft: SmartListDraft): Promise<SmartList> {
  const smartList = await simulate(() => {
    const at = nowIso();
    const record: SmartList = {
      ...draft,
      id: newId("sl"),
      createdAt: at,
      updatedAt: at,
    };
    db.setState((s) => ({
      smartLists: { ...s.smartLists, [record.id]: record },
    }));
    return record;
  });
  invalidate("smartLists");
  return smartList;
}

export async function update(
  id: ID,
  patch: Partial<SmartList>,
): Promise<SmartList> {
  const smartList = await simulate(() => {
    const prev = db.getState().smartLists[id] ?? notFound("Smart list", id);
    const next: SmartList = {
      ...prev,
      ...patch,
      id,
      updatedAt: nowIso(),
    };
    db.setState((s) => ({ smartLists: { ...s.smartLists, [id]: next } }));
    return next;
  });
  invalidate("smartLists");
  return smartList;
}

export async function remove(id: ID): Promise<void> {
  await simulate(() => {
    db.setState((s) => {
      const smartLists = { ...s.smartLists };
      delete smartLists[id];
      return { smartLists };
    });
  });
  invalidate("smartLists");
}
