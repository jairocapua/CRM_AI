import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

import { cn } from "@/lib/utils";

import { branchHandleLeft, type AutomationFlowNode } from "./automation-flow";
import { CATEGORY_TILE, StepIcon } from "./automation-icons";

/**
 * The diagram's custom nodes (`automation-graph.tsx`). Read-only: the
 * handles exist only so edges have somewhere to attach, so they are
 * invisible and never connectable. `opacity-0`, not `hidden`: React Flow
 * measures handle boxes to route edges, and `display: none` has none.
 */
const HANDLE = "opacity-0";

/**
 * A step card: kind icon, label and a one-line summary. Type is a step
 * larger than the step list's: fitView draws the diagram at about 0.7x.
 */
export const StepNode = memo(function StepNode({
  data,
}: NodeProps<AutomationFlowNode>) {
  const { kind, category, label, summary, branches } = data;
  return (
    <div
      data-kind={kind}
      className="flex size-full items-center gap-3 rounded-lg border bg-card px-3 text-card-foreground shadow-xs"
    >
      {category === "trigger" ? null : (
        <Handle
          type="target"
          position={Position.Top}
          isConnectable={false}
          className={HANDLE}
        />
      )}
      <span
        aria-hidden
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-md",
          CATEGORY_TILE[category],
        )}
      >
        <StepIcon kind={kind} className="size-5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="truncate text-base font-medium">{label}</span>
          {category === "trigger" ? (
            <span className="shrink-0 text-sm text-muted-foreground">
              Trigger
            </span>
          ) : null}
        </div>
        <p className="truncate text-sm text-muted-foreground" title={summary}>
          {summary}
        </p>
      </div>
      {branches.length > 0 ? (
        // A fork: one handle per branch, keyed by branch id, so each branch
        // edge (sourceHandle = branch id) leaves from its own side.
        branches.map((b, i) => (
          <Handle
            key={b.id}
            id={b.id}
            type="source"
            position={Position.Bottom}
            isConnectable={false}
            className={HANDLE}
            style={{ left: branchHandleLeft(i, branches.length) }}
          />
        ))
      ) : (
        <Handle
          type="source"
          position={Position.Bottom}
          isConnectable={false}
          className={HANDLE}
        />
      )}
    </div>
  );
});

/** An emitted `end` node: a short pill, so two ends on a fork stay quiet. */
export const EndNode = memo(function EndNode({
  data,
}: NodeProps<AutomationFlowNode>) {
  return (
    <div
      data-kind={data.kind}
      className="flex size-full items-center justify-center gap-1.5 rounded-full border bg-card text-sm font-medium text-muted-foreground"
    >
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={false}
        className={HANDLE}
      />
      <StepIcon kind={data.kind} className="size-4" />
      {data.label}
    </div>
  );
});
