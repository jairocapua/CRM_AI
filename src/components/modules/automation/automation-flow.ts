import type { Edge, Node } from "@xyflow/react";

import type {
  ID,
  NodeCategory,
  Workflow,
  WorkflowNode,
  WorkflowNodeKind,
} from "@/types";

import { stepSummary, type StepNames } from "./automation-steps";

/**
 * What the read-only diagram (`automation-graph.tsx`) draws, as pure data:
 * a `Workflow`'s nodes and edges turned into React Flow's, and the canvas
 * height. Kept out of the component (and free of React Flow at runtime: the
 * import above is types only) so it is unit-tested and costs the detail
 * page nothing until the diagram loads.
 */

/** A fork's path as its node draws it: one source handle per branch. */
export interface FlowBranch {
  /** The branch id: the handle id, and the branch edge's `sourceHandle`. */
  id: ID;
  label: string;
}

export interface AutomationNodeData extends Record<string, unknown> {
  kind: WorkflowNodeKind;
  category: NodeCategory;
  label: string;
  /** One line saying what the step does (`stepSummary`). */
  summary: string;
  /** A fork's branches, left to right in authored order; otherwise empty. */
  branches: FlowBranch[];
}

/** A step card, or the short pill an emitted `end` node is drawn as. */
export type AutomationFlowNode = Node<AutomationNodeData, "step" | "end">;

/**
 * Fit padding: `fitView` leaves this share of the graph's size as margin
 * (React Flow divides the canvas by the graph's size × (1 + padding)).
 */
export const FIT_PADDING = 0.2;
/** The zoom the canvas height aims for, so card text stays readable. */
export const TARGET_ZOOM = 0.8;
export const CANVAS_MIN_HEIGHT = 320;
export const CANVAS_MAX_HEIGHT = 720;

/** Branch labels, sized like the nodes' summaries once zoomed out. */
const EDGE_LABEL_STYLE = { fontSize: 13, fontWeight: 500 };

export function flowElements(
  workflow: Pick<Workflow, "nodes" | "edges">,
  names: StepNames,
): { nodes: AutomationFlowNode[]; edges: Edge[] } {
  const labels = new Map(workflow.nodes.map((n) => [n.id, n.label]));

  const nodes = workflow.nodes.map((n: WorkflowNode): AutomationFlowNode => ({
    id: n.id,
    type: n.kind === "end" ? "end" : "step",
    position: { x: n.position.x, y: n.position.y },
    // Fixed dimensions: React Flow sizes the node box from them, so the
    // first paint and fitView use the laid-out boxes, not a guess.
    width: n.width,
    height: n.height,
    data: {
      kind: n.kind,
      category: n.category,
      label: n.label,
      summary: stepSummary(n, names),
      branches:
        n.config.kind === "if_else"
          ? n.config.branches.map((b) => ({ id: b.id, label: b.label }))
          : [],
    },
  }));

  const edges = workflow.edges.map((e): Edge => {
    const from = labels.get(e.source) ?? "a step";
    const to = labels.get(e.target) ?? "a step";
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      ...(e.sourceHandle ? { sourceHandle: e.sourceHandle } : {}),
      ...(e.label ? { label: e.label } : {}),
      type: "smoothstep",
      // A static diagram: nothing flows along the edges.
      animated: false,
      ariaLabel: `From ${from} to ${to}${e.label ? `, if ${e.label}` : ""}`,
      labelStyle: EDGE_LABEL_STYLE,
      labelBgPadding: [6, 3],
      labelBgBorderRadius: 4,
    };
  });

  return { nodes, edges };
}

/**
 * Where a fork's i-th of n branch handles sits along its bottom edge, as a
 * CSS `left`: evenly spread, in order, so each branch leaves on the side its
 * column is laid out on.
 */
export function branchHandleLeft(index: number, count: number): string {
  return `${((index + 0.5) / count) * 100}%`;
}

/**
 * The canvas height for a graph: tall enough that `fitView` lands near
 * `TARGET_ZOOM`, within fixed bounds so a long automation cannot take over
 * the page and a short one never collapses. An explicit height, because
 * React Flow draws nothing in a parent without one.
 */
export function canvasHeight(
  nodes: readonly { position: { y: number }; height: number }[],
): number {
  if (nodes.length === 0) return CANVAS_MIN_HEIGHT;
  const top = Math.min(...nodes.map((n) => n.position.y));
  const bottom = Math.max(...nodes.map((n) => n.position.y + n.height));
  const ideal = Math.round((bottom - top) * (1 + FIT_PADDING) * TARGET_ZOOM);
  return Math.min(CANVAS_MAX_HEIGHT, Math.max(CANVAS_MIN_HEIGHT, ideal));
}
