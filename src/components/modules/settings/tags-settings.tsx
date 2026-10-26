"use client";

import { useId, useMemo, useRef, useState } from "react";
import {
  MergeIcon,
  PencilIcon,
  PlusIcon,
  TagIcon,
  Trash2Icon,
} from "lucide-react";

import type { ID, Tag } from "@/types";
import * as api from "@/lib/api";
import {
  invalidate,
  loadErrorOf,
  useResource,
  type TagWithCount,
} from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { EmptyState } from "@/components/common/empty-state";
import { LoadError } from "@/components/common/load-error";
import { PageHeader } from "@/components/common/page-header";
import { TagBadge } from "@/components/modules/contacts/tag-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MergeTagDialog } from "./merge-tag-dialog";
import { RemoveTagDialog } from "./remove-tag-dialog";
import { TagDialog } from "./tag-dialog";
import { shownTags, storedTag, type MergedCount } from "./tags-view";

/**
 * The tags page body: every tag by name in a table with how many contacts
 * carry it (`api.tags.list()`, the page's one read), and New tag, Edit,
 * Merge and Remove.
 *
 * Page-level state keeps what the mutations returned, so a list read that
 * is still on its way, or failed, never shows older data (`shownTags`):
 * - `saved`: the copy each create, edit and merge returned; whichever of it
 *   and the listed copy has the newer `updatedAt` shows, and Edit opens on
 *   it;
 * - `counts`: a merge target's contact count as the merge returned it,
 *   until the list is read again after the merge;
 * - `removedIds`: removed and merged-away tags, hidden at once so their
 *   buttons cannot be pressed again on stale data; focus then moves to the
 *   table's heading.
 *
 * The read failing shows one `LoadError`; Retry invalidates "tags".
 */
export function TagsSettings() {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const tags = useResource("tags", () => api.tags.list());
  const [saved, setSaved] = useState<ReadonlyMap<ID, Tag>>(() => new Map());
  const [counts, setCounts] = useState<ReadonlyMap<ID, MergedCount>>(
    () => new Map(),
  );
  const [removedIds, setRemovedIds] = useState<ReadonlySet<ID>>(
    () => new Set(),
  );
  const [editing, setEditing] = useState<{ tag: TagWithCount | null } | null>(
    null,
  );
  const [editOpen, setEditOpen] = useState(false);
  const [removing, setRemoving] = useState<TagWithCount | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [merging, setMerging] = useState<TagWithCount | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [focusHeading, setFocusHeading] = useState(false);

  const shown = useMemo(
    () => shownTags(tags.data, saved, removedIds, counts),
    [tags.data, saved, removedIds, counts],
  );

  function keep(tag: Tag) {
    setSaved((map) => new Map(map).set(tag.id, storedTag(tag)));
  }

  function openEdit(tag: TagWithCount | null) {
    setEditing({ tag });
    setEditOpen(true);
  }

  const heading = (
    <h2
      ref={headingRef}
      id={headingId}
      tabIndex={-1}
      className="text-sm font-medium outline-none"
    >
      All tags
    </h2>
  );

  let body: React.ReactNode;
  const loadError = loadErrorOf(tags);
  if (tags.isLoading && tags.data === undefined) {
    body = <TagsTableSkeleton />;
  } else if (loadError) {
    body = (
      <LoadError
        title="Could not load the tags"
        message={loadError.message}
        onRetry={() => invalidate("tags")}
        retrying={tags.isRefreshing}
      />
    );
  } else if (shown.length === 0) {
    body = (
      <EmptyState
        icon={TagIcon}
        title="No tags yet"
        description="Create one, then add it to contacts and deals as you edit them."
      />
    );
  } else {
    body = (
      <div className="rounded-lg border">
        <Table aria-labelledby={headingId}>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-3">Tag</TableHead>
              <TableHead className="text-right">Contacts</TableHead>
              <TableHead className="pr-3">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((tag) => (
              <TableRow key={tag.id} data-tag-id={tag.id}>
                <TableCell className="pl-3 whitespace-normal">
                  <TagBadge
                    tag={tag}
                    className="h-auto max-w-full text-left whitespace-normal [overflow-wrap:anywhere]"
                  />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(tag.contactCount)}
                </TableCell>
                <TableCell className="pr-3 text-right">
                  <div className="flex items-center justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Edit ${tag.name}`}
                      onClick={() => openEdit(tag)}
                    >
                      <PencilIcon data-icon="inline-start" aria-hidden />
                      <span className="hidden sm:inline">Edit</span>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Merge ${tag.name}`}
                      disabled={shown.length < 2}
                      onClick={() => {
                        setFocusHeading(false);
                        setMerging(tag);
                        setMergeOpen(true);
                      }}
                    >
                      <MergeIcon data-icon="inline-start" aria-hidden />
                      <span className="hidden sm:inline">Merge</span>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove ${tag.name}`}
                      onClick={() => {
                        setFocusHeading(false);
                        setRemoving(tag);
                        setRemoveOpen(true);
                      }}
                    >
                      <Trash2Icon data-icon="inline-start" aria-hidden />
                      <span className="hidden sm:inline">Remove</span>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Tags"
        description="The tags on your contacts and deals."
        actions={
          <Button type="button" onClick={() => openEdit(null)}>
            <PlusIcon data-icon="inline-start" aria-hidden />
            New tag
          </Button>
        }
      />
      <section aria-labelledby={headingId} className="flex flex-col gap-3">
        {heading}
        {body}
      </section>

      {editing ? (
        <TagDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          tag={editing.tag}
          onSaved={(tag) => {
            keep(tag);
            setEditOpen(false);
          }}
        />
      ) : null}
      {removing ? (
        <RemoveTagDialog
          open={removeOpen}
          onOpenChange={setRemoveOpen}
          tag={removing}
          onRemoved={(removed) => {
            setRemovedIds((ids) => new Set(ids).add(removed.id));
            setFocusHeading(true);
            setRemoveOpen(false);
          }}
          finalFocus={focusHeading ? headingRef : undefined}
        />
      ) : null}
      {merging ? (
        <MergeTagDialog
          open={mergeOpen}
          onOpenChange={setMergeOpen}
          tag={merging}
          others={shown.filter((t) => t.id !== merging.id)}
          onMerged={(source, target) => {
            setRemovedIds((ids) => new Set(ids).add(source.id));
            keep(target);
            setCounts((map) =>
              new Map(map).set(target.id, {
                contactCount: target.contactCount,
                asOf: target.updatedAt,
              }),
            );
            setFocusHeading(true);
            setMergeOpen(false);
          }}
          finalFocus={focusHeading ? headingRef : undefined}
        />
      ) : null}
    </>
  );
}

/** The table's shape while the first read is in flight. */
function TagsTableSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-5 w-28 rounded-full" />
          <Skeleton className="ml-auto h-4 w-8" />
          <Skeleton className="h-7 w-28" />
        </div>
      ))}
    </div>
  );
}
