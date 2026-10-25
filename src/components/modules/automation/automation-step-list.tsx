import { useId } from "react";

import type { ID, RunStepStatus, Workflow } from "@/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { CATEGORY_TILE, StepIcon } from "./automation-icons";
import {
  RUN_STEP_STATUS_COPY,
  stepSummary,
  stepTree,
  type BranchItem,
  type StepItem,
  type StepNames,
} from "./automation-steps";

const STATUS_BADGE: Record<
  RunStepStatus,
  "secondary" | "outline" | "destructive"
> = {
  ok: "secondary",
  skipped: "outline",
  failed: "destructive",
};

/**
 * An automation as a nested ordered list: the trigger, then each step in
 * order, a fork closing its list with one nested list per branch, each
 * named by its branch label ("Replied", "No reply"). Every path ends with
 * its emitted `End` step, so a run log can mark where a contact finished.
 *
 * This is the automation's accessible form and its only form below 768px
 * (design §5): a screen reader hears "then, and if X then Y" in order, which
 * the diagram cannot give it. Built from the `Workflow`'s nodes and edges,
 * so it works behind any backend.
 *
 * `statuses` decorates steps by node id with how a run went (the run
 * sheet); without it the list is the plain definition. `notes` adds a line
 * under a step, by node id (the run sheet's "SMS sent · 9:02 AM"). Both are
 * read-only marks: a step with neither reads as in the definition.
 */
export function AutomationStepList({
  workflow,
  names,
  statuses,
  notes,
  labelledBy,
}: {
  workflow: Pick<Workflow, "nodes" | "edges">;
  names: StepNames;
  statuses?: ReadonlyMap<ID, RunStepStatus>;
  notes?: ReadonlyMap<ID, string>;
  /** Id of the heading that names the list. */
  labelledBy?: string;
}) {
  return (
    <Steps
      items={stepTree(workflow)}
      names={names}
      marks={{ statuses, notes }}
      labelledBy={labelledBy}
    />
  );
}

/** A run's marks on the list, by node id. */
interface Marks {
  statuses?: ReadonlyMap<ID, RunStepStatus>;
  notes?: ReadonlyMap<ID, string>;
}

function Steps({
  items,
  names,
  marks,
  labelledBy,
}: {
  items: StepItem[];
  names: StepNames;
  marks: Marks;
  labelledBy?: string;
}) {
  return (
    <ol aria-labelledby={labelledBy} className="flex flex-col gap-2">
      {items.map((item) => (
        <li
          key={item.node.id}
          data-step-id={item.node.id}
          className="flex flex-col gap-2"
        >
          <StepRow
            item={item}
            names={names}
            status={marks.statuses?.get(item.node.id)}
            note={marks.notes?.get(item.node.id)}
          />
          {item.branches.length > 0 ? (
            <div className="grid gap-3 border-l-2 border-dashed pl-3 sm:grid-cols-2 sm:border-l-0 sm:pl-0">
              {item.branches.map((branch) => (
                <Branch
                  key={branch.id}
                  branch={branch}
                  names={names}
                  marks={marks}
                />
              ))}
            </div>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function StepRow({
  item: { node },
  names,
  status,
  note,
}: {
  item: StepItem;
  names: StepNames;
  status?: RunStepStatus;
  note?: string;
}) {
  const summary = stepSummary(node, names);

  if (node.kind === "end") {
    return (
      <div
        data-status={status}
        className="flex items-center gap-2 px-1 text-xs text-muted-foreground"
      >
        <StepIcon kind={node.kind} className="size-3.5" />
        <span className="font-medium">{node.label}</span>
        <span className="sr-only">: {summary}</span>
        {status ? <StatusBadge status={status} /> : null}
        {note ? <span>{note}</span> : null}
      </div>
    );
  }

  return (
    <div
      data-status={status}
      className="flex items-start gap-3 rounded-lg border bg-card p-3 text-sm"
    >
      <span
        aria-hidden
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-md",
          CATEGORY_TILE[node.category],
        )}
      >
        <StepIcon kind={node.kind} className="size-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{node.label}</span>
          {node.category === "trigger" ? (
            <span className="text-xs text-muted-foreground">Trigger</span>
          ) : null}
          {status ? <StatusBadge status={status} /> : null}
        </div>
        <p className="text-muted-foreground wrap-break-word">{summary}</p>
        {note ? (
          <p className="text-xs text-muted-foreground wrap-break-word">
            {note}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Branch({
  branch,
  names,
  marks,
}: {
  branch: BranchItem;
  names: StepNames;
  marks: Marks;
}) {
  const labelId = useId();
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p id={labelId} className="text-xs font-medium text-muted-foreground">
        {branch.label}
      </p>
      {branch.steps.length > 0 ? (
        <Steps
          items={branch.steps}
          names={names}
          marks={marks}
          labelledBy={labelId}
        />
      ) : (
        <p className="text-xs text-muted-foreground">No steps on this path.</p>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: RunStepStatus }) {
  return (
    <Badge variant={STATUS_BADGE[status]}>{RUN_STEP_STATUS_COPY[status]}</Badge>
  );
}
