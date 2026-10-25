"use client";

import { useId, useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeftIcon, WorkflowIcon } from "lucide-react";

import * as api from "@/lib/api";
import { invalidate, loadErrorOf, useResource } from "@/lib/api";
import { EmptyState } from "@/components/common/empty-state";
import { LoadError } from "@/components/common/load-error";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";

import { AutomationStatusBadge } from "./automation-card";
import { canvasHeight } from "./automation-flow";
import { RunHistory, useRunHistory } from "./automation-run-history";
import { AutomationStepList } from "./automation-step-list";
import { behaviourCopy, sourcePath } from "./automation-steps";
import {
  STATUS_COPY,
  UNFILED,
  ownerName,
  triggerSummary,
} from "./automation-summary";

/**
 * The diagram, loaded on demand: React Flow (and its chunk) stays off the
 * first load of this page and out of every other route, and a phone, which
 * never mounts it, never downloads it. `ssr: false` because it only ever
 * mounts after the client has read the automation.
 */
const AutomationGraph = dynamic(() => import("./automation-graph"), {
  ssr: false,
  loading: () => <Skeleton className="size-full rounded-none" />,
});

/**
 * One automation's page (`/automation/[id]`): what it is, who owns it, where
 * its code lives, its steps as a nested list and how it behaves. Read-only:
 * automations are code a developer ships.
 *
 * - A skeleton shows only on the first load (`isLoading`), never on a
 *   refetch.
 * - An unknown id (a 404) shows "Automation not found".
 * - The automation failing to load, with nothing on screen, shows a
 *   `LoadError` in its place. `workflows.get` resolves owners and tag names
 *   from the users and tags tables, so the fault that failed it usually
 *   failed those reads too: one fault, one alert (DECISIONS P7-T47), its
 *   Retry re-reads them as well, as on the list page.
 * - The users or tags read failing alone shows a `LoadError` above the page,
 *   which still draws: the owner reads "Unknown owner" and steps leave out
 *   the names they cannot resolve until a Retry (`invalidate`) succeeds.
 * - Its run history (`RunHistory`) is read beside it, a secondary read: while
 *   the automation's alert shows, the runs section is not drawn, and that
 *   alert's Retry re-reads the runs too when they failed. The runs failing
 *   alone show their own alert in the section; the rest of the page draws.
 * - On screens 768px and wider a read-only diagram sits above the steps.
 *   Below that it is not mounted at all: the step list, which renders at
 *   every width, is the whole picture (and the accessible one).
 */
export function AutomationDetail({ id }: { id: string }) {
  const workflow = useResource("workflows", () => api.workflows.get(id), id);
  const users = useResource("users", () => api.users.list());
  const tags = useResource("tags", () => api.tags.list());
  const runHistory = useRunHistory(id);
  const stepsHeadingId = useId();
  const diagramHeadingId = useId();
  const isMobile = useIsMobile();

  // Memoised so `names` keeps its identity between renders: the diagram's
  // `useMemo([workflow, names])` would otherwise rebuild every React Flow
  // node and edge on each render.
  const usersById = useMemo(
    () => new Map((users.data ?? []).map((u) => [u.id, u])),
    [users.data],
  );
  const tagNames = useMemo(
    () => new Map((tags.data ?? []).map((t) => [t.id, t.name])),
    [tags.data],
  );
  const names = useMemo(() => ({ tagNames, usersById }), [tagNames, usersById]);

  const backLink = (
    <Link
      href="/automation"
      className="inline-flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeftIcon className="size-4" />
      Automation
    </Link>
  );

  if (workflow.isLoading || users.isLoading || tags.isLoading) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        {backLink}
        <AutomationDetailSkeleton />
      </div>
    );
  }

  const usersError = loadErrorOf(users);
  const tagsError = loadErrorOf(tags);
  const runsError = loadErrorOf(runHistory.runs);

  if (workflow.error?.status === 404) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        {backLink}
        <EmptyState
          icon={WorkflowIcon}
          title="Automation not found"
          description="There is no automation at this address. It may have been removed from the code."
        />
      </div>
    );
  }

  const workflowError = loadErrorOf(workflow);
  if (workflowError || !workflow.data) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        {backLink}
        <LoadError
          title="Could not load the automation"
          message={workflowError?.message ?? "Something went wrong."}
          onRetry={() => {
            workflow.refetch();
            if (usersError) invalidate("users");
            if (tagsError) invalidate("tags");
            if (runsError) invalidate("workflowRuns");
          }}
          retrying={workflow.isRefreshing}
        />
      </div>
    );
  }

  const record = workflow.data;
  const status = STATUS_COPY[record.status];

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      {backLink}

      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {record.name}
          </h1>
          <AutomationStatusBadge status={record.status} />
        </div>
        {record.description ? (
          <p className="text-sm text-muted-foreground">{record.description}</p>
        ) : null}
        {record.status === "published" ? null : (
          <p className="text-sm text-muted-foreground">{status.description}</p>
        )}
      </header>

      {usersError ? (
        <LoadError
          title="Could not load owners"
          message={usersError.message}
          onRetry={() => invalidate("users")}
          retrying={users.isRefreshing}
        />
      ) : null}
      {tagsError ? (
        <LoadError
          title="Could not load tag names"
          message={tagsError.message}
          onRetry={() => invalidate("tags")}
          retrying={tags.isRefreshing}
        />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-4">
          {isMobile ? null : (
            <section
              aria-labelledby={diagramHeadingId}
              className="flex flex-col gap-3"
            >
              <h2 id={diagramHeadingId} className="text-sm font-medium">
                Diagram
              </h2>
              {/* An explicit height: React Flow draws nothing without one.
                  Capped by the window, so the fitted diagram is seen whole. */}
              <div
                className="max-h-[80svh] overflow-hidden rounded-xl border"
                style={{ height: canvasHeight(record.nodes) }}
              >
                <AutomationGraph workflow={record} names={names} />
              </div>
            </section>
          )}
          <section
            aria-labelledby={stepsHeadingId}
            className="flex flex-col gap-3"
          >
            <h2 id={stepsHeadingId} className="text-sm font-medium">
              Steps
            </h2>
            <AutomationStepList
              workflow={record}
              names={names}
              labelledBy={stepsHeadingId}
            />
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          <AsideSection title="Details">
            <dl className="flex flex-col gap-2 text-sm">
              <Detail term="Trigger">{triggerSummary(record, tagNames)}</Detail>
              <Detail term="Owner">
                {ownerName(record.ownerId, usersById)}
              </Detail>
              <Detail term="Folder">{record.folder?.trim() || UNFILED}</Detail>
              <Detail term="Source">
                <code className="font-mono text-xs break-all">
                  {sourcePath(record.slug)}
                </code>
              </Detail>
            </dl>
          </AsideSection>
          <AsideSection title="How this behaves">
            <ul className="flex list-disc flex-col gap-1 pl-4 text-sm">
              {behaviourCopy(record.settings).map((sentence) => (
                <li key={sentence}>{sentence}</li>
              ))}
            </ul>
          </AsideSection>
        </aside>
      </div>

      <RunHistory state={runHistory} workflow={record} names={names} />
    </div>
  );
}

function AsideSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-3 rounded-xl p-4 ring-1 ring-foreground/10"
    >
      <h2 id={headingId} className="text-sm font-medium">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Detail({
  term,
  children,
}: {
  term: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * The detail page's first-load placeholder: header, diagram (768px and
 * wider, as the diagram itself), steps and side panel. The diagram block is
 * about a typical canvas's height (`canvasHeight` gives the shipped graphs
 * 413 to 720px, capped by the window), so the page shifts little when the
 * real one arrives.
 */
function AutomationDetailSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-full max-w-xl" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-2">
          <Skeleton className="mb-2 hidden h-[min(32rem,80svh)] w-full rounded-xl md:block" />
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-56 w-full rounded-xl" />
      </div>
    </div>
  );
}
