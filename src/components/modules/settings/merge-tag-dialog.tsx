"use client";

import { useId, useRef, useState, type ComponentProps } from "react";
import { toast } from "sonner";

import type { ID } from "@/types";
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
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  tagMergedDescription,
  tagMergeSentences,
  tagOptionLabel,
} from "./tags-copy";

/**
 * Merges `tag` into another tag the user picks (`others`, by name, with
 * their contact counts), after saying what happens.
 *
 * It reads `api.tags.mergePreview()` as it opens, so a tag an automation
 * names says why it can't be merged away (the API's sentence, Close only)
 * before anything is picked. Once a target is picked it reads the preview
 * for that pair: "12 contacts and 3 deals tagged Warm get Hot Lead instead.
 * Hot Lead ends up on 40 contacts. Warm is deleted." "Merge tags" stays
 * disabled (`focusableWhenDisabled`) until a target is picked and its
 * preview is in. Cancel comes first and takes focus as it opens.
 *
 * Confirming keeps the dialog open with the button pending ("Merging…");
 * Escape and Cancel do nothing meanwhile. A failure toasts the API's
 * sentence and leaves the dialog open with focus on the button. Success
 * toasts and calls `onMerged` with the target as the merge returned it (its
 * contact count after the merge). A preview failing to load shows a
 * `LoadError` whose Retry invalidates "tags"; while the source's own
 * preview has failed (no target picked yet), the picker stays hidden, since
 * whether the source may be merged away is not known.
 */
export function MergeTagDialog({
  open,
  onOpenChange,
  tag,
  others,
  onMerged,
  finalFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tag: TagWithCount;
  /** The tags it can be merged into, in the order to list them. */
  others: readonly TagWithCount[];
  onMerged: (source: TagWithCount, target: TagWithCount) => void;
  finalFocus?: ComponentProps<typeof AlertDialogContent>["finalFocus"];
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [merging, setMerging] = useState(false);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // No closing mid-merge: the result is still to come.
        if (!next && merging) return;
        onOpenChange(next);
      }}
    >
      <AlertDialogContent initialFocus={cancelRef} finalFocus={finalFocus}>
        <MergeTagBody
          key={tag.id}
          tag={tag}
          others={others}
          cancelRef={cancelRef}
          onPendingChange={setMerging}
          onMerged={onMerged}
        />
      </AlertDialogContent>
    </AlertDialog>
  );
}

function MergeTagBody({
  tag,
  others,
  cancelRef,
  onPendingChange,
  onMerged,
}: {
  tag: TagWithCount;
  others: readonly TagWithCount[];
  cancelRef: React.RefObject<HTMLButtonElement | null>;
  onPendingChange: (pending: boolean) => void;
  onMerged: (source: TagWithCount, target: TagWithCount) => void;
}) {
  const selectId = useId();
  const [targetId, setTargetId] = useState<ID | null>(null);
  const target = others.find((t) => t.id === targetId) ?? null;
  // One read per pair; without a target, the source's refusal and counts.
  const preview = useResource(
    "tags",
    () => api.tags.mergePreview(tag.id, targetId ?? undefined),
    `merge:${tag.id}:${targetId ?? ""}`,
  );
  const [merge, merging] = useAction(api.tags.merge);
  const [done, setDone] = useState(false);
  const pending = merging || done;

  const loadError = loadErrorOf(preview);
  // While a new pair loads, `data` still holds the last pair's preview.
  const data = preview.isLoading ? undefined : preview.data;
  const refusal = preview.data?.refusal;
  const ready =
    target !== null && data !== undefined && data.contactsAfter !== undefined;

  async function confirm() {
    if (pending || !ready || !target) return;
    onPendingChange(true);
    try {
      const merged = await merge(tag.id, target.id);
      setDone(true);
      onPendingChange(false);
      toast.success("Tags merged", {
        description: tagMergedDescription(tag.name, merged.name),
      });
      onMerged(tag, merged);
    } catch (error) {
      onPendingChange(false);
      toast.error(
        error instanceof ApiError
          ? error.message
          : `Could not merge ${tag.name} into ${target.name}.`,
      );
    }
  }

  const loadingFirst = preview.isLoading && preview.data === undefined;

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>
          {refusal
            ? `${tag.name} can't be merged away`
            : `Merge ${tag.name} into another tag`}
        </AlertDialogTitle>
        <AlertDialogDescription
          render={<div />}
          className="flex flex-col gap-2"
        >
          {loadingFirst ? (
            <span className="flex flex-col gap-2" aria-busy="true">
              <span className="sr-only">Checking {tag.name}…</span>
              <Skeleton className="h-4 w-full" />
            </span>
          ) : refusal ? (
            <span>{refusal}</span>
          ) : (
            <span>
              Pick the tag to keep. Every contact and deal tagged {tag.name}{" "}
              gets it instead, and {tag.name} is deleted.
            </span>
          )}
        </AlertDialogDescription>
      </AlertDialogHeader>

      {/* No picker until the source is checked: with its preview failed,
          a refusal (a tag an automation names) is still unknown. */}
      {refusal || loadingFirst || (loadError && targetId === null) ? null : (
        <Field>
          <FieldLabel htmlFor={selectId}>Merge into</FieldLabel>
          <Select<string>
            value={targetId}
            readOnly={pending}
            onValueChange={(next) => {
              if (next) setTargetId(next);
            }}
          >
            <SelectTrigger id={selectId} className="w-full">
              <SelectValue placeholder="Pick a tag">
                {(id: string | null) => {
                  const t = others.find((o) => o.id === id);
                  return t ? tagOptionLabel(t) : "Pick a tag";
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {others.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {tagOptionLabel(t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}

      {target && !refusal && !loadError ? (
        <div
          className="text-muted-foreground flex flex-col gap-1 text-sm"
          aria-live="polite"
        >
          {data?.contactsAfter !== undefined ? (
            tagMergeSentences(data, tag.name, target.name).map((sentence) => (
              <p key={sentence}>{sentence}</p>
            ))
          ) : (
            <span className="flex flex-col gap-2" aria-busy="true">
              <span className="sr-only">
                Counting what moves to {target.name}…
              </span>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </span>
          )}
        </div>
      ) : null}

      {loadError ? (
        <LoadError
          title={
            target
              ? `Could not count what moves to ${target.name}`
              : `Could not check ${tag.name}`
          }
          message={loadError.message}
          onRetry={() => invalidate("tags")}
          retrying={preview.isRefreshing}
        />
      ) : null}

      <AlertDialogFooter>
        <AlertDialogCancel ref={cancelRef} disabled={pending}>
          {refusal ? "Close" : "Cancel"}
        </AlertDialogCancel>
        {refusal ? null : (
          <Button
            type="button"
            disabled={pending || !ready}
            focusableWhenDisabled
            className="data-disabled:opacity-50"
            onClick={() => void confirm()}
          >
            {pending ? <Spinner aria-hidden data-icon="inline-start" /> : null}
            {pending ? "Merging…" : "Merge tags"}
          </Button>
        )}
      </AlertDialogFooter>
    </>
  );
}
