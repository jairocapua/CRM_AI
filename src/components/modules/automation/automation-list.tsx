"use client";

import { useId } from "react";

import type { Workflow } from "@/types";
import * as api from "@/lib/api";
import { invalidate, loadErrorOf, useResource } from "@/lib/api";
import { LoadError } from "@/components/common/load-error";
import { Skeleton } from "@/components/ui/skeleton";

import { AutomationCard } from "./automation-card";
import {
  groupByFolder,
  ownerName,
  triggerSummary,
  type FolderGroup,
} from "./automation-summary";

/**
 * Every automation, one section per folder, each a read-only card with its
 * trigger, owner and lifecycle status. Nothing here edits anything:
 * automations are code a developer ships, and the way to get a new one is
 * the page's "Request an automation" link.
 *
 * A skeleton shows only on the first load (`isLoading`), never on a refetch.
 * The automations themselves failing with nothing on screen shows a
 * `LoadError` in place of the list. The users (owners) or tags (for tag
 * triggers) failing shows a `LoadError` above the list instead, and the cards
 * still draw: owners read "Unknown owner" and tag triggers fall back to
 * "When a tag is added" until a Retry succeeds. A refetch that fails while
 * data is on screen keeps it there.
 *
 * One fault, one alert (DECISIONS P7-T47): while the automations alert shows,
 * the users and tags alerts do not, and its Retry also re-reads whichever of
 * those failed, so a recovered list never arrives with "Unknown owner" cards
 * and two more alerts. Every Retry here invalidates the users and tags
 * resources rather than refetching its own hook.
 */
export function AutomationList() {
  const workflows = useResource("workflows", () => api.workflows.list());
  const users = useResource("users", () => api.users.list());
  const tags = useResource("tags", () => api.tags.list());

  if (workflows.isLoading || users.isLoading || tags.isLoading) {
    return <AutomationListSkeleton />;
  }

  const workflowsError = loadErrorOf(workflows);
  const usersError = loadErrorOf(users);
  const tagsError = loadErrorOf(tags);
  if (workflowsError) {
    return (
      <LoadError
        title="Could not load automations"
        message={workflowsError.message}
        onRetry={() => {
          workflows.refetch();
          // workflows.list reads the users and tags tables to resolve owners
          // and tag triggers, so the fault that failed it usually failed
          // those reads too. One fault, one alert (DECISIONS P7-T47): this
          // Retry re-reads them as well, or their alerts would appear next.
          if (usersError) invalidate("users");
          if (tagsError) invalidate("tags");
        }}
        retrying={workflows.isRefreshing}
      />
    );
  }

  const rows = workflows.data ?? [];
  const usersById = new Map((users.data ?? []).map((u) => [u.id, u]));
  const tagNames = new Map((tags.data ?? []).map((t) => [t.id, t.name]));

  return (
    <div className="flex flex-col gap-6">
      {usersError ? (
        <LoadError
          title="Could not load owners"
          message={usersError.message}
          // `invalidate`, not `refetch`, as for tags (DECISIONS P7-T47):
          // refetch re-reads only this hook's copy, and any other reader of
          // the resource on the page would keep its failed read.
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
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No automations yet.</p>
      ) : (
        groupByFolder(rows).map((group) => (
          <FolderSection
            key={group.folder}
            group={group}
            usersById={usersById}
            tagNames={tagNames}
          />
        ))
      )}
    </div>
  );
}

function FolderSection({
  group,
  usersById,
  tagNames,
}: {
  group: FolderGroup<Workflow>;
  usersById: Parameters<typeof ownerName>[1];
  tagNames: Parameters<typeof triggerSummary>[1];
}) {
  const headingId = useId();
  const count = group.workflows.length;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <h2 id={headingId} className="text-sm font-medium">
          {group.folder}
        </h2>
        <span className="text-xs text-muted-foreground">
          {count} {count === 1 ? "automation" : "automations"}
        </span>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {group.workflows.map((workflow) => (
          <li key={workflow.id} data-automation-id={workflow.id}>
            <AutomationCard
              name={workflow.name}
              description={workflow.description}
              status={workflow.status}
              trigger={triggerSummary(workflow, tagNames)}
              owner={ownerName(workflow.ownerId, usersById)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The list's first-load placeholder: two folders of cards. */
export function AutomationListSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      {[3, 2].map((cards, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-5 w-32" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: cards }, (_, j) => (
              <Skeleton key={j} className="h-36 w-full rounded-xl" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
