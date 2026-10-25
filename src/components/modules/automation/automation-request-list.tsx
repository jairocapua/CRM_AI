"use client";

import { useId, useRef } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { MessageSquarePlusIcon } from "lucide-react";

import type { AutomationRequestStatus, ID, User } from "@/types";
import * as api from "@/lib/api";
import {
  invalidate,
  loadErrorOf,
  useResource,
  type AutomationRequestRow,
} from "@/lib/api";
import { toDate } from "@/lib/format";
import { TAG_DOT_CLASSES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/common/empty-state";
import { LoadError } from "@/components/common/load-error";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import {
  PRIORITY_LABELS,
  askerName,
  requestStatusLabel,
} from "./automation-request-copy";
import { WithdrawRequestButton } from "./automation-request-withdraw";

const STATUS_DOTS: Record<AutomationRequestStatus, string> = {
  requested: TAG_DOT_CLASSES.sky,
  in_review: TAG_DOT_CLASSES.amber,
  shipped: TAG_DOT_CLASSES.green,
  declined: TAG_DOT_CLASSES.slate,
  // Hollow: set aside by the asker, not answered by the developer.
  withdrawn: "border border-muted-foreground bg-transparent",
};

/**
 * Every automation request, newest first: title, status, priority, who
 * asked and when, what they asked for, the developer's reply, and for a
 * shipped one a link to the automation it became. The developer moves a
 * request's status, so nothing here changes one, except Withdraw on the
 * current user's own request while it is still "requested" (the row's
 * read-time `canWithdraw`, the same rule `withdraw()` enforces).
 *
 * Who asked comes from the users read, by id. One fault, one alert
 * (DECISIONS P7-T47): the requests read failing shows only its alert, and
 * its Retry also re-reads the users if they failed too. The users failing
 * alone keeps the list with "Unknown teammate" under a teammates alert.
 * Every secondary Retry uses `invalidate`, never `refetch`.
 */
export function AutomationRequestList() {
  const headingId = useId();
  const requests = useResource("automationRequests", () =>
    api.automationRequests.list(),
  );
  const users = useResource("users", () => api.users.list());

  const heading = (
    <h2 id={headingId} className="text-sm font-medium">
      Requests
    </h2>
  );

  if (requests.isLoading || users.isLoading) {
    return (
      <section aria-labelledby={headingId} className="flex flex-col gap-3">
        {heading}
        <AutomationRequestListSkeleton />
      </section>
    );
  }

  const requestsError = loadErrorOf(requests);
  const usersError = loadErrorOf(users);
  if (requestsError) {
    return (
      <section aria-labelledby={headingId} className="flex flex-col gap-3">
        {heading}
        <LoadError
          title="Could not load requests"
          message={requestsError.message}
          onRetry={() => {
            requests.refetch();
            // The users read names who asked. One fault, one alert: re-read
            // it here too, or its alert would appear next.
            if (usersError) invalidate("users");
          }}
          retrying={requests.isRefreshing}
        />
      </section>
    );
  }

  const rows = requests.data?.rows ?? [];
  const usersById = new Map((users.data ?? []).map((u) => [u.id, u]));

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      {heading}
      {usersError ? (
        <LoadError
          title="Could not load teammates"
          message={usersError.message}
          onRetry={() => invalidate("users")}
          retrying={users.isRefreshing}
        />
      ) : null}
      {rows.length === 0 ? (
        <EmptyState
          icon={MessageSquarePlusIcon}
          title="No requests yet"
          description="Ask for an automation with the form, and its status shows up here."
        />
      ) : (
        <ul aria-labelledby={headingId} className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.id} data-request-id={row.id}>
              <RequestCard request={row} usersById={usersById} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** A request's status as a badge: copy, never a control. */
function RequestStatusBadge({ status }: { status: AutomationRequestStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "shrink-0",
        status === "withdrawn" && "text-muted-foreground",
      )}
    >
      <span
        aria-hidden
        className={cn("size-1.5 rounded-full", STATUS_DOTS[status])}
      />
      {requestStatusLabel(status)}
    </Badge>
  );
}

function RequestCard({
  request,
  usersById,
}: {
  request: AutomationRequestRow;
  usersById: ReadonlyMap<ID, User>;
}) {
  const titleId = useId();
  // Where focus goes once a withdraw succeeds and its button is gone.
  const titleRef = useRef<HTMLHeadingElement>(null);
  const askedAt = toDate(request.createdAt);
  return (
    <article aria-labelledby={titleId}>
      <Card size="sm">
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <h3
              id={titleId}
              ref={titleRef}
              tabIndex={-1}
              className="text-sm leading-snug font-medium outline-none"
            >
              {request.title}
            </h3>
            <RequestStatusBadge status={request.status} />
          </div>
          <p className="text-xs text-muted-foreground">
            {PRIORITY_LABELS[request.priority]} priority · Asked by{" "}
            {askerName(request.createdBy, usersById)} on{" "}
            <time dateTime={request.createdAt}>
              {format(askedAt, "MMM d, yyyy")}
            </time>
          </p>
          <dl className="flex flex-col gap-2 text-sm">
            <RequestDetail label="Problem">{request.problem}</RequestDetail>
            <RequestDetail label="Starts when">{request.trigger}</RequestDetail>
            <RequestDetail label="Should">{request.outcome}</RequestDetail>
          </dl>
          {request.notes || request.status === "shipped" ? (
            <div className="flex flex-col gap-1 rounded-lg bg-muted/60 px-3 py-2 text-sm">
              {request.notes ? (
                <>
                  <p className="text-xs font-medium text-muted-foreground">
                    Developer&apos;s reply
                  </p>
                  <p className="break-words">{request.notes}</p>
                </>
              ) : null}
              {request.status === "shipped" ? (
                <ShippedAs request={request} />
              ) : null}
            </div>
          ) : null}
          {request.canWithdraw ? (
            <div className="flex justify-end">
              <WithdrawRequestButton
                request={request}
                onWithdrawn={() => titleRef.current?.focus()}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>
    </article>
  );
}

function RequestDetail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[6rem_minmax(0,1fr)] sm:gap-2">
      <dt className="text-xs text-muted-foreground sm:pt-0.5">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}

/** Where a shipped request went: its automation by name, as a link. */
function ShippedAs({ request }: { request: AutomationRequestRow }) {
  if (!request.shippedWorkflowId || !request.shippedWorkflowName) {
    return (
      <p className="text-muted-foreground">
        The automation it shipped as is no longer available.
      </p>
    );
  }
  return (
    <p>
      <span className="text-muted-foreground">Shipped automation: </span>
      <Link
        href={`/automation/${request.shippedWorkflowId}`}
        className="rounded-sm font-medium underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {request.shippedWorkflowName}
      </Link>
    </p>
  );
}

/** The list's first-load placeholder: three request cards. */
export function AutomationRequestListSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-40 w-full rounded-xl" />
      ))}
    </div>
  );
}
