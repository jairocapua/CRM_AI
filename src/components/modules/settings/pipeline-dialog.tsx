"use client";

import { useId, useState, type ComponentProps } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import type { Pipeline } from "@/types";
import * as api from "@/lib/api";
import { ApiError, useAction } from "@/lib/api";
import {
  pipelineFormValues,
  pipelineSchema,
  type PipelineFormValues,
} from "@/lib/validation/pipeline";
import { useUnsavedChanges } from "@/components/providers/unsaved-changes";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldError } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { pipelineErrorField } from "./pipelines-copy";
import { SERVER_ERROR, TextField } from "./settings-form-parts";

/**
 * Creates a pipeline (no `pipeline`) or renames `pipeline`, in a dialog. The
 * form mounts only while the dialog is open, so it opens fresh every time.
 * While a save is on its way the dialog cannot close (Cancel is disabled;
 * Escape, the close button and an outside click do nothing), so the result
 * always lands in the form.
 */
export function PipelineDialog({
  open,
  onOpenChange,
  pipeline,
  onSaved,
  finalFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The pipeline to rename; none to create one. */
  pipeline: Pipeline | null;
  onSaved: (pipeline: Pipeline) => void;
  finalFocus?: ComponentProps<typeof DialogContent>["finalFocus"];
}) {
  const [saving, setSaving] = useState(false);
  const titleId = useId();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // No closing mid-save: a failure must land in a mounted form.
        if (!next && saving) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md" finalFocus={finalFocus}>
        <DialogHeader>
          <DialogTitle id={titleId}>
            {pipeline ? "Rename pipeline" : "New pipeline"}
          </DialogTitle>
          <DialogDescription>
            {pipeline
              ? "The new name shows on the board and in the deal form."
              : "It starts with two stages, New and Won; add and arrange the rest here."}
          </DialogDescription>
        </DialogHeader>
        <PipelineForm
          key={pipeline?.id ?? "new"}
          titleId={titleId}
          pipeline={pipeline}
          onPendingChange={setSaving}
          onSaved={onSaved}
        />
      </DialogContent>
    </Dialog>
  );
}

/**
 * The pipeline form: React Hook Form + zod (`pipelineSchema`, the rules the
 * API checks too) through the `Field*` components. A refusal about the name
 * (another pipeline has it) marks and focuses it; any other shows above the
 * buttons. Either way what was typed stays. Success toasts, resets the form
 * and calls `onSaved`. While changed, a reload or a closed tab asks first.
 */
function PipelineForm({
  titleId,
  pipeline,
  onPendingChange,
  onSaved,
}: {
  titleId: string;
  pipeline: Pipeline | null;
  onPendingChange: (pending: boolean) => void;
  onSaved: (pipeline: Pipeline) => void;
}) {
  const form = useForm<PipelineFormValues>({
    resolver: zodResolver(pipelineSchema),
    defaultValues: pipelineFormValues(pipeline),
  });
  const { errors, isDirty } = form.formState;
  useUnsavedChanges(isDirty ? "the pipeline" : null);
  const [create, creating] = useAction(api.pipelines.create);
  const [update, updating] = useAction(api.pipelines.update);
  const saving = creating || updating;

  async function submit(values: PipelineFormValues) {
    // Enter submits too, whatever the button's state: one save at a time.
    if (saving) return;
    form.clearErrors(SERVER_ERROR);
    onPendingChange(true);
    try {
      const saved = pipeline
        ? await update(pipeline.id, { name: values.name })
        : await create({ name: values.name });
      onPendingChange(false);
      toast.success(pipeline ? "Pipeline renamed" : "Pipeline created");
      form.reset(pipelineFormValues(saved));
      onSaved(saved);
    } catch (error) {
      onPendingChange(false);
      const message =
        error instanceof ApiError
          ? error.message
          : "Could not save the pipeline.";
      const field = pipelineErrorField(error);
      if (field) form.setError(field, { message }, { shouldFocus: true });
      else form.setError(SERVER_ERROR, { message });
    }
  }

  return (
    <form
      aria-labelledby={titleId}
      noValidate
      onSubmit={form.handleSubmit(submit)}
      className="flex flex-col gap-6"
    >
      <TextField form={form} name="name" label="Name" autoComplete="off" />
      <FieldError errors={[errors.root?.server]} />
      <DialogFooter>
        <DialogClose
          disabled={saving}
          render={<Button type="button" variant="outline" />}
        >
          Cancel
        </DialogClose>
        <Button
          type="submit"
          disabled={saving}
          focusableWhenDisabled
          className="data-disabled:opacity-50"
        >
          {saving ? <Spinner aria-hidden data-icon="inline-start" /> : null}
          {saving
            ? pipeline
              ? "Saving…"
              : "Creating…"
            : pipeline
              ? "Save name"
              : "Create pipeline"}
        </Button>
      </DialogFooter>
    </form>
  );
}
