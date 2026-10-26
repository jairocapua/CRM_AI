"use client";

import { useId, useMemo, type ComponentProps } from "react";
import {
  Controller,
  type FieldValues,
  type Path,
  type UseFormReturn,
} from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { timeZoneOptions, zoneLabel } from "./time-zones";

/**
 * The pieces the profile and business forms share: labelled fields wired to
 * React Hook Form through the `Field*` components (each error is linked to
 * its input with `aria-describedby`), a read-only field, the time zone
 * picker, the Save footer and the loading skeleton.
 */

/** Where a form keeps the API's refusal, shown above its Save button. */
export const SERVER_ERROR = "root.server" as const;

/** "(optional)" after a label, part of the input's accessible name. */
function OptionalMark() {
  return <span className="text-muted-foreground font-normal">(optional)</span>;
}

/**
 * A text input for `name`, with its label, error and optional hint. `TOut`
 * is the form's submitted shape, when its resolver transforms the values.
 */
export function TextField<T extends FieldValues, TOut extends FieldValues = T>({
  form,
  name,
  label,
  optional = false,
  description,
  ...input
}: {
  form: UseFormReturn<T, unknown, TOut>;
  name: Path<T>;
  label: string;
  optional?: boolean;
  description?: string;
} & Omit<ComponentProps<typeof Input>, "id" | "name" | "form">) {
  const id = useId();
  const errorId = `${id}-error`;
  const descriptionId = `${id}-description`;
  const { error } = form.getFieldState(name, form.formState);
  const describedBy =
    [description ? descriptionId : null, error ? errorId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>
        {label}
        {optional ? (
          <>
            {" "}
            <OptionalMark />
          </>
        ) : null}
      </FieldLabel>
      <Input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...input}
        {...form.register(name)}
      />
      {description ? (
        <FieldDescription id={descriptionId}>{description}</FieldDescription>
      ) : null}
      <FieldError id={errorId} errors={[error]} />
    </Field>
  );
}

/** A value shown in a labelled, read-only input, with why it is fixed. */
export function ReadOnlyField({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description: React.ReactNode;
}) {
  const id = useId();
  const descriptionId = `${id}-description`;
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        readOnly
        value={value}
        aria-describedby={descriptionId}
        className="bg-muted/50 dark:bg-muted/50"
      />
      <FieldDescription id={descriptionId}>{description}</FieldDescription>
    </Field>
  );
}

/** A searchable list of time zones for `name`, with its label and error. */
export function TimeZoneField<T extends FieldValues>({
  form,
  name,
  label,
  description,
}: {
  form: UseFormReturn<T>;
  name: Path<T>;
  label: string;
  description?: string;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const descriptionId = `${id}-description`;

  return (
    <Controller
      control={form.control}
      name={name}
      render={({ field, fieldState: { error } }) => (
        <Field data-invalid={error ? true : undefined}>
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          <TimeZoneCombobox
            id={id}
            value={field.value as string}
            onChange={field.onChange}
            onBlur={field.onBlur}
            invalid={Boolean(error)}
            describedBy={
              [description ? descriptionId : null, error ? errorId : null]
                .filter(Boolean)
                .join(" ") || undefined
            }
          />
          {description ? (
            <FieldDescription id={descriptionId}>
              {description}
            </FieldDescription>
          ) : null}
          <FieldError id={errorId} errors={[error]} />
        </Field>
      )}
    />
  );
}

function TimeZoneCombobox({
  id,
  value,
  onChange,
  onBlur,
  invalid,
  describedBy,
}: {
  id: string;
  value: string;
  onChange: (zone: string) => void;
  onBlur: () => void;
  invalid: boolean;
  describedBy: string | undefined;
}) {
  const zones = useMemo(() => timeZoneOptions(value), [value]);
  return (
    <Combobox<string, false>
      items={zones}
      value={value === "" ? null : value}
      onValueChange={(next) => onChange(next ?? "")}
      itemToStringLabel={zoneLabel}
    >
      <ComboboxInput
        id={id}
        placeholder="Search time zones…"
        onBlur={onBlur}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className="w-full"
      />
      <ComboboxContent>
        <ComboboxEmpty>No time zone matches.</ComboboxEmpty>
        <ComboboxList>
          {(zone: string) => (
            <ComboboxItem key={zone} value={zone}>
              {zoneLabel(zone)}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

/**
 * The API's refusal (`root.server`) and the Save button. The button stays
 * focusable while the save runs (`focusableWhenDisabled`): a natively
 * disabled button would drop focus to `<body>`.
 */
export function SaveFooter({
  serverError,
  saving,
}: {
  serverError: { message?: string } | undefined;
  saving: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 border-t pt-4">
      <FieldError errors={[serverError]} />
      <Button
        type="submit"
        disabled={saving}
        focusableWhenDisabled
        className="self-start data-disabled:opacity-50"
      >
        {saving ? <Spinner aria-hidden data-icon="inline-start" /> : null}
        {saving ? "Saving…" : "Save changes"}
      </Button>
    </div>
  );
}

/** The form's shape while its first read is in flight. */
export function SettingsFormSkeleton({ fields }: { fields: number }) {
  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <Skeleton className="h-5 w-40" />
      </CardHeader>
      <CardContent className="grid gap-6 sm:grid-cols-2">
        {Array.from({ length: fields }, (_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-full" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
