"use client";

import { Suspense, useMemo, useState } from "react";
import { UsersIcon } from "lucide-react";
import type { RowSelectionState, SortingState } from "@tanstack/react-table";

import * as api from "@/lib/api";
import { invalidate, loadErrorOf, useResource } from "@/lib/api";
import type { Contact, ContactStatus, FilterCondition } from "@/types";
import { DataTable } from "@/components/common/data-table";
import { EmptyState } from "@/components/common/empty-state";
import { LoadError } from "@/components/common/load-error";
import { OpenFromSearchParam } from "@/components/common/open-from-search-param";
import { Button } from "@/components/ui/button";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { BulkActionsBar } from "./bulk-actions-bar";
import { buildContactColumns } from "./columns";
import { ContactFormSheet } from "./contact-form-sheet";
import { ContactsToolbar } from "./contacts-toolbar";
import { DeleteContactDialog } from "./delete-contact-dialog";

const PAGE_SIZE = 25;

/**
 * The contacts list: toolbar, bulk actions, a paged table and its count and
 * pager footer.
 *
 * - The first load shows the table's skeleton.
 * - A failed load with no rows shows a `LoadError` with Retry in place of
 *   the table, never "No contacts found". While a retry runs, the alert
 *   stays with its button busy; it never turns into a skeleton. The table
 *   and the footer ("0 contacts", "Page 1 of 1" would not be true) are
 *   hidden; the toolbar stays, so search, filters and Add contact still work.
 * - A failed page, search, status or tag change shows the error too: each is
 *   a new query (a new `cacheKey`), and `useResource` drops the previous
 *   query's rows when a new one fails, so the old rows never sit under a new
 *   page number or filter.
 * - A refetch of the same query that fails with rows on screen (after any
 *   contact write invalidates "contacts") keeps the rows and the footer:
 *   `loadErrorOf` gives no error while there is data.
 * - A tags read that fails with no tags to show, while the rows are on
 *   screen, shows "Could not load tags" with Retry above the table; the rows
 *   and the footer stay. Its Retry re-reads every tags reader on the page,
 *   the toolbar's tag filter included. It shows only while the rows are on
 *   screen: hidden during the first load and a page change's skeleton, back
 *   when the rows land.
 * - While the contacts list itself is in error, only that alert shows: the
 *   tag counts read the contacts table, so the same fault failed them, and
 *   the contacts Retry re-reads the tags too.
 * - A failed tags re-read with tags on screen keeps them (`loadErrorOf`).
 */
export function ContactsTable() {
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const [status, setStatus] = useState<ContactStatus | "all">("all");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [page, setPage] = useState(1);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const [formOpen, setFormOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | undefined>(
    undefined,
  );
  const [deletingContact, setDeletingContact] = useState<Contact | undefined>(
    undefined,
  );

  const conditions: FilterCondition[] = [];
  if (status !== "all") {
    conditions.push({
      id: "status",
      field: "status",
      operator: "eq",
      value: status,
    });
  }
  if (tagIds.length > 0) {
    conditions.push({
      id: "tags",
      field: "tagIds",
      operator: "in",
      value: tagIds,
    });
  }

  const query = {
    q: debouncedSearch.trim() || undefined,
    filter:
      conditions.length > 0
        ? { id: "contacts-filter", combinator: "and" as const, conditions }
        : undefined,
    sort:
      sorting.length > 0
        ? sorting.map((s) => ({ field: s.id, desc: s.desc }))
        : undefined,
    page,
    pageSize: PAGE_SIZE,
  };

  const contactsPage = useResource(
    "contacts",
    () => api.contacts.list(query),
    JSON.stringify(query),
  );
  const tags = useResource("tags", () => api.tags.list());
  const users = useResource("users", () => api.users.list());

  const tagsById = useMemo(
    () => new Map((tags.data ?? []).map((t) => [t.id, t])),
    [tags.data],
  );
  const usersById = useMemo(
    () => new Map((users.data ?? []).map((u) => [u.id, u])),
    [users.data],
  );

  const columns = useMemo(
    () =>
      buildContactColumns({
        tagsById,
        usersById,
        onEdit: (contact) => {
          setEditingContact(contact);
          setFormOpen(true);
        },
        onDelete: (contact) => setDeletingContact(contact),
      }),
    [tagsById, usersById],
  );

  const loadError = loadErrorOf(contactsPage);
  const tagsError = loadErrorOf(tags);
  const rows = contactsPage.data?.rows ?? [];
  const total = contactsPage.data?.total ?? 0;
  const pageCount = contactsPage.data?.pageCount ?? 1;
  // The API clamps an out-of-range page server-side; reflect that clamped
  // value here instead of correcting local `page` state from an effect.
  const currentPage = contactsPage.data?.page ?? page;
  const selectedIds = Object.entries(rowSelection)
    .filter(([, selected]) => selected)
    .map(([id]) => id);

  const hasActiveFilters =
    debouncedSearch.trim() !== "" || status !== "all" || tagIds.length > 0;

  return (
    <div className="flex flex-1 flex-col gap-3">
      <ContactsToolbar
        search={searchInput}
        onSearchChange={(value) => {
          setSearchInput(value);
          setPage(1);
        }}
        status={status}
        onStatusChange={(value) => {
          setStatus(value);
          setPage(1);
        }}
        tagIds={tagIds}
        onTagIdsChange={(ids) => {
          setTagIds(ids);
          setPage(1);
        }}
        onAddContact={() => {
          setEditingContact(undefined);
          setFormOpen(true);
        }}
      />

      {selectedIds.length > 0 ? (
        <BulkActionsBar
          selectedIds={selectedIds}
          onClearSelection={() => setRowSelection({})}
        />
      ) : null}

      {/* Only while the rows are on screen: never above the table's skeleton,
          on the first load or a page change. `isLoading`, not
          `data !== undefined`: during a page change `useResource` still
          returns the previous page's data while DataTable shows its skeleton. */}
      {!contactsPage.isLoading && !loadError && tagsError ? (
        <LoadError
          title="Could not load tags"
          message={tagsError.message}
          // `invalidate`, not `tags.refetch`: refetch re-reads only this
          // hook's copy, and the toolbar's TagPicker holds its own
          // `useResource("tags")`, which would keep its failed read.
          onRetry={() => invalidate("tags")}
          retrying={tags.isRefreshing}
        />
      ) : null}

      {loadError ? (
        <LoadError
          title="Could not load contacts"
          message={loadError.message}
          onRetry={() => {
            contactsPage.refetch();
            // tags.list counts tags through the contacts table, so the fault
            // that failed the list failed the tag counts too: one Retry
            // re-reads both.
            if (tagsError) invalidate("tags");
          }}
          retrying={contactsPage.isRefreshing}
        />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          getRowId={(row) => row.id}
          sorting={sorting}
          onSortingChange={setSorting}
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
          isLoading={contactsPage.isLoading}
          emptyState={
            <EmptyState
              icon={UsersIcon}
              title="No contacts found"
              description={
                hasActiveFilters
                  ? "Try adjusting your search or filters."
                  : "Add your first contact to get started."
              }
            />
          }
        />
      )}

      {loadError ? null : (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {total} contact{total === 1 ? "" : "s"}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <span>
              Page {currentPage} of {pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* `/contacts?new=1` (the command palette's New contact) opens the
          sheet. useSearchParams needs a Suspense boundary on this
          prerendered route; it wraps only this, so the table never waits. */}
      <Suspense fallback={null}>
        <OpenFromSearchParam
          name="new"
          onOpen={() => {
            setEditingContact(undefined);
            setFormOpen(true);
          }}
        />
      </Suspense>
      <ContactFormSheet
        open={formOpen}
        contact={editingContact}
        onOpenChange={setFormOpen}
      />

      {deletingContact ? (
        <DeleteContactDialog
          open
          onOpenChange={(open) => {
            if (!open) setDeletingContact(undefined);
          }}
          contactIds={[deletingContact.id]}
          onDeleted={() => setDeletingContact(undefined)}
        />
      ) : null}
    </div>
  );
}
