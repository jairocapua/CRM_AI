"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { HistoryIcon } from "lucide-react";
import type { ColumnDef, SortingState } from "@tanstack/react-table";

import * as api from "@/lib/api";
import {
  invalidate,
  loadErrorOf,
  useResource,
  type WorkflowRunRow,
} from "@/lib/api";
import type { ID, Workflow } from "@/types";
import { DataTable } from "@/components/common/data-table";
import { EmptyState } from "@/components/common/empty-state";
import { LoadError } from "@/components/common/load-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toDate } from "@/lib/format";

import { AutomationRunSheet } from "./automation-run-sheet";
import {
  keepSortMarked,
  RUNS_PAGE_SIZE,
  runDuration,
  runStatusCopy,
} from "./automation-runs";
import type { StepNames } from "./automation-steps";

/** Newest first, as `listRuns` sorts by default; shown on the header. */
const DEFAULT_SORTING: SortingState = [{ id: "startedAt", desc: true }];

/**
 * One automation's run history read, with its paging and sorting. Called at
 * the top of `AutomationDetail`, beside the automation's own read, so the
 * page can fold a runs fault into its one alert (DECISIONS P7-T47).
 */
export function useRunHistory(workflowId: ID) {
  const [page, setPage] = useState(1);
  const [sorting, setSorting] = useState<SortingState>(DEFAULT_SORTING);

  const query = {
    sort:
      sorting.length > 0
        ? sorting.map((s) => ({ field: s.id, desc: s.desc }))
        : undefined,
    page,
    pageSize: RUNS_PAGE_SIZE,
  };
  const runs = useResource(
    "workflowRuns",
    () => api.workflows.listRuns(workflowId, query),
    JSON.stringify({ workflowId, ...query }),
  );

  return { runs, page, setPage, sorting, setSorting };
}

export type RunHistoryState = ReturnType<typeof useRunHistory>;

/** "Sep 3, 9:02 AM": a run's start in the table. */
const formatStarted = (at: string) => format(toDate(at), "MMM d, h:mm a");

/**
 * The detail page's "Run history": who went through the automation, how it
 * went, when and for how long, newest first, a page at a time.
 *
 * - Each row's start time is a button that opens the run in a sheet (its
 *   steps marked with how each went); the contact's name is a link to their
 *   page, or plain "Unknown contact" when the contact is gone.
 * - The first load and a page change show the table's skeleton. The count
 *   and paging footer waits for the first load (it would read "0 runs").
 * - No runs (always so for a draft) shows "No runs yet" instead of a table.
 * - The runs read failing with nothing to show renders a `LoadError` in the
 *   section; its Retry re-reads every runs reader (`invalidate`). While the
 *   automation's own alert shows, this section is not drawn at all: the page
 *   shows one alert per fault.
 * - On a phone the table scrolls sideways inside its border; the start time
 *   (the open button) and the contact come first, so both stay in view.
 */
export function RunHistory({
  state: { runs, setPage, sorting, setSorting },
  workflow,
  names,
}: {
  state: RunHistoryState;
  workflow: Workflow;
  names: StepNames;
}) {
  const headingId = useId();
  const [selected, setSelected] = useState<WorkflowRunRow | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const columns = useMemo(
    () =>
      runColumns((run) => {
        setSelected(run);
        setSheetOpen(true);
      }),
    [],
  );

  const runsError = loadErrorOf(runs);
  const total = runs.data?.total ?? 0;
  const pageCount = runs.data?.pageCount ?? 1;
  // The API clamps an out-of-range page; show the page it returned.
  const currentPage = runs.data?.page ?? 1;
  const empty = !runs.isLoading && !runsError && total === 0;
  // Nothing read yet: the footer would read "0 runs" under the skeleton. A
  // page change keeps the last page's footer, its buttons disabled.
  const firstLoad = runs.isLoading && runs.data === undefined;

  return (
    <section
      aria-labelledby={headingId}
      className="flex min-w-0 flex-col gap-3"
    >
      <h2 id={headingId} className="text-sm font-medium">
        Run history
      </h2>

      {runsError ? (
        <LoadError
          title="Could not load run history"
          message={runsError.message}
          // `invalidate`, not `runs.refetch`: as every secondary read here.
          onRetry={() => invalidate("workflowRuns")}
          retrying={runs.isRefreshing}
        />
      ) : empty ? (
        <EmptyState
          icon={HistoryIcon}
          title="No runs yet"
          description={
            workflow.status === "draft"
              ? "This automation is still in development, so no contact has gone through it."
              : "No contact has gone through this automation yet."
          }
        />
      ) : (
        <>
          <DataTable
            columns={columns}
            data={runs.data?.rows ?? []}
            getRowId={(row) => row.id}
            sorting={sorting}
            onSortingChange={(updater) => {
              // Never unsorted: see `keepSortMarked`.
              setSorting((prev) =>
                keepSortMarked(
                  prev,
                  typeof updater === "function" ? updater(prev) : updater,
                ),
              );
              setPage(1);
            }}
            rowSelection={{}}
            onRowSelectionChange={() => {}}
            isLoading={runs.isLoading}
          />
          {!firstLoad && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
              <span>
                {total} run{total === 1 ? "" : "s"}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={runs.isLoading || currentPage <= 1}
                  onClick={() => setPage(Math.max(1, currentPage - 1))}
                >
                  Previous
                </Button>
                <span>
                  Page {currentPage} of {pageCount}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={runs.isLoading || currentPage >= pageCount}
                  onClick={() => setPage(Math.min(pageCount, currentPage + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <AutomationRunSheet
        run={selected}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        workflow={workflow}
        names={names}
      />
    </section>
  );
}

function runColumns(
  onOpen: (run: WorkflowRunRow) => void,
): ColumnDef<WorkflowRunRow>[] {
  return [
    {
      accessorKey: "startedAt",
      header: "Started",
      cell: ({ row }) => {
        const started = formatStarted(row.original.startedAt);
        const who = row.original.contactName ?? "unknown contact";
        return (
          <Button
            variant="link"
            size="sm"
            className="h-auto px-0 font-medium text-foreground"
            aria-label={`View run for ${who} from ${started}`}
            onClick={() => onOpen(row.original)}
          >
            {started}
          </Button>
        );
      },
    },
    {
      id: "contact",
      header: "Contact",
      enableSorting: false,
      cell: ({ row }) => {
        const { contactId, contactName } = row.original;
        return contactName ? (
          <Link
            href={`/contacts/${contactId}`}
            className="underline-offset-4 hover:underline"
          >
            {contactName}
          </Link>
        ) : (
          <span className="text-muted-foreground">Unknown contact</span>
        );
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      enableSorting: false,
      cell: ({ row }) => {
        const status = runStatusCopy(row.original.status);
        return <Badge variant={status.variant}>{status.label}</Badge>;
      },
    },
    {
      id: "duration",
      header: "Duration",
      enableSorting: false,
      cell: ({ row }) => {
        const text = runDuration(row.original);
        return row.original.endedAt ? (
          text
        ) : (
          <span className="text-muted-foreground">{text}</span>
        );
      },
    },
  ];
}
