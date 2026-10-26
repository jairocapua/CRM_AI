"use client";

import { useId, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import type { Pipeline, PipelineStage } from "@/types";
import * as api from "@/lib/api";
import { ApiError, useAction } from "@/lib/api";
import {
  EMPTY_STAGE,
  stageFormValues,
  stageSchema,
  type StageFormValues,
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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { ColorSwatchPicker } from "./color-swatch-picker";
import { isClosedStage, stageErrorField } from "./pipelines-copy";
import { SERVER_ERROR, TextField } from "./settings-form-parts";

/**
 * Adds a stage to `pipeline` (no `stage`) or edits `stage`, in a dialog. The
 * form mounts only while the dialog is open. While a save is on its way the
 * dialog cannot close, so the result always lands in the form.
 */
export function StageDialog({
  open,
  onOpenChange,
  pipeline,
  stage,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipeline: Pipeline;
  /** The stage to edit; none to add one. */
  stage: PipelineStage | null;
  onSaved: (pipeline: Pipeline) => void;
}) {
  const [saving, setSaving] = useState(false);
  const titleId = useId();
  const firstClosed = [...pipeline.stages]
    .sort((a, b) => a.position - b.position)
    .find(isClosedStage);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // No closing mid-save: a failure must land in a mounted form.
        if (!next && saving) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle id={titleId}>
            {stage ? "Edit stage" : "Add stage"}
          </DialogTitle>
          <DialogDescription>
            {stage
              ? `Changes show on the ${pipeline.name} board.`
              : firstClosed
                ? `Adds a stage to ${pipeline.name}, just before ${firstClosed.name}.`
                : `Adds a stage to the end of ${pipeline.name}.`}
          </DialogDescription>
        </DialogHeader>
        <StageForm
          key={stage?.id ?? "new"}
          titleId={titleId}
          pipeline={pipeline}
          stage={stage}
          onPendingChange={setSaving}
          onSaved={onSaved}
        />
      </DialogContent>
    </Dialog>
  );
}

/**
 * The stage form: React Hook Form + zod (`stageSchema`, the rules the API
 * checks too) through the `Field*` components: Name, Colour (swatches) and
 * Probability (a whole percentage). A refusal about one input (a name the
 * pipeline already has) marks and focuses it; any other shows above the
 * buttons. What was typed stays. Success toasts, resets the form and calls
 * `onSaved`. While changed, a reload or a closed tab asks first.
 */
function StageForm({
  titleId,
  pipeline,
  stage,
  onPendingChange,
  onSaved,
}: {
  titleId: string;
  pipeline: Pipeline;
  stage: PipelineStage | null;
  onPendingChange: (pending: boolean) => void;
  onSaved: (pipeline: Pipeline) => void;
}) {
  const colorLegendId = useId();
  const probabilityId = useId();
  const form = useForm<StageFormValues>({
    resolver: zodResolver(stageSchema),
    defaultValues: stage ? stageFormValues(stage) : EMPTY_STAGE,
  });
  const { errors, isDirty } = form.formState;
  useUnsavedChanges(isDirty ? "the stage" : null);
  const [addStage, adding] = useAction(api.pipelines.addStage);
  const [updateStage, updating] = useAction(api.pipelines.updateStage);
  const saving = adding || updating;

  async function submit(values: StageFormValues) {
    // Enter submits too, whatever the button's state: one save at a time.
    if (saving) return;
    form.clearErrors(SERVER_ERROR);
    onPendingChange(true);
    try {
      const draft = {
        name: values.name,
        color: values.color,
        probability: values.probability,
      };
      const saved = stage
        ? await updateStage(pipeline.id, stage.id, draft)
        : await addStage(pipeline.id, draft);
      onPendingChange(false);
      toast.success(stage ? "Stage saved" : "Stage added");
      form.reset(values);
      onSaved(saved);
    } catch (error) {
      onPendingChange(false);
      const message =
        error instanceof ApiError ? error.message : "Could not save the stage.";
      const field = stageErrorField(error);
      if (field) form.setError(field, { message }, { shouldFocus: true });
      else form.setError(SERVER_ERROR, { message });
    }
  }

  const probabilityError = errors.probability;
  const probabilityDescribedBy = [
    `${probabilityId}-description`,
    probabilityError ? `${probabilityId}-error` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <form
      aria-labelledby={titleId}
      noValidate
      onSubmit={form.handleSubmit(submit)}
      className="flex flex-col gap-6"
    >
      <div className="flex flex-col gap-4">
        <TextField form={form} name="name" label="Name" autoComplete="off" />

        <Controller
          control={form.control}
          name="color"
          render={({ field, fieldState: { error } }) => (
            <FieldSet data-invalid={error ? true : undefined} className="gap-2">
              <FieldLegend id={colorLegendId} variant="label">
                Colour
              </FieldLegend>
              <ColorSwatchPicker
                value={field.value}
                onValueChange={field.onChange}
                onBlur={field.onBlur}
                labelledBy={colorLegendId}
                describedBy={error ? `${colorLegendId}-error` : undefined}
                invalid={Boolean(error)}
              />
              <FieldError id={`${colorLegendId}-error`} errors={[error]} />
            </FieldSet>
          )}
        />

        <Field data-invalid={probabilityError ? true : undefined}>
          <FieldLabel htmlFor={probabilityId}>Probability</FieldLabel>
          <InputGroup className="max-w-36">
            <InputGroupInput
              id={probabilityId}
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              step={1}
              aria-invalid={probabilityError ? true : undefined}
              aria-describedby={probabilityDescribedBy}
              {...form.register("probability", { valueAsNumber: true })}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupText>%</InputGroupText>
            </InputGroupAddon>
          </InputGroup>
          <FieldDescription id={`${probabilityId}-description`}>
            How likely a deal here is to close; the board weights its forecast
            by it.
          </FieldDescription>
          <FieldError
            id={`${probabilityId}-error`}
            errors={[probabilityError]}
          />
        </Field>
      </div>

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
            ? stage
              ? "Saving…"
              : "Adding…"
            : stage
              ? "Save changes"
              : "Add stage"}
        </Button>
      </DialogFooter>
    </form>
  );
}
