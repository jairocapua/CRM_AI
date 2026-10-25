import type { SortingState } from "@tanstack/react-table";

import type {
  ID,
  ISODate,
  RunStatus,
  RunStepStatus,
  WorkflowRun,
} from "@/types";

/**
 * Plain-language copy for an automation's run history (`/automation/[id]`):
 * the table's status and duration, and the run sheet's per-step marks for
 * `AutomationStepList`. Pure functions over the `WorkflowRun` that
 * `api.workflows.listRuns` returns; dates are formatted by the caller, at the
 * render edge.
 */

/** Rows per page of run history. */
export const RUNS_PAGE_SIZE = 10;

/**
 * The run table's next sorting, given TanStack's. TanStack moves a clicked
 * column through its first direction, the other one, then unsorted; an ISO
 * string column's first direction is ascending. So a click on the default
 * newest-first header (descending) clears the sort, and unsorted the API
 * still sorts newest first while the header shows no arrow. A cleared sort
 * flips the previous direction instead, so the arrow always tells the
 * truth; any other sorting passes through.
 */
export function keepSortMarked(
  prev: SortingState,
  next: SortingState,
): SortingState {
  return next.length > 0 ? next : prev.map((s) => ({ ...s, desc: !s.desc }));
}

export interface RunStatusCopy {
  label: string;
  variant: "secondary" | "outline" | "destructive";
}

/**
 * How a run's status reads. A `never` check makes a new status a compile
 * error until it has words.
 */
export function runStatusCopy(status: RunStatus): RunStatusCopy {
  switch (status) {
    case "completed":
      return { label: "Completed", variant: "secondary" };
    case "failed":
      return { label: "Failed", variant: "destructive" };
    case "active":
      return { label: "Running", variant: "outline" };
    case "dropped":
      return { label: "Stopped", variant: "outline" };
    default: {
      const unknown: never = status;
      throw new Error(`Unknown run status: ${String(unknown)}`);
    }
  }
}

/**
 * Each step the run reached, by node id, with how it went: the `statuses`
 * `AutomationStepList` takes. A step the run never reached is not in it, so
 * the list shows no status there. Nor is the step a running run sits in (its
 * wait, logged `ok` with the detail "Waiting"): it has not finished, and
 * "Done" there would say it had.
 */
export function runStatuses(
  run: Pick<WorkflowRun, "status" | "steps">,
): Map<ID, RunStepStatus> {
  const finished = run.status === "active" ? run.steps.slice(0, -1) : run.steps;
  return new Map(finished.map((s) => [s.nodeId, s.status]));
}

/**
 * Each reached step's note for the run sheet: its detail and when it ran
 * ("SMS sent · 9:02 AM"), or just the time when it has no detail.
 * `formatAt` formats the ISO time at the render edge.
 */
export function runStepNotes(
  run: Pick<WorkflowRun, "steps">,
  formatAt: (at: ISODate) => string,
): Map<ID, string> {
  return new Map(
    run.steps.map((s) => [
      s.nodeId,
      s.detail ? `${s.detail} · ${formatAt(s.at)}` : formatAt(s.at),
    ]),
  );
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * A span of time, in its two largest units at most: "45 sec", "31 min",
 * "2 hr 5 min", "2 days 3 hr". Rounded down, never negative.
 */
export function formatSpan(ms: number): string {
  const span = Math.max(0, ms);
  if (span < MINUTE) return `${Math.floor(span / SECOND)} sec`;
  if (span < HOUR) return `${Math.floor(span / MINUTE)} min`;
  if (span < DAY) {
    const hours = Math.floor(span / HOUR);
    const minutes = Math.floor((span % HOUR) / MINUTE);
    return minutes > 0 ? `${hours} hr ${minutes} min` : `${hours} hr`;
  }
  const days = Math.floor(span / DAY);
  const hours = Math.floor((span % DAY) / HOUR);
  const dayText = `${days} ${days === 1 ? "day" : "days"}`;
  return hours > 0 ? `${dayText} ${hours} hr` : dayText;
}

/** How long a run took, or "In progress" while it has no end. */
export function runDuration(
  run: Pick<WorkflowRun, "startedAt" | "endedAt">,
): string {
  if (run.endedAt === undefined) return "In progress";
  return formatSpan(Date.parse(run.endedAt) - Date.parse(run.startedAt));
}
