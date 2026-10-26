"use client";

import { useRef, useState, type ComponentProps } from "react";
import { toast } from "sonner";

import type { Pipeline, PipelineStage } from "@/types";
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
import {
  keepsStatusSentence,
  stageMoveSentence,
  stageRemovedDescription,
} from "./pipelines-copy";

/**
 * Asks before removing `stage` of `pipeline`, and says where its deals go.
 *
 * It reads `api.pipelines.stageRemovalPreview()` as it opens: how many deals
 * move and to which stage ("3 deals move to Contacted."), and, when some of
 * them are closed, that they keep their status ("Won deals stay won."). The
 * pipeline's only stage cannot go: the API's sentence shows with Close
 * only. Cancel comes first and takes focus as it opens.
 *
 * "Remove stage" stays disabled (but focusable) until the preview is in.
 * Confirming keeps the dialog open with the button pending ("Removing…");
 * the dialog cannot close meanwhile. A failure toasts the API's sentence and
 * leaves focus on the button. Success toasts, calls `onRemoved` with the
 * pipeline the API returned (the caller hides the stage, keeps that copy so
 * a failed list read cannot bring the stage back, and closes the dialog)
 * and keeps the button pending
 * (`done`) through the close. The preview failing to load shows a
 * `LoadError` whose Retry invalidates "pipelines".
 */
export function RemoveStageDialog({
  open,
  onOpenChange,
  pipeline,
  stage,
  onRemoved,
  finalFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipeline: Pipeline;
  stage: PipelineStage;
  onRemoved: (stage: PipelineStage, saved: Pipeline) => void;
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
        <RemoveStageBody
          key={stage.id}
          pipeline={pipeline}
          stage={stage}
          cancelRef={cancelRef}
          onPendingChange={setRemoving}
          onRemoved={onRemoved}
        />
      </AlertDialogContent>
    </AlertDialog>
  );
}

function RemoveStageBody({
  pipeline,
  stage,
  cancelRef,
  onPendingChange,
  onRemoved,
}: {
  pipeline: Pipeline;
  stage: PipelineStage;
  cancelRef: React.RefObject<HTMLButtonElement | null>;
  onPendingChange: (pending: boolean) => void;
  onRemoved: (stage: PipelineStage, saved: Pipeline) => void;
}) {
  const preview = useResource(
    "pipelines",
    () => api.pipelines.stageRemovalPreview(pipeline.id, stage.id),
    `stage-removal:${pipeline.id}:${stage.id}`,
  );
  const [removeStage, removing] = useAction(api.pipelines.removeStage);
  const [done, setDone] = useState(false);
  const pending = removing || done;

  const loadError = loadErrorOf(preview);
  const data = preview.data;
  const refusal = data?.refusal;

  async function confirm() {
    if (pending || !data?.moveTo) return;
    onPendingChange(true);
    try {
      const saved = await removeStage(pipeline.id, stage.id);
      setDone(true);
      onPendingChange(false);
      toast.success("Stage removed", {
        description: stageRemovedDescription(data.count, data.moveTo.name),
      });
      onRemoved(stage, saved);
    } catch (error) {
      onPendingChange(false);
      toast.error(
        error instanceof ApiError
          ? error.message
          : `Could not remove ${stage.name}.`,
      );
    }
  }

  const keeps = data && !refusal ? keepsStatusSentence(data.closed) : null;

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>
          {refusal ? `${stage.name} can't be removed` : `Remove ${stage.name}?`}
        </AlertDialogTitle>
        <AlertDialogDescription
          render={<div />}
          className="flex flex-col gap-2"
        >
          {preview.isLoading && data === undefined ? (
            <span className="flex flex-col gap-2" aria-busy="true">
              <span className="sr-only">
                Counting the deals in {stage.name}…
              </span>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </span>
          ) : loadError ? (
            <span>Removing {stage.name} needs a count of its deals first.</span>
          ) : refusal ? (
            <span>{refusal}</span>
          ) : data?.moveTo ? (
            <>
              <span>{stageMoveSentence(data.count, data.moveTo.name)}</span>
              {keeps ? <span>{keeps}</span> : null}
            </>
          ) : null}
        </AlertDialogDescription>
      </AlertDialogHeader>

      {loadError ? (
        <LoadError
          title={`Could not count the deals in ${stage.name}`}
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
            {pending ? "Removing…" : "Remove stage"}
          </Button>
        )}
      </AlertDialogFooter>
    </>
  );
}
