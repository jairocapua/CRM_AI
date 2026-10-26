"use client";

import { useRef, useState, type ComponentProps } from "react";
import { toast } from "sonner";

import type { CustomField } from "@/types";
import * as api from "@/lib/api";
import {
  ApiError,
  invalidate,
  loadErrorOf,
  useAction,
  useResource,
} from "@/lib/api";
import { LoadError } from "@/components/common/load-error";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { OBJECT_COPY, removalSentence } from "./custom-fields-copy";

/**
 * Asks before removing `field`, and says what goes with it.
 *
 * It reads `api.customFields.removalPreview()` as it opens: how many records
 * hold a value for the field ("1 contact holds a value for Referral Code;
 * that value is deleted with it."). The confirm button shows once the count
 * is in. Cancel comes first and takes focus as it opens.
 *
 * Confirming keeps the dialog open with the button pending ("Removing…").
 * The button stays focusable meanwhile (`focusableWhenDisabled`), so a
 * failure, told in a toast with the API's sentence, leaves the dialog open
 * and focus where it was. Success toasts, calls `onRemoved` (the caller
 * hides the row and closes the dialog) and keeps the button pending (`done`)
 * through the close. The count failing to load shows a `LoadError` whose
 * Retry invalidates "customFields".
 */
export function RemoveCustomFieldDialog({
  open,
  onOpenChange,
  field,
  onRemoved,
  finalFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  field: CustomField;
  onRemoved: (field: CustomField) => void;
  finalFocus?: ComponentProps<typeof AlertDialogContent>["finalFocus"];
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [removing, setRemoving] = useState(false);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // No closing mid-removal: the result is still to come.
        if (!next && removing) return;
        onOpenChange(next);
      }}
    >
      <AlertDialogContent initialFocus={cancelRef} finalFocus={finalFocus}>
        <RemoveCustomFieldBody
          key={field.id}
          field={field}
          cancelRef={cancelRef}
          onPendingChange={setRemoving}
          onRemoved={onRemoved}
        />
      </AlertDialogContent>
    </AlertDialog>
  );
}

function RemoveCustomFieldBody({
  field,
  cancelRef,
  onPendingChange,
  onRemoved,
}: {
  field: CustomField;
  cancelRef: React.RefObject<HTMLButtonElement | null>;
  onPendingChange: (pending: boolean) => void;
  onRemoved: (field: CustomField) => void;
}) {
  const preview = useResource(
    "customFields",
    () => api.customFields.removalPreview(field.id),
    `removal:${field.id}`,
  );
  const [remove, removing] = useAction(api.customFields.remove);
  const [done, setDone] = useState(false);
  const pending = removing || done;
  const { one } = OBJECT_COPY[field.objectType];

  async function confirm() {
    if (pending) return;
    onPendingChange(true);
    try {
      await remove(field.id);
      setDone(true);
      onPendingChange(false);
      toast.success("Field removed", {
        description: `${field.label} is no longer on the ${one} form.`,
      });
      onRemoved(field);
    } catch (error) {
      onPendingChange(false);
      toast.error(
        error instanceof ApiError
          ? error.message
          : `Could not remove ${field.label}.`,
      );
    }
  }

  const loadError = loadErrorOf(preview);
  const data = preview.data;

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>Remove {field.label}?</AlertDialogTitle>
        <AlertDialogDescription
          render={<div />}
          className="flex flex-col gap-2"
        >
          {preview.isLoading && data === undefined ? (
            <span className="flex flex-col gap-2" aria-busy="true">
              <span className="sr-only">
                Counting the values {field.label} holds…
              </span>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </span>
          ) : loadError ? (
            <span>
              Removing {field.label} needs a count of the values it holds first.
            </span>
          ) : data ? (
            <span>
              {removalSentence(data.count, field.objectType, field.label)}
            </span>
          ) : null}
        </AlertDialogDescription>
      </AlertDialogHeader>

      {loadError ? (
        <LoadError
          title={`Could not count the values for ${field.label}`}
          message={loadError.message}
          onRetry={() => invalidate("customFields")}
          retrying={preview.isRefreshing}
        />
      ) : null}

      <AlertDialogFooter>
        <AlertDialogCancel ref={cancelRef} disabled={pending}>
          {loadError ? "Close" : "Cancel"}
        </AlertDialogCancel>
        <Button
          type="button"
          variant="destructive"
          disabled={pending || data === undefined}
          focusableWhenDisabled
          className="data-disabled:opacity-50"
          onClick={() => void confirm()}
        >
          {pending ? <Spinner aria-hidden data-icon="inline-start" /> : null}
          {pending ? "Removing…" : "Remove field"}
        </Button>
      </AlertDialogFooter>
    </>
  );
}
