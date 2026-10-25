import type {
  ActionKind,
  AuthoredActionConfig,
  AuthoredTriggerConfig,
  AutomationDefinition,
  ID,
  NodeCategory,
  StepList,
  TriggerKind,
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeConfig,
} from "@/types";

import { TRIGGER_NODE_ID, isBranchStep, type Step } from "./walk";

/**
 * Deterministic layout: an authored definition in, positioned nodes and edges
 * out. Hand-rolled rather than dagre/elk, because the shapes are a tree: a
 * chain that may end in a fork, whose branches are chains that may fork.
 *
 * Each step list is a column. A fork splits its column into one sub-column
 * per branch, sized by that branch's span (how many columns its subtree needs,
 * measured bottom-up), so a branch holding its own fork widens and pushes its
 * siblings aside instead of drawing through them. Every terminal, each branch
 * tail included, gets an emitted `end` pill: authors never write one.
 *
 * Pure and free of the mock store: `index.ts` runs it at import, so a
 * malformed definition throws there and fails `next build`.
 */

export const NODE_WIDTH = 260;
export const NODE_HEIGHT = 78;
/** Row pitch: a card plus the gap its incoming edge draws through. */
export const Y_STEP = 130;
/** Clear space between two side-by-side cards. */
export const GUTTER = 64;
/** Column pitch. */
export const X_PITCH = NODE_WIDTH + GUTTER;
/** `end` nodes are short pills, so two ends side by side on a fork stay quiet. */
export const END_WIDTH = 120;
export const END_HEIGHT = 40;

/**
 * A node's config as layout leaves it: authored configs still name tags and
 * users by key (`api.workflows` resolves them); forks and ends are final.
 */
export type LayoutConfig =
  | AuthoredTriggerConfig
  | AuthoredActionConfig
  | Extract<WorkflowNodeConfig, { kind: "if_else" | "end" }>;

export interface LayoutNode extends Omit<WorkflowNode, "config" | "stats"> {
  config: LayoutConfig;
}

export interface Layout {
  nodes: LayoutNode[];
  edges: WorkflowEdge[];
}

/** The emitted `end` node after `parentId`, the last node on its path. */
export const endNodeId = (parentId: ID) => `end:${parentId}`;

/** Exhaustive by type, so a new kind cannot be forgotten here. */
const TRIGGER_KINDS: Record<TriggerKind, true> = {
  form_submitted: true,
  tag_added: true,
  appointment_booked: true,
  opportunity_stage_changed: true,
  contact_created: true,
  inbound_message: true,
  birthday: true,
  manual: true,
};

const STEP_CATEGORY: Record<Exclude<ActionKind, "end">, NodeCategory> = {
  send_sms: "action",
  send_email: "action",
  wait: "logic",
  if_else: "logic",
  add_tag: "action",
  remove_tag: "action",
  assign_user: "action",
  create_task: "action",
  update_contact_field: "action",
  move_opportunity: "action",
  webhook: "action",
  internal_notification: "action",
};

const has = (record: object, key: string) =>
  Object.prototype.hasOwnProperty.call(record, key);

/** How many columns a step list's subtree needs: its fork's branches, summed. */
function span(steps: StepList): number {
  const last = (steps as Step[]).at(-1);
  if (!last || !isBranchStep(last)) return 1;
  const total = last.config.branches.reduce((sum, b) => sum + span(b.steps), 0);
  return Math.max(1, total);
}

export function layout(definition: AutomationDefinition): Layout {
  const fail = (problem: string): never => {
    throw new Error(`Cannot lay out "${definition.name}": ${problem}`);
  };

  const nodes: LayoutNode[] = [];
  const edges: WorkflowEdge[] = [];
  const ids = new Set<ID>();

  /** Places a node centred on `cx`, its top edge on `row`. */
  const place = (
    id: ID,
    label: string,
    config: LayoutConfig,
    category: NodeCategory,
    cx: number,
    row: number,
  ) => {
    if (ids.has(id)) fail(`node id "${id}" is used twice`);
    ids.add(id);
    const end = config.kind === "end";
    const width = end ? END_WIDTH : NODE_WIDTH;
    nodes.push({
      id,
      kind: config.kind,
      category,
      label,
      position: { x: cx - width / 2, y: row * Y_STEP },
      width,
      height: end ? END_HEIGHT : NODE_HEIGHT,
      config,
    });
  };

  const connect = (
    source: ID,
    target: ID,
    branch?: { id: ID; label: string },
  ) => {
    edges.push({
      id: `${source}->${target}`,
      source,
      target,
      ...(branch ? { sourceHandle: branch.id, label: branch.label } : {}),
    });
  };

  /**
   * Lays a step list down the column centred on `cx`, from `row`, after the
   * node `from`. A branch's first edge carries the branch as its handle.
   */
  const column = (
    steps: StepList,
    cx: number,
    row: number,
    from: ID,
    branch?: { id: ID; label: string },
  ) => {
    let previous = from;
    let via = branch;
    const list = steps as Step[];
    for (const [i, step] of list.entries()) {
      const kind: string = step.config.kind;
      if (!has(STEP_CATEGORY, kind)) {
        fail(`step "${step.id}" has unknown kind "${kind}"`);
      }
      if (!isBranchStep(step)) {
        place(
          step.id,
          step.label,
          step.config,
          STEP_CATEGORY[step.config.kind],
          cx,
          row,
        );
        connect(previous, step.id, via);
        previous = step.id;
        via = undefined;
        row += 1;
        continue;
      }

      const next = list[i + 1];
      if (next) fail(`step "${next.id}" follows the branch "${step.id}"`);
      const { branches } = step.config;
      if (branches.length === 0) fail(`"${step.id}" has no branches`);
      for (const b of branches) {
        if (b.steps.length === 0) {
          fail(`branch "${b.label}" of "${step.id}" has no steps`);
        }
      }

      place(
        step.id,
        step.label,
        {
          kind: "if_else",
          branches: branches.map((b) => ({
            id: b.id,
            label: b.label,
            filter: b.filter,
          })),
        },
        "logic",
        cx,
        row,
      );
      connect(previous, step.id, via);

      // Branch sub-columns, side by side, centred as a group under the fork.
      let left = cx - (span(steps) * X_PITCH) / 2;
      for (const b of branches) {
        const width = span(b.steps) * X_PITCH;
        column(b.steps, left + width / 2, row + 1, step.id, b);
        left += width;
      }
      return;
    }
    place(endNodeId(previous), "End", { kind: "end" }, "logic", cx, row);
    connect(previous, endNodeId(previous), via);
  };

  const trigger = definition.trigger;
  if (!has(TRIGGER_KINDS, trigger.config.kind)) {
    fail(`trigger has unknown kind "${trigger.config.kind}"`);
  }
  place(TRIGGER_NODE_ID, trigger.label, trigger.config, "trigger", 0, 0);
  column(definition.steps, 0, 1, TRIGGER_NODE_ID);

  // Shift so the leftmost box starts at x = 0.
  const minX = Math.min(...nodes.map((n) => n.position.x));
  for (const n of nodes) n.position.x -= minX;
  return { nodes, edges };
}
