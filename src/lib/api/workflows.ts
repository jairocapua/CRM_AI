import type { ID, Workflow, WorkflowNode, WorkflowStatus } from "@/types";
import { db } from "@/lib/mock/db";
import { newId } from "@/lib/mock/ids";
import { invalidate } from "./cache";
import { notFound, nowIso, simulate } from "./http";

export async function list(): Promise<Workflow[]> {
  return simulate(
    () =>
      Object.values(db.getState().workflows).sort(
        (a, b) =>
          (a.folder ?? "").localeCompare(b.folder ?? "") ||
          a.name.localeCompare(b.name),
      ),
    { canFail: false },
  );
}

export async function get(id: ID): Promise<Workflow> {
  return simulate(
    () => db.getState().workflows[id] ?? notFound("Workflow", id),
    { canFail: false },
  );
}

export async function create(name: string): Promise<Workflow> {
  const workflow = await simulate(() => {
    const at = nowIso();
    const trigger: WorkflowNode = {
      id: newId("node"),
      kind: "manual",
      category: "trigger",
      label: "Manual trigger",
      position: { x: 0, y: 0 },
      width: 260,
      height: 78,
      config: { kind: "manual" },
    };
    const record: Workflow = {
      id: newId("wf"),
      name,
      status: "draft",
      nodes: [trigger],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      settings: { allowMultipleEnrollment: false, stopOnReply: true },
      stats: { enrolled: 0, active: 0, completed: 0 },
      createdAt: at,
      updatedAt: at,
    };
    db.setState((s) => ({
      workflows: { ...s.workflows, [record.id]: record },
    }));
    return record;
  });
  invalidate("workflows");
  return workflow;
}

/**
 * Saves the canvas. Called from a debounced autosave, so it deliberately keeps
 * latency low and never simulates failure — losing a graph edit to a fake
 * network error would be maddening rather than instructive.
 */
export async function update(
  id: ID,
  patch: Partial<Workflow>,
): Promise<Workflow> {
  const workflow = await simulate(
    () => {
      const prev = db.getState().workflows[id] ?? notFound("Workflow", id);
      const next: Workflow = { ...prev, ...patch, id, updatedAt: nowIso() };
      db.setState((s) => ({ workflows: { ...s.workflows, [id]: next } }));
      return next;
    },
    { ms: 120, canFail: false },
  );
  invalidate("workflows");
  return workflow;
}

export async function setStatus(
  id: ID,
  status: WorkflowStatus,
): Promise<Workflow> {
  return update(id, {
    status,
    publishedAt: status === "published" ? nowIso() : undefined,
  });
}

export async function duplicate(id: ID): Promise<Workflow> {
  const workflow = await simulate(
    () => {
      const prev = db.getState().workflows[id] ?? notFound("Workflow", id);
      const at = nowIso();

      // Node and edge ids must be remapped, or the copy shares identity with
      // the original and editing one moves nodes in the other.
      const idMap = new Map(prev.nodes.map((n) => [n.id, newId("node")]));
      const nodes = prev.nodes.map((n) => ({ ...n, id: idMap.get(n.id)! }));
      const edges = prev.edges.map((e) => ({
        ...e,
        id: newId("edge"),
        source: idMap.get(e.source) ?? e.source,
        target: idMap.get(e.target) ?? e.target,
      }));

      const record: Workflow = {
        ...prev,
        id: newId("wf"),
        name: `${prev.name} (copy)`,
        status: "draft",
        nodes,
        edges,
        stats: { enrolled: 0, active: 0, completed: 0 },
        publishedAt: undefined,
        createdAt: at,
        updatedAt: at,
      };
      db.setState((s) => ({
        workflows: { ...s.workflows, [record.id]: record },
      }));
      return record;
    },
    { ms: 380 },
  );
  invalidate("workflows");
  return workflow;
}

export async function remove(id: ID): Promise<void> {
  await simulate(() => {
    db.setState((s) => {
      const workflows = { ...s.workflows };
      delete workflows[id];
      return { workflows };
    });
  });
  invalidate("workflows");
}
