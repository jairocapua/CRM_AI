"use client";

import { useMemo, useState } from "react";
import { UsersIcon } from "lucide-react";
import type { RowSelectionState, SortingState } from "@tanstack/react-table";

import * as api from "@/lib/api";
import { useResource } from "@/lib/api";
import type { Contact, ContactStatus, FilterCondition } from "@/types";
import { DataTable } from "@/components/common/data-table";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { BulkActionsBar } from "./bulk-actions-bar";
import { buildContactColumns } from "./columns";
import { ContactFormSheet } from "./contact-form-sheet";
import { ContactsToolbar } from "./contacts-toolbar";
import { DeleteContactDialog } from "./delete-contact-dialog";

const PAGE_SIZE = 25;

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
