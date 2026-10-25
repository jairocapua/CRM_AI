import type {
  AuthoredActionConfig,
  AuthoredTriggerConfig,
  AutomationDefinition,
  ID,
  StepList,
  Workflow,
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeConfig,
} from "@/types";
import { AUTOMATIONS } from "@/lib/automations";
import { TRIGGER_NODE_ID, type Step } from "@/lib/automations/walk";
import { db } from "@/lib/mock/db";
import { notFound, nowIso, simulate } from "./http";

/**
 * Automations are developer-written code (`src/lib/automations/`), so this
 * module only reads. It still sits behind the seam: against a real backend
 * these become `fetch()` calls and no component changes.
 */

export async function list(): Promise<Workflow[]> {
  return simulate(
    () => {
      const lookup = lookups();
      return Object.values(AUTOMATIONS)
        .map((definition) => resolve(definition, lookup))
        .sort(
          (a, b) =>
            (a.folder ?? "").localeCompare(b.folder ?? "") ||
            a.name.localeCompare(b.name),
        );
    },
    { canFail: false },
  );
}

export async function get(id: ID): Promise<Workflow> {
  return simulate(
    () => {
      const definition =
        Object.values(AUTOMATIONS).find((d) => d.id === id) ??
        notFound("Workflow", id);
      return resolve(definition, lookups());
    },
    { canFail: false },
  );
}

// ---------------------------------------------------------------------------
// Resolution: stable keys -> ids, authored steps -> nodes and edges.
// ---------------------------------------------------------------------------

interface Lookups {
  tagIds: (names: readonly string[]) => ID[];
  userIds: (slugs: readonly string[]) => ID[];
  userId: (slug: string | undefined) => ID | undefined;
  /** When the world was seeded: the closest thing code has to a timestamp. */
  at: string;
}

/**
 * Tag names and user slugs, mapped to the current world's ids. A key that
 * matches nothing is dropped rather than turned into a made-up id; the
 * integrity report lists it.
 */
function lookups(): Lookups {
  const { tags, users, seededAt } = db.getState();
  const tagIdByName = new Map(Object.values(tags).map((t) => [t.name, t.id]));
  const userIdBySlug = new Map(Object.values(users).map((u) => [u.slug, u.id]));
  const userId = (slug: string | undefined) =>
    slug === undefined ? undefined : userIdBySlug.get(slug);
  return {
    tagIds: (names) =>
      names.flatMap((name) => {
        const id = tagIdByName.get(name);
        return id ? [id] : [];
      }),
    userIds: (slugs) =>
      slugs.flatMap((slug) => {
        const id = userId(slug);
        return id ? [id] : [];
      }),
    userId,
    at: seededAt ?? nowIso(),
  };
}

function triggerConfig(
  c: AuthoredTriggerConfig,
  lookup: Lookups,
): WorkflowNodeConfig {
  if (c.kind === "tag_added") {
    return { kind: "tag_added", tagIds: lookup.tagIds(c.tags) };
  }
  return structuredClone(c);
}

function actionConfig(
  c: AuthoredActionConfig,
  lookup: Lookups,
): WorkflowNodeConfig {
  switch (c.kind) {
    case "add_tag":
    case "remove_tag":
      return { kind: c.kind, tagIds: lookup.tagIds(c.tags) };
    case "assign_user":
      return {
        kind: "assign_user",
        strategy: c.strategy,
        userIds: lookup.userIds(c.users),
      };
    case "internal_notification":
      return {
        kind: "internal_notification",
        userIds: lookup.userIds(c.users),
        body: c.body,
      };
    case "send_email": {
      const { fromUser, ...rest } = c;
      const fromUserId = lookup.userId(fromUser);
      return fromUserId ? { ...rest, fromUserId } : { ...rest };
    }
    case "create_task": {
      const { assignee, ...rest } = c;
      const assigneeId = lookup.userId(assignee);
      return assigneeId ? { ...rest, assigneeId } : { ...rest };
    }
    default:
      return structuredClone(c);
  }
}

// Interim geometry: one column, one row per node. P8-T02's layout.ts replaces
// this with a real tree layout and emits `end` nodes at every terminal.
const NODE_WIDTH = 260;
const NODE_HEIGHT = 78;
const Y_STEP = 130;

interface BranchRef {
  id: ID;
  label: string;
}

function graph(
  definition: AutomationDefinition,
  lookup: Lookups,
): { nodes: WorkflowNode[]; edges: WorkflowEdge[] } {
  const nodes: WorkflowNode[] = [];
  const edges: WorkflowEdge[] = [];

  const place = (
    id: ID,
    label: string,
    config: WorkflowNodeConfig,
    category: WorkflowNode["category"],
  ) => {
    nodes.push({
      id,
      kind: config.kind,
      category,
      label,
      position: { x: 0, y: nodes.length * Y_STEP },
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      config,
    });
  };

  const connect = (source: ID, target: ID, branch?: BranchRef) => {
    edges.push({
      id: `${source}->${target}`,
      source,
      target,
      ...(branch ? { sourceHandle: branch.id, label: branch.label } : {}),
    });
  };

  /** Places a step list after `from`; the first edge of a branch carries it. */
  const walk = (steps: StepList, from: ID, branch?: BranchRef) => {
    let previous = from;
    let via = branch;
    for (const step of steps as Step[]) {
      if (step.config.kind === "if_else") {
        place(
          step.id,
          step.label,
          {
            kind: "if_else",
            branches: step.config.branches.map((b) => ({
              id: b.id,
              label: b.label,
              filter: structuredClone(b.filter),
            })),
          },
          "logic",
        );
        connect(previous, step.id, via);
        for (const b of step.config.branches) {
          walk(b.steps, step.id, { id: b.id, label: b.label });
        }
        return;
      }
      const config = actionConfig(step.config, lookup);
      place(
        step.id,
        step.label,
        config,
        config.kind === "wait" ? "logic" : "action",
      );
      connect(previous, step.id, via);
      previous = step.id;
      via = undefined;
    }
  };

  place(
    TRIGGER_NODE_ID,
    definition.trigger.label,
    triggerConfig(definition.trigger.config, lookup),
    "trigger",
  );
  walk(definition.steps, TRIGGER_NODE_ID);
  return { nodes, edges };
}

function resolve(definition: AutomationDefinition, lookup: Lookups): Workflow {
  const { nodes, edges } = graph(definition, lookup);
  const ownerId = lookup.userId(definition.owner);
  return {
    id: definition.id,
    name: definition.name,
    description: definition.description,
    folder: definition.folder,
    status: definition.status,
    ...(ownerId ? { ownerId } : {}),
    nodes,
    edges,
    settings: { ...definition.settings },
    // Real counts arrive with run history (P8-T06); never faked here.
    stats: { enrolled: 0, active: 0, completed: 0 },
    createdAt: lookup.at,
    updatedAt: lookup.at,
  };
}
