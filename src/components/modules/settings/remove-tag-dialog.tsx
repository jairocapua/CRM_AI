"use client";

import { useRef, useState, type ComponentProps } from "react";
import { toast } from "sonner";

import * as api from "@/lib/api";
import {
  ApiError,
  invalidate,
  loadErrorOf,
  useAction,
  useResource,
  type TagWithCount,
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
import { tagRemovalSentence } from "./tags-copy";

/**
 * Asks before removing `tag`, and says who loses it.
 *
 * It reads `api.tags.removalPreview()` as it opens: how many contacts and
 * deals carry the tag ("12 contacts and 3 deals lose this tag."), or why it
 * can't go (an automation names it: the API's sentence, with Close only).
 * The confirm button shows enabled once the count is in. Cancel comes first
 * and takes focus as it opens.
 *
 * Confirming keeps the dialog open with the button pending ("Removing…").
 * The button stays focusable meanwhile (`focusableWhenDisabled`), so a
 * failure, told in a toast with the API's sentence, leaves the dialog open
 * and focus where it was. Success toasts, calls `onRemoved` (the caller
 * hides the row and closes the dialog) and keeps the button pending (`done`)
 * through the close. The count failing to load shows a `LoadError` whose
 * Retry invalidates "tags".
 */
export function RemoveTagDialog({
  open,
  onOpenChange,
  tag,
  onRemoved,
  finalFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tag: TagWithCount;
  onRemoved: (tag: TagWithCount) => void;
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
        <RemoveTagBody
          key={tag.id}
          tag={tag}
          cancelRef={cancelRef}
          onPendingChange={setRemoving}
          onRemoved={onRemoved}
        />
      </AlertDialogContent>
    </AlertDialog>
  );
}

function RemoveTagBody({
  tag,
  cancelRef,
  onPendingChange,
  onRemoved,
}: {
  tag: TagWithCount;
  cancelRef: React.RefObject<HTMLButtonElement | null>;
  onPendingChange: (pending: boolean) => void;
  onRemoved: (tag: TagWithCount) => void;
}) {
  const preview = useResource(
    "tags",
    () => api.tags.removalPreview(tag.id),
    `removal:${tag.id}`,
  );
  const [remove, removing] = useAction(api.tags.remove);
  const [done, setDone] = useState(false);
  const pending = removing || done;

  const loadError = loadErrorOf(preview);
  const data = preview.data;
  const refusal = data?.refusal;

  async function confirm() {
    if (pending || !data || refusal) return;
    onPendingChange(true);
    try {
      await remove(tag.id);
      setDone(true);
      onPendingChange(false);
      toast.success("Tag removed", {
        description: `${tag.name} is no longer on any contact or deal.`,
      });
      onRemoved(tag);
    } catch (error) {
      onPendingChange(false);
      toast.error(
        error instanceof ApiError
          ? error.message
          : `Could not remove ${tag.name}.`,
      );
    }
  }

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>
          {refusal ? `${tag.name} can't be removed` : `Remove ${tag.name}?`}
        </AlertDialogTitle>
        <AlertDialogDescription
          render={<div />}
          className="flex flex-col gap-2"
        >
          {preview.isLoading && data === undefined ? (
            <span className="flex flex-col gap-2" aria-busy="true">
              <span className="sr-only">
                Counting the contacts and deals tagged {tag.name}…
              </span>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </span>
          ) : loadError ? (
            <span>
              Removing {tag.name} needs a count of the contacts and deals tagged
              with it first.
            </span>
          ) : refusal ? (
            <span>{refusal}</span>
          ) : data ? (
            <span>{tagRemovalSentence(data.contacts, data.deals)}</span>
          ) : null}
        </AlertDialogDescription>
      </AlertDialogHeader>

      {loadError ? (
        <LoadError
          title={`Could not count the records tagged ${tag.name}`}
          message={loadError.message}
          onRetry={() => invalidate("tags")}
          retrying={preview.isRefreshing}
        />
      ) : null}

      <AlertDialogFooter>
        <AlertDialogCancel ref={cancelRef} disabled={pending}>
          {refusal || loadError ? "Close" : "Cancel"}
        </AlertDialogCancel>
        {refusal ? null : (
          <Button
            type="button"
            variant="destructive"
            disabled={pending || data === undefined}
            focusableWhenDisabled
            className="data-disabled:opacity-50"
            onClick={() => void confirm()}
          >
            {pending ? <Spinner aria-hidden data-icon="inline-start" /> : null}
            {pending ? "Removing…" : "Remove tag"}
          </Button>
        )}
      </AlertDialogFooter>
    </>
  );
}
