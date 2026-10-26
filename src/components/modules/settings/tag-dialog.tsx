"use client";

import { useId, useState, type ComponentProps } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import type { Tag } from "@/types";
import * as api from "@/lib/api";
import { ApiError, useAction, type TagWithCount } from "@/lib/api";
import {
  EMPTY_TAG,
  tagFormValues,
  tagSchema,
  type TagFormValues,
} from "@/lib/validation/tag";
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
import { FieldError, FieldLegend, FieldSet } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { ColorSwatchPicker } from "./color-swatch-picker";
import { ReadOnlyField, SERVER_ERROR, TextField } from "./settings-form-parts";
import { tagErrorField } from "./tags-copy";

/**
 * Creates a tag (no `tag`) or edits `tag`, in a dialog. The form mounts
 * only while the dialog is open, so it opens fresh every time. While a save
 * is on its way the dialog cannot close (Cancel is disabled; Escape, the
 * close button and an outside click do nothing), so the result always lands
 * in the form.
 */
export function TagDialog({
  open,
  onOpenChange,
  tag,
  onSaved,
  finalFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The tag to edit; none to create one. */
  tag: TagWithCount | null;
  onSaved: (tag: Tag) => void;
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
      <DialogContent
        finalFocus={finalFocus}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle id={titleId}>{tag ? "Edit tag" : "New tag"}</DialogTitle>
          <DialogDescription>
            {tag
              ? `Changes show on every contact and deal tagged ${tag.name}.`
              : "You can then add it to contacts and deals as you edit them."}
          </DialogDescription>
        </DialogHeader>
        <TagForm
          key={tag?.id ?? "new"}
          titleId={titleId}
          tag={tag}
          onPendingChange={setSaving}
          onSaved={onSaved}
        />
      </DialogContent>
    </Dialog>
  );
}

/**
 * The tag form: React Hook Form + zod (`tagSchema`, the rules the API checks
 * too) through the `Field*` components: Name and Colour (swatches). A tag
 * an automation names keeps its name: it shows read-only with the reason
 * (`renameRefusal`, the API's sentence), and only the colour is sent. A
 * refusal about one input (a name another tag has) marks and focuses it;
 * any other shows above the buttons. What was typed stays. Success toasts,
 * resets the form and calls `onSaved`. While changed, a reload or a closed
 * tab asks first.
 */
function TagForm({
  titleId,
  tag,
  onPendingChange,
  onSaved,
}: {
  titleId: string;
  tag: TagWithCount | null;
  onPendingChange: (pending: boolean) => void;
  onSaved: (tag: Tag) => void;
}) {
  const colorLegendId = useId();
  const form = useForm<TagFormValues>({
    resolver: zodResolver(tagSchema),
    defaultValues: tag ? tagFormValues(tag) : EMPTY_TAG,
  });
  const { errors, isDirty } = form.formState;
  useUnsavedChanges(isDirty ? "the tag" : null);
  const [create, creating] = useAction(api.tags.create);
  const [update, updating] = useAction(api.tags.update);
  const saving = creating || updating;
  const nameLocked = tag?.renameRefusal;

  async function submit(values: TagFormValues) {
    // Enter submits too, whatever the button's state: one save at a time.
    if (saving) return;
    form.clearErrors(SERVER_ERROR);
    onPendingChange(true);
    try {
      const saved = tag
        ? await update(
            tag.id,
            nameLocked
              ? { color: values.color }
              : { name: values.name, color: values.color },
          )
        : await create({ name: values.name, color: values.color });
      onPendingChange(false);
      toast.success(tag ? "Tag saved" : "Tag created");
      form.reset(values);
      onSaved(saved);
    } catch (error) {
      onPendingChange(false);
      const message =
        error instanceof ApiError ? error.message : "Could not save the tag.";
      const field = tagErrorField(error);
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
      <div className="flex flex-col gap-4">
        {nameLocked && tag ? (
          <ReadOnlyField
            label="Name"
            value={tag.name}
            description={nameLocked}
          />
        ) : (
          <TextField form={form} name="name" label="Name" autoComplete="off" />
        )}

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
            ? tag
              ? "Saving…"
              : "Creating…"
            : tag
              ? "Save changes"
              : "Create tag"}
        </Button>
      </DialogFooter>
    </form>
  );
}
