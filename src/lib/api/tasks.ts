import type { ID, Task } from "@/types";
import { db } from "@/lib/mock/db";
import { newId } from "@/lib/mock/ids";
import { applyQuery } from "@/lib/mock/query-engine";
import { invalidate } from "./cache";
import {
  endOfTodayIso,
  notFound,
  nowIso,
  simulate,
  type ListQuery,
  type Page,
} from "./http";

export async function list(query: ListQuery = {}): Promise<Page<Task>> {
  return simulate(
    () =>
      applyQuery(Object.values(db.getState().tasks), query, {
        searchFields: ["title", "description"],
        defaultSort: [{ field: "dueAt", desc: false }],
      }),
    { canFail: false },
  );
}

/** Open tasks due today or earlier — the dashboard's "today" list. */
export async function listDue(limit = 8): Promise<Task[]> {
  return simulate(
    () => {
      const cutoff = endOfTodayIso();
      return Object.values(db.getState().tasks)
        .filter((t) => !t.completedAt && t.dueAt && t.dueAt <= cutoff)
        .sort((a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? ""))
        .slice(0, limit);
    },
    { canFail: false },
  );
}

export async function listForContact(contactId: ID): Promise<Task[]> {
  return simulate(
    () =>
      Object.values(db.getState().tasks)
        .filter((t) => t.contactId === contactId)
        .sort(
          (a, b) =>
            Number(Boolean(a.completedAt)) - Number(Boolean(b.completedAt)) ||
            (a.dueAt ?? "").localeCompare(b.dueAt ?? ""),
        ),
    { canFail: false },
  );
}

export type TaskDraft = Partial<Task> & Pick<Task, "title">;

export async function create(draft: TaskDraft): Promise<Task> {
  const task = await simulate(() => {
    const at = nowIso();
    const record: Task = {
      id: newId("task"),
      priority: "medium",
      assigneeId: db.getState().currentUserId,
      createdAt: at,
      updatedAt: at,
      ...draft,
    };
    db.setState((s) => ({ tasks: { ...s.tasks, [record.id]: record } }));
    return record;
  });
  invalidate("tasks", "activities");
  return task;
}

export async function update(id: ID, patch: Partial<Task>): Promise<Task> {
  const task = await simulate(() => {
    const prev = db.getState().tasks[id] ?? notFound("Task", id);
    const next: Task = {
      ...prev,
      ...patch,
      id,
      updatedAt: nowIso(),
    };
    db.setState((s) => ({ tasks: { ...s.tasks, [id]: next } }));
    return next;
  });
  invalidate("tasks", "activities");
  return task;
}

export async function setCompleted(id: ID, done: boolean): Promise<Task> {
  return update(id, {
    completedAt: done ? nowIso() : undefined,
  });
}

export async function remove(id: ID): Promise<void> {
  await simulate(() => {
    db.setState((s) => {
      const tasks = { ...s.tasks };
      delete tasks[id];
      return { tasks };
    });
  });
  invalidate("tasks");
}
