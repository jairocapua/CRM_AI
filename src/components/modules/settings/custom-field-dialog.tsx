"use client";

import { useId, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon, XIcon } from "lucide-react";
import {
  Controller,
  useFieldArray,
  useForm,
  useWatch,
  type Resolver,
} from "react-hook-form";
import { toast } from "sonner";

import type { CustomField, CustomFieldType } from "@/types";
import * as api from "@/lib/api";
import { ApiError, useAction } from "@/lib/api";
import {
  CUSTOM_FIELD_TYPE_LABELS,
  CUSTOM_FIELD_TYPES,
  customFieldSchema,
  EMPTY_CUSTOM_FIELD,
  formValuesFromField,
  hasOptions,
  toCustomFieldInput,
  usesHelpText,
  usesPlaceholder,
  usesRequired,
  type CustomFieldDefinition,
  type CustomFieldFormValues,
} from "@/lib/validation/custom-field-definition";
import { useUnsavedChanges } from "@/components/providers/unsaved-changes";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  customFieldErrorPath,
  OBJECT_COPY,
  type CustomFieldObjectType,
} from "./custom-fields-copy";
import { ReadOnlyField, SERVER_ERROR, TextField } from "./settings-form-parts";

/**
 * Adds a field to `objectType` (no `field`) or edits `field`, in a dialog.
 * The form mounts only while the dialog is open, so it opens fresh every
 * time. While a save is on its way the dialog cannot close (Cancel is
 * disabled; Escape, the close button and an outside click do nothing), so
 * the result always lands in the form.
 */
export function CustomFieldDialog({
  open,
  onOpenChange,
  objectType,
  field,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  objectType: CustomFieldObjectType;
  /** The field to edit; none to add one. */
  field: CustomField | null;
  onSaved: (field: CustomField) => void;
}) {
  const [saving, setSaving] = useState(false);
  const titleId = useId();
  const { one } = OBJECT_COPY[objectType];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // No closing mid-save: a failure must land in a mounted form.
        if (!next && saving) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle id={titleId}>
            {field ? `Edit ${one} field` : `Add ${one} field`}
          </DialogTitle>
          <DialogDescription>
            {field
              ? `Changes show on the ${one} form. Values already saved are kept.`
              : `New fields go at the end of the ${one} form.`}
          </DialogDescription>
        </DialogHeader>
        <CustomFieldForm
          key={field?.id ?? "new"}
          titleId={titleId}
          objectType={objectType}
          field={field}
          onPendingChange={setSaving}
          onSaved={onSaved}
        />
      </DialogContent>
    </Dialog>
  );
}

/**
 * The field form: React Hook Form + zod (`customFieldSchema`, the rules the
 * API checks too) through the `Field*` components.
 *
 * - Type is a Select when adding; when editing it shows as read-only text,
 *   since the API keeps a field's type.
 * - Required, Placeholder and Help text show only for a type the contact
 *   and deal forms use them on (`usesRequired`, `usesPlaceholder`,
 *   `usesHelpText`); Options only for a Dropdown or Multi-select, at least
 *   one row.
 * - A refusal about one field (a label another field already has) marks it
 *   and focuses it; any other (a network failure) shows above the buttons.
 *   Either way everything typed stays. Success toasts, resets the form and
 *   calls `onSaved`.
 * - While something is changed, a reload or a closed tab asks first
 *   (`useUnsavedChanges`); the dialog is modal, so no link can be clicked
 *   meanwhile.
 */
function CustomFieldForm({
  titleId,
  objectType,
  field,
  onPendingChange,
  onSaved,
}: {
  titleId: string;
  objectType: CustomFieldObjectType;
  field: CustomField | null;
  onPendingChange: (pending: boolean) => void;
  onSaved: (field: CustomField) => void;
}) {
  const typeId = useId();
  const requiredId = useId();
  const { one } = OBJECT_COPY[objectType];
  const form = useForm<CustomFieldFormValues, unknown, CustomFieldDefinition>({
    resolver: zodResolver(customFieldSchema) as Resolver<
      CustomFieldFormValues,
      unknown,
      CustomFieldDefinition
    >,
    defaultValues: field ? formValuesFromField(field) : EMPTY_CUSTOM_FIELD,
  });
  const options = useFieldArray({ control: form.control, name: "options" });
  const { errors, isDirty } = form.formState;
  useUnsavedChanges(isDirty ? "the field" : null);
  const [create, creating] = useAction(api.customFields.create);
  const [update, updating] = useAction(api.customFields.update);
  const saving = creating || updating;
  const type = useWatch({ control: form.control, name: "type" });

  async function submit(values: CustomFieldDefinition) {
    // Enter submits too, whatever the button's state: one save at a time.
    if (saving) return;
    form.clearErrors(SERVER_ERROR);
    onPendingChange(true);
    try {
      const input = toCustomFieldInput(values);
      const saved = field
        ? await update(field.id, {
            label: input.label,
            required: input.required,
            placeholder: input.placeholder,
            helpText: input.helpText,
            options: input.options,
          })
        : await create({ objectType, ...input });
      onPendingChange(false);
      toast.success(field ? "Field saved" : "Field added");
      form.reset(formValuesFromField(saved));
      onSaved(saved);
    } catch (error) {
      onPendingChange(false);
      const message =
        error instanceof ApiError ? error.message : "Could not save the field.";
      const path = customFieldErrorPath(error);
      if (path) form.setError(path, { message }, { shouldFocus: true });
      else form.setError(SERVER_ERROR, { message });
    }
  }

  function removeOption(index: number) {
    const remaining = options.fields.length - 1;
    options.remove(index);
    // The pressed button is gone: focus the row that took its place.
    requestAnimationFrame(() =>
      form.setFocus(`options.${Math.min(index, remaining - 1)}.label`),
    );
  }

  const optionsError =
    errors.options?.message ?? errors.options?.root?.message ?? undefined;

  return (
    <form
      aria-labelledby={titleId}
      noValidate
      onSubmit={form.handleSubmit(submit)}
      className="flex flex-col gap-6"
    >
      <div className="flex flex-col gap-4">
        <TextField form={form} name="label" label="Label" autoComplete="off" />

        {field ? (
          <ReadOnlyField
            label="Type"
            value={CUSTOM_FIELD_TYPE_LABELS[field.type]}
            description="A field's type can't change once it is added."
          />
        ) : (
          <Controller
            control={form.control}
            name="type"
            render={({ field: rhf, fieldState: { error } }) => (
              <Field data-invalid={error ? true : undefined}>
                <FieldLabel htmlFor={typeId}>Type</FieldLabel>
                <Select
                  value={rhf.value}
                  onValueChange={(value) => {
                    if (value) rhf.onChange(value);
                  }}
                >
                  <SelectTrigger
                    id={typeId}
                    className="w-full"
                    aria-invalid={error ? true : undefined}
                    onBlur={rhf.onBlur}
                  >
                    <SelectValue>
                      {(value: string) =>
                        CUSTOM_FIELD_TYPE_LABELS[value as CustomFieldType]
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {CUSTOM_FIELD_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {CUSTOM_FIELD_TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError errors={[error]} />
              </Field>
            )}
          />
        )}

        {hasOptions(type) ? (
          <FieldSet className="gap-3">
            <FieldLegend variant="label">Options</FieldLegend>
            <ol className="flex flex-col gap-2">
              {options.fields.map((row, index) => (
                <OptionRow
                  key={row.id}
                  form={form}
                  index={index}
                  canRemove={options.fields.length > 1}
                  onRemove={() => removeOption(index)}
                />
              ))}
            </ol>
            {optionsError ? (
              <FieldError errors={[{ message: optionsError }]} />
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => options.append({ label: "" })}
            >
              <PlusIcon data-icon="inline-start" aria-hidden />
              Add option
            </Button>
          </FieldSet>
        ) : null}

        {usesRequired(type) ? (
          <Controller
            control={form.control}
            name="required"
            render={({ field: rhf }) => (
              <Field orientation="horizontal">
                <Checkbox
                  id={requiredId}
                  checked={rhf.value}
                  onCheckedChange={(checked) => rhf.onChange(checked === true)}
                  onBlur={rhf.onBlur}
                  aria-describedby={`${requiredId}-description`}
                />
                <div className="flex flex-col gap-1">
                  <FieldLabel htmlFor={requiredId}>Required</FieldLabel>
                  <FieldDescription id={`${requiredId}-description`}>
                    The {one} form won&apos;t save without a value.
                  </FieldDescription>
                </div>
              </Field>
            )}
          />
        ) : null}

        {usesPlaceholder(type) ? (
          <TextField
            form={form}
            name="placeholder"
            label="Placeholder"
            optional
            autoComplete="off"
            description="Shown in the field while it is empty."
          />
        ) : null}

        {usesHelpText(type) ? (
          <TextField
            form={form}
            name="helpText"
            label="Help text"
            optional
            autoComplete="off"
            description="Shown under the field."
          />
        ) : null}
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
          {saving ? "Saving…" : field ? "Save changes" : "Add field"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** One option's name input and its Remove button. */
function OptionRow({
  form,
  index,
  canRemove,
  onRemove,
}: {
  form: ReturnType<
    typeof useForm<CustomFieldFormValues, unknown, CustomFieldDefinition>
  >;
  index: number;
  canRemove: boolean;
  onRemove: () => void;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const name = `options.${index}.label` as const;
  const { error } = form.getFieldState(name, form.formState);
  const label = `Option ${index + 1}`;

  return (
    <li className="flex items-start gap-2">
      <Field data-invalid={error ? true : undefined} className="flex-1">
        <Input
          id={id}
          aria-label={label}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          autoComplete="off"
          {...form.register(name)}
        />
        <FieldError id={errorId} errors={[error]} />
      </Field>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Remove option ${index + 1}`}
        disabled={!canRemove}
        onClick={onRemove}
      >
        <XIcon aria-hidden />
      </Button>
    </li>
  );
}
