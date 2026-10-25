"use client";

import { useId } from "react";
import Link from "next/link";
import { ArrowLeftIcon, WorkflowIcon } from "lucide-react";

import * as api from "@/lib/api";
import { invalidate, loadErrorOf, useResource } from "@/lib/api";
import { EmptyState } from "@/components/common/empty-state";
import { LoadError } from "@/components/common/load-error";
import { Skeleton } from "@/components/ui/skeleton";

import { AutomationStatusBadge } from "./automation-card";
import { AutomationStepList } from "./automation-step-list";
import { behaviourCopy, sourcePath } from "./automation-steps";
import {
  STATUS_COPY,
  UNFILED,
  ownerName,
  triggerSummary,
} from "./automation-summary";

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
 */
export function AutomationDetail({ id }: { id: string }) {
  const workflow = useResource("workflows", () => api.workflows.get(id), id);
  const users = useResource("users", () => api.users.list());
  const tags = useResource("tags", () => api.tags.list());
  const stepsHeadingId = useId();

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
          }}
          retrying={workflow.isRefreshing}
        />
      </div>
    );
  }

  const record = workflow.data;
  const usersById = new Map((users.data ?? []).map((u) => [u.id, u]));
  const tagNames = new Map((tags.data ?? []).map((t) => [t.id, t.name]));
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
          {/*
            The read-only diagram (P8-T05) mounts here, above the steps, on
            screens 768px and wider (`useIsMobile()` false). Below 768px it is
            not mounted at all and the step list is the whole picture.
          */}
          <section
            aria-labelledby={stepsHeadingId}
            className="flex flex-col gap-3"
          >
            <h2 id={stepsHeadingId} className="text-sm font-medium">
              Steps
            </h2>
            <AutomationStepList
              workflow={record}
              names={{ tagNames, usersById }}
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

/** The detail page's first-load placeholder: header, steps and side panel. */
function AutomationDetailSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-full max-w-xl" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-56 w-full rounded-xl" />
      </div>
    </div>
  );
}
