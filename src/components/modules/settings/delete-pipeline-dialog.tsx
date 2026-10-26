"use client";

import { useRef, useState, type ComponentProps } from "react";
import { toast } from "sonner";

import type { Pipeline } from "@/types";
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
import { pipelineDeletionSentence } from "./pipelines-copy";

/**
 * Asks before deleting `pipeline`, and says what goes with it.
 *
 * It reads `api.pipelines.removalPreview()` as it opens: how many deals are
 * deleted with it (with their timeline entries; their tasks stay, detached),
 * and which pipeline becomes the default when the default goes. The only
 * pipeline cannot go: the API's sentence shows with Close only. Cancel comes
 * first and takes focus as it opens.
 *
 * "Delete pipeline" stays disabled (but focusable) until the preview is in.
 * Confirming keeps the dialog open with the button pending ("Deleting…");
 * the dialog cannot close meanwhile. A failure toasts the API's sentence and
 * leaves focus on the button. Success toasts, calls `onDeleted` (the caller
 * hides the pipeline, picks another and closes the dialog) and keeps the
 * button pending (`done`) through the close. The preview failing to load
 * shows a `LoadError` whose Retry invalidates "pipelines".
 */
export function DeletePipelineDialog({
  open,
  onOpenChange,
  pipeline,
  onDeleted,
  finalFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipeline: Pipeline;
  onDeleted: (pipeline: Pipeline) => void;
  finalFocus?: ComponentProps<typeof AlertDialogContent>["finalFocus"];
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [deleting, setDeleting] = useState(false);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // No closing mid-delete: the result is still to come.
        if (!next && deleting) return;
        onOpenChange(next);
      }}
    >
      <AlertDialogContent initialFocus={cancelRef} finalFocus={finalFocus}>
        <DeletePipelineBody
          key={pipeline.id}
          pipeline={pipeline}
          cancelRef={cancelRef}
          onPendingChange={setDeleting}
          onDeleted={onDeleted}
        />
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeletePipelineBody({
  pipeline,
  cancelRef,
  onPendingChange,
  onDeleted,
}: {
  pipeline: Pipeline;
  cancelRef: React.RefObject<HTMLButtonElement | null>;
  onPendingChange: (pending: boolean) => void;
  onDeleted: (pipeline: Pipeline) => void;
}) {
  const preview = useResource(
    "pipelines",
    () => api.pipelines.removalPreview(pipeline.id),
    `removal:${pipeline.id}`,
  );
  const [remove, removing] = useAction(api.pipelines.remove);
  const [done, setDone] = useState(false);
  const pending = removing || done;

  const loadError = loadErrorOf(preview);
  const data = preview.data;
  const refusal = data?.refusal;

  async function confirm() {
    if (pending || data === undefined) return;
    onPendingChange(true);
    try {
      await remove(pipeline.id);
      setDone(true);
      onPendingChange(false);
      toast.success("Pipeline deleted", {
        description: `${pipeline.name} is no longer on the board.`,
      });
      onDeleted(pipeline);
    } catch (error) {
      onPendingChange(false);
      toast.error(
        error instanceof ApiError
          ? error.message
          : `Could not delete ${pipeline.name}.`,
      );
    }
  }

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>
          {refusal
            ? `${pipeline.name} can't be deleted`
            : `Delete ${pipeline.name}?`}
        </AlertDialogTitle>
        <AlertDialogDescription
          render={<div />}
          className="flex flex-col gap-2"
        >
          {preview.isLoading && data === undefined ? (
            <span className="flex flex-col gap-2" aria-busy="true">
              <span className="sr-only">
                Counting the deals in {pipeline.name}…
              </span>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </span>
          ) : loadError ? (
            <span>
              Deleting {pipeline.name} needs a count of its deals first.
            </span>
          ) : refusal ? (
            <span>{refusal}</span>
          ) : data ? (
            <>
              <span>{pipelineDeletionSentence(data.deals)}</span>
              {data.becomesDefault ? (
                <span>
                  {data.becomesDefault.name} becomes the default pipeline.
                </span>
              ) : null}
            </>
          ) : null}
        </AlertDialogDescription>
      </AlertDialogHeader>

      {loadError ? (
        <LoadError
          title={`Could not count the deals in ${pipeline.name}`}
          message={loadError.message}
          onRetry={() => invalidate("pipelines")}
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
            {pending ? "Deleting…" : "Delete pipeline"}
          </Button>
        )}
      </AlertDialogFooter>
    </>
  );
}
