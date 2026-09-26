"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistance } from "date-fns";
import {
  ArrowLeftIcon,
  HistoryIcon,
  PencilIcon,
  TargetIcon,
  Trash2Icon,
} from "lucide-react";

import * as api from "@/lib/api";
import { apiNow, useResource } from "@/lib/api";
import { EmptyState } from "@/components/common/empty-state";
import { Money } from "@/components/common/money";
import { TagBadge } from "@/components/modules/contacts/tag-badge";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { TAG_DOT_CLASSES } from "@/lib/constants";
import { formatMoney, fullName, toDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DeleteOpportunityDialog } from "../delete-opportunity-dialog";
import { OpportunityFormSheet } from "../opportunity-form-sheet";
import { OpportunityStatusBadge } from "../opportunity-status-badge";

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm">{children}</dd>
    </div>
  );
}

export function OpportunityDetail({ id }: { id: string }) {
  const router = useRouter();
  const opportunity = useResource(
    "opportunities",
    () => api.opportunities.get(id),
    id,
  );
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const record = opportunity.data;

  const contact = useResource(
    "contacts",
    () =>
      record ? api.contacts.get(record.contactId) : Promise.resolve(undefined),
    record?.contactId ?? "none",
  );
  const pipelines = useResource("pipelines", () => api.pipelines.list());
  const users = useResource("users", () => api.users.list());
  const tags = useResource("tags", () => api.tags.list());
  const customFields = useResource("customFields", () =>
    api.customFields.list("opportunity"),
  );
  const activities = useResource(
    "activities",
    () =>
      record
        ? api.activities.listForOpportunity(record.id)
        : Promise.resolve([]),
    record?.id ?? "none",
  );

  const backLink = (
    <Link
      href="/opportunities"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeftIcon className="size-4" />
      Opportunities
    </Link>
  );

  // 404 is a loaded state, not a `notFound()` — the mock DB only exists on the
  // client, so the server has nothing to decide with.
  if (opportunity.error?.status === 404) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        {backLink}
        <EmptyState
          icon={TargetIcon}
          title="Deal not found"
          description="It may have been deleted."
        />
      </div>
    );
  }

  if (opportunity.isLoading || !record) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        {backLink}
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const pipeline = (pipelines.data ?? []).find(
    (p) => p.id === record.pipelineId,
  );
  const stage = pipeline?.stages.find((s) => s.id === record.stageId);
  const owner = (users.data ?? []).find((u) => u.id === record.ownerId);
  const tagsById = new Map((tags.data ?? []).map((t) => [t.id, t]));
  const dealTags = record.tagIds
    .map((tagId) => tagsById.get(tagId))
    .filter((tag) => Boolean(tag));
  const fields = customFields.data ?? [];

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      {backLink}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold">{record.name}</h1>
            <OpportunityStatusBadge status={record.status} />
          </div>
          <Money
            cents={record.value}
            currency={record.currency}
            tabular={false}
            className="text-2xl font-semibold"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <PencilIcon className="size-4" />
            Edit
          </Button>
          <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2Icon className="size-4" />
            Delete
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className="rounded-lg border p-4">
          <dl className="divide-y">
            <DetailRow label="Contact">
              {contact.data ? (
                <Link
                  href={`/contacts/${contact.data.id}`}
                  className="hover:underline"
                >
                  {fullName(contact.data)}
                </Link>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </DetailRow>
            <DetailRow label="Pipeline">
              {pipeline?.name ?? (
                <span className="text-muted-foreground">—</span>
              )}
            </DetailRow>
            <DetailRow label="Stage">
              {stage ? (
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      TAG_DOT_CLASSES[stage.color],
                    )}
                  />
                  {stage.name}
                  <span className="text-muted-foreground">
                    ({stage.probability}%)
                  </span>
                </span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </DetailRow>
            <DetailRow label="Owner">
              {owner ? (
                fullName(owner)
              ) : (
                <span className="text-muted-foreground">Unassigned</span>
              )}
            </DetailRow>
            <DetailRow label="In stage since">
              {formatDistance(toDate(record.stageEnteredAt), apiNow(), {
                addSuffix: true,
              })}
            </DetailRow>
            {record.expectedCloseAt ? (
              <DetailRow label="Expected close">
                {toDate(record.expectedCloseAt).toLocaleDateString()}
              </DetailRow>
            ) : null}
            {record.closedAt ? (
              <DetailRow label="Closed">
                {toDate(record.closedAt).toLocaleDateString()}
              </DetailRow>
            ) : null}
            {record.lostReason ? (
              <DetailRow label="Lost reason">{record.lostReason}</DetailRow>
            ) : null}
            {dealTags.length > 0 ? (
              <DetailRow label="Tags">
                <span className="flex flex-wrap justify-end gap-1">
                  {dealTags.map((tag) =>
                    tag ? <TagBadge key={tag.id} tag={tag} /> : null,
                  )}
                </span>
              </DetailRow>
            ) : null}
            {fields.map((field) => {
              const value = record.customFields[field.key];
              if (value == null || value === "") return null;
              return (
                <DetailRow key={field.id} label={field.label}>
                  {Array.isArray(value)
                    ? value.join(", ")
                    : typeof value === "boolean"
                      ? value
                        ? "Yes"
                        : "No"
                      : field.type === "currency"
                        ? formatMoney(Number(value), record.currency)
                        : String(value)}
                </DetailRow>
              );
            })}
          </dl>
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">Activity</h2>
          {activities.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (activities.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No activity on this deal yet.
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              {(activities.data ?? []).map((activity) => (
                <Item key={activity.id} size="sm">
                  <ItemMedia variant="icon">
                    <HistoryIcon />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{activity.summary}</ItemTitle>
                    <ItemDescription>
                      {formatDistance(toDate(activity.at), apiNow(), {
                        addSuffix: true,
                      })}
                    </ItemDescription>
                  </ItemContent>
                </Item>
              ))}
            </div>
          )}
        </div>
      </div>

      <OpportunityFormSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        opportunity={record}
        pipelines={pipelines.data ?? []}
        defaultPipelineId={record.pipelineId}
        users={users.data ?? []}
      />
      <DeleteOpportunityDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        opportunityIds={[record.id]}
        onDeleted={() => router.push("/opportunities")}
      />
    </div>
  );
}
