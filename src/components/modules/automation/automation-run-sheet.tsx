"use client";

import { useId, useMemo } from "react";
import Link from "next/link";
import { format } from "date-fns";

import type { WorkflowRunRow } from "@/lib/api";
import type { ISODate, Workflow } from "@/types";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { toDate } from "@/lib/format";

import {
  runDuration,
  runStatusCopy,
  runStatuses,
  runStepNotes,
} from "./automation-runs";
import { AutomationStepList } from "./automation-step-list";
import type { StepNames } from "./automation-steps";

/** "Sep 3, 2026, 9:02 AM": a run's start and end. */
const formatRunTime = (at: ISODate) =>
  format(toDate(at), "MMM d, yyyy, h:mm a");

/** "Sep 3, 9:02 AM": when a step ran, under the step. */
const formatStepTime = (at: ISODate) => format(toDate(at), "MMM d, h:mm a");

/**
 * One run, opened from the run history table: who went through the
 * automation (a link to their contact page), how it went, when, why it
 * failed, and the automation's steps marked with how each one went. A step
 * the run never reached has no mark. Read-only: staff can only look.
 *
 * `run` stays set while the sheet animates closed, so its content does not
 * blank out on the way.
 */
export function AutomationRunSheet({
  run,
  open,
  onOpenChange,
  workflow,
  names,
}: {
  run: WorkflowRunRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflow: Pick<Workflow, "name" | "nodes" | "edges">;
  names: StepNames;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-lg">
        {run ? (
          <RunSheetBody run={run} workflow={workflow} names={names} />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function RunSheetBody({
  run,
  workflow,
  names,
}: {
  run: WorkflowRunRow;
  workflow: Pick<Workflow, "name" | "nodes" | "edges">;
  names: StepNames;
}) {
  const stepsHeadingId = useId();
  const status = runStatusCopy(run.status);
  const statuses = useMemo(() => runStatuses(run), [run]);
  const notes = useMemo(() => runStepNotes(run, formatStepTime), [run]);

  return (
    <>
      <SheetHeader className="pr-12">
        <SheetTitle>
          Run for {run.contactName ?? "an unknown contact"}
        </SheetTitle>
        <SheetDescription>{workflow.name}</SheetDescription>
      </SheetHeader>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Contact</dt>
          <dd>
            {run.contactName ? (
              <Link
                href={`/contacts/${run.contactId}`}
                className="font-medium underline underline-offset-4 hover:decoration-2"
              >
                {run.contactName}
              </Link>
            ) : (
              <span className="text-muted-foreground">Unknown contact</span>
            )}
          </dd>
          <dt className="text-muted-foreground">Status</dt>
          <dd>
            <Badge variant={status.variant}>{status.label}</Badge>
          </dd>
          <dt className="text-muted-foreground">Started</dt>
          <dd>{formatRunTime(run.startedAt)}</dd>
          <dt className="text-muted-foreground">Ended</dt>
          <dd>
            {run.endedAt ? (
              formatRunTime(run.endedAt)
            ) : (
              <span className="text-muted-foreground">Not yet</span>
            )}
          </dd>
          <dt className="text-muted-foreground">Duration</dt>
          <dd>{runDuration(run)}</dd>
        </dl>

        {run.error ? (
          <div className="flex flex-col gap-0.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <p className="font-medium text-destructive">Why it failed</p>
            <p>{run.error}</p>
          </div>
        ) : null}

        <section
          aria-labelledby={stepsHeadingId}
          className="flex flex-col gap-3"
        >
          <div className="flex flex-col gap-0.5">
            <h3 id={stepsHeadingId} className="text-sm font-medium">
              Steps in this run
            </h3>
            <p className="text-xs text-muted-foreground">
              A step without a status has not run.
            </p>
          </div>
          <AutomationStepList
            workflow={workflow}
            names={names}
            statuses={statuses}
            notes={notes}
            labelledBy={stepsHeadingId}
          />
        </section>
      </div>
    </>
  );
}
