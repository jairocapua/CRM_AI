"use client";

import { useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  type NodeTypes,
} from "@xyflow/react";

import type { Workflow } from "@/types";

import { FIT_PADDING, flowElements } from "./automation-flow";
import { EndNode, StepNode } from "./automation-node";
import type { StepNames } from "./automation-steps";

/**
 * At module scope, so the object never changes: React Flow re-creates
 * every node (and warns) when `nodeTypes` is a new object on a render.
 */
const NODE_TYPES = { step: StepNode, end: EndNode } satisfies NodeTypes;

const FIT_VIEW_OPTIONS = { padding: FIT_PADDING, maxZoom: 1 };

/**
 * An automation as a read-only React Flow diagram (design §5). Staff can pan
 * it and zoom with the Controls, nothing else: no dragging, connecting,
 * selecting or focusing nodes. `disableKeyboardA11y` too: without it every
 * node is `aria-describedby` React Flow's hidden "press enter or space to
 * select a node ... arrow keys to move ... delete to remove" text and an
 * assertive live region is mounted, telling screen-reader users to do things
 * this diagram cannot do. The wheel is left to the page
 * (`zoomOnScroll={false}` with `preventScrolling={false}`), so scrolling with
 * the cursor over the diagram scrolls the page instead of trapping it.
 *
 * It fits the graph every time it mounts and ignores `Workflow.viewport`
 * (an editor's "resume where you left off"). No MiniMap: a fitted graph of a
 * dozen nodes does not need one. The attribution stays (only a React Flow Pro
 * subscription may hide it); globals.css de-emphasises it.
 *
 * Colours come from the theme through the `--xy-*` bridge in globals.css and
 * the nodes' own Tailwind tokens, so the diagram follows dark mode.
 *
 * Loaded on demand (`next/dynamic` in automation-detail.tsx), and mounted
 * only on screens 768px and wider; the step list is the accessible form.
 * The parent must give it a height: React Flow draws nothing without one.
 */
export default function AutomationGraph({
  workflow,
  names,
}: {
  workflow: Pick<Workflow, "nodes" | "edges">;
  names: StepNames;
}) {
  const { nodes, edges } = useMemo(
    () => flowElements(workflow, names),
    [workflow, names],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      nodesDraggable={false}
      nodesConnectable={false}
      edgesReconnectable={false}
      elementsSelectable={false}
      nodesFocusable={false}
      edgesFocusable={false}
      disableKeyboardA11y
      panOnDrag
      zoomOnScroll={false}
      preventScrolling={false}
      zoomOnDoubleClick={false}
      minZoom={0.2}
      fitView
      fitViewOptions={FIT_VIEW_OPTIONS}
    >
      <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}
