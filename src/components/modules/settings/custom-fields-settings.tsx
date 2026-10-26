"use client";

import { useId, useMemo, useRef, useState } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  PencilIcon,
  PlusIcon,
  TextCursorInputIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import type { CustomField, ID } from "@/types";
import * as api from "@/lib/api";
import {
  ApiError,
  invalidate,
  loadErrorOf,
  useAction,
  useResource,
} from "@/lib/api";
import { CUSTOM_FIELD_TYPE_LABELS } from "@/lib/validation/custom-field-definition";
import { EmptyState } from "@/components/common/empty-state";
import { LoadError } from "@/components/common/load-error";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CustomFieldDialog } from "./custom-field-dialog";
import {
  OBJECT_COPY,
  OBJECT_TYPES,
  type CustomFieldObjectType,
} from "./custom-fields-copy";
import { RemoveCustomFieldDialog } from "./remove-custom-field-dialog";

/**
 * The custom fields page body: a tab per object type (Contacts, Deals), each
 * listing its fields in the order the contact or deal form shows them, and
 * the add/edit dialog. "Add field" adds to the open tab's object type.
 *
 * An edited field shows as saved at once (`saved`, the last copy each save
 * returned), before the list is read again: whichever of it and the listed
 * copy has the newer `updatedAt` shows, so Edit always opens on the newest
 * values, even after a refetch failed.
 */
export function CustomFieldsSettings() {
  const [objectType, setObjectType] =
    useState<CustomFieldObjectType>("contact");
  const [editing, setEditing] = useState<{
    objectType: CustomFieldObjectType;
    field: CustomField | null;
  } | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saved, setSaved] = useState<ReadonlyMap<ID, CustomField>>(
    () => new Map(),
  );

  function openDialog(field: CustomField | null) {
    setEditing({ objectType: field?.objectType ?? objectType, field });
    setDialogOpen(true);
  }

  return (
    <>
      <PageHeader
        title="Custom fields"
        description="Extra fields on the contact and deal forms."
        actions={
          <Button type="button" onClick={() => openDialog(null)}>
            <PlusIcon data-icon="inline-start" aria-hidden />
            Add field
          </Button>
        }
      />
      <Tabs
        value={objectType}
        onValueChange={(value) => setObjectType(value as CustomFieldObjectType)}
        className="gap-4"
      >
        <TabsList>
          {OBJECT_TYPES.map((type) => (
            <TabsTrigger key={type} value={type}>
              {OBJECT_COPY[type].tab}
            </TabsTrigger>
          ))}
        </TabsList>
        {OBJECT_TYPES.map((type) => (
          <TabsContent key={type} value={type}>
            <FieldList
              objectType={type}
              saved={saved}
              onEdit={(field) => openDialog(field)}
            />
          </TabsContent>
        ))}
      </Tabs>
      {editing ? (
        <CustomFieldDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          objectType={editing.objectType}
          field={editing.field}
          onSaved={(field) => {
            if (editing.field) {
              setSaved((map) => new Map(map).set(field.id, field));
            }
            setDialogOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

/** The order a reorder asked for, until the refetch replaces `over`. */
interface PickedOrder {
  ids: ID[];
  /** The stored order (ids joined) it was picked over. */
  over: string;
}

/**
 * One object type's fields in position order, each with Move up, Move down,
 * Edit and Remove.
 *
 * - Moving saves the whole order (`customFields.reorder`) and shows it at
 *   once (`picked`); once the list is read again the stored order shows. A
 *   failed move toasts the API's sentence and the stored order comes back;
 *   a refusal because the list was stale (`INVALID_ORDER`) also reads the
 *   list again, so the next try sends the fields as stored.
 *   While a move saves, and until the list read after it is in (`moving`),
 *   the move buttons are disabled: a second move picked over a refetch
 *   still on its way would flash the first move's order back when it lands.
 *   They keep focus meanwhile (`focusableWhenDisabled`), so focus stays on
 *   the pressed button as its row moves (the row is moved, not re-created:
 *   rows are keyed by id).
 * - Remove opens `RemoveCustomFieldDialog`. A removed field goes at once
 *   (`removedIds`), before the refetch, so its buttons cannot be pressed
 *   again on stale data; focus moves to the list's heading.
 * - The read failing shows one `LoadError`; Retry invalidates
 *   "customFields".
 */
function FieldList({
  objectType,
  saved,
  onEdit,
}: {
  objectType: CustomFieldObjectType;
  saved: ReadonlyMap<ID, CustomField>;
  onEdit: (field: CustomField) => void;
}) {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const copy = OBJECT_COPY[objectType];
  const fields = useResource(
    "customFields",
    () => api.customFields.list(objectType),
    objectType,
  );
  const [removedIds, setRemovedIds] = useState<ReadonlySet<ID>>(
    () => new Set(),
  );
  const [removing, setRemoving] = useState<CustomField | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [focusHeading, setFocusHeading] = useState(false);
  const [reorder, reordering] = useAction(api.customFields.reorder);
  const [picked, setPicked] = useState<PickedOrder | null>(null);

  const storedOrder = (fields.data ?? []).map((f) => f.id).join(",");
  const shown = useMemo(() => {
    const stored = (fields.data ?? [])
      .filter((f) => !removedIds.has(f.id))
      .map((f) => {
        const s = saved.get(f.id);
        // The newest wins: a saved copy until the refetch delivers it.
        return s && s.updatedAt > f.updatedAt ? s : f;
      });
    if (!picked || picked.over !== storedOrder) return stored;
    const byId = new Map(stored.map((f) => [f.id, f]));
    return picked.ids.flatMap((id) => {
      const f = byId.get(id);
      return f ? [f] : [];
    });
  }, [fields.data, removedIds, saved, picked, storedOrder]);

  // A move saved, and the list read after it still on its way. A failed
  // read ends it too: the picked order then stands for the stored one.
  const settling =
    picked !== null && picked.over === storedOrder && fields.isRefreshing;
  const moving = reordering || settling;

  async function move(field: CustomField, direction: "up" | "down") {
    if (moving) return;
    const ids = shown.map((f) => f.id);
    const from = ids.indexOf(field.id);
    const to = direction === "up" ? from - 1 : from + 1;
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to]!, ids[from]!];
    setPicked({ ids, over: storedOrder });
    try {
      await reorder(objectType, ids);
    } catch (error) {
      setPicked(null);
      // The list was stale: read it again, so trying again can work.
      if (error instanceof ApiError && error.code === "INVALID_ORDER") {
        invalidate("customFields");
      }
      toast.error(
        error instanceof ApiError
          ? error.message
          : `Could not move ${field.label}.`,
      );
    }
  }

  const heading = (
    <h2
      ref={headingRef}
      id={headingId}
      tabIndex={-1}
      className="text-sm font-medium outline-none"
    >
      {copy.heading}
    </h2>
  );

  if (fields.isLoading && fields.data === undefined) {
    return (
      <section aria-labelledby={headingId} className="flex flex-col gap-3">
        {heading}
        <FieldListSkeleton />
      </section>
    );
  }
  const loadError = loadErrorOf(fields);
  if (loadError) {
    return (
      <section aria-labelledby={headingId} className="flex flex-col gap-3">
        {heading}
        <LoadError
          title="Could not load the custom fields"
          message={loadError.message}
          onRetry={() => invalidate("customFields")}
          retrying={fields.isRefreshing}
        />
      </section>
    );
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      {heading}
      {shown.length === 0 ? (
        <EmptyState
          icon={TextCursorInputIcon}
          title={`No ${copy.one} fields yet`}
          description={`Add one and it shows on the ${copy.one} form.`}
        />
      ) : (
        <ol aria-labelledby={headingId} className="divide-y rounded-lg border">
          {shown.map((field, index) => (
            <li
              key={field.id}
              className="flex items-center gap-2 py-2 pr-2 pl-3"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="font-medium [overflow-wrap:anywhere]">
                  {field.label}
                </span>
                <span className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs">
                  {CUSTOM_FIELD_TYPE_LABELS[field.type]}
                  {field.required ? (
                    <Badge variant="secondary">Required</Badge>
                  ) : null}
                </span>
              </div>
              <div className="flex shrink-0 items-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Move ${field.label} up`}
                  disabled={moving || index === 0}
                  focusableWhenDisabled
                  className="data-disabled:opacity-50"
                  onClick={() => void move(field, "up")}
                >
                  <ArrowUpIcon aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Move ${field.label} down`}
                  disabled={moving || index === shown.length - 1}
                  focusableWhenDisabled
                  className="data-disabled:opacity-50"
                  onClick={() => void move(field, "down")}
                >
                  <ArrowDownIcon aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Edit ${field.label}`}
                  onClick={() => onEdit(field)}
                >
                  <PencilIcon data-icon="inline-start" aria-hidden />
                  <span className="hidden sm:inline">Edit</span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove ${field.label}`}
                  onClick={() => {
                    setFocusHeading(false);
                    setRemoving(field);
                    setRemoveOpen(true);
                  }}
                >
                  <Trash2Icon data-icon="inline-start" aria-hidden />
                  <span className="hidden sm:inline">Remove</span>
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}
      {removing ? (
        <RemoveCustomFieldDialog
          open={removeOpen}
          onOpenChange={setRemoveOpen}
          field={removing}
          onRemoved={(removed) => {
            setRemovedIds((ids) => new Set(ids).add(removed.id));
            setFocusHeading(true);
            setRemoveOpen(false);
          }}
          finalFocus={focusHeading ? headingRef : undefined}
        />
      ) : null}
    </section>
  );
}

/** The list's shape while the first read is in flight. */
function FieldListSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex items-center gap-4">
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="h-7 w-28" />
        </div>
      ))}
    </div>
  );
}
