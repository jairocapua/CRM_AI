"use client";

import {
  Controller,
  type Control,
  type FieldValues,
  type Path,
} from "react-hook-form";

import type { CustomField } from "@/types";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

/**
 * Structural rather than `ControllerRenderProps<TValues, …>`: the control is
 * addressed by a runtime key, so the precise path type is unknowable here and
 * every branch narrows `value` itself anyway.
 */
type CustomFieldRhf = {
  value: unknown;
  onChange: (value: unknown) => void;
  onBlur: () => void;
};

function CustomFieldControl({
  field,
  rhf,
}: {
  field: CustomField;
  rhf: CustomFieldRhf;
}) {
  switch (field.type) {
    case "textarea":
      return (
        <Textarea
          id={field.id}
          placeholder={field.placeholder}
          value={typeof rhf.value === "string" ? rhf.value : ""}
          onChange={rhf.onChange}
          onBlur={rhf.onBlur}
        />
      );
    case "number":
    case "currency":
      return (
        <Input
          id={field.id}
          type="number"
          inputMode="decimal"
          placeholder={field.placeholder}
          value={typeof rhf.value === "string" ? rhf.value : ""}
          onChange={rhf.onChange}
          onBlur={rhf.onBlur}
        />
      );
    case "date":
      return (
        <Input
          id={field.id}
          type="date"
          value={typeof rhf.value === "string" ? rhf.value : ""}
          onChange={rhf.onChange}
          onBlur={rhf.onBlur}
        />
      );
    case "select":
      return (
        <Select
          value={typeof rhf.value === "string" ? rhf.value : ""}
          onValueChange={rhf.onChange}
        >
          <SelectTrigger id={field.id} className="w-full">
            <SelectValue placeholder={field.placeholder ?? "Select…"}>
              {(value: string) =>
                field.options?.find((option) => option.value === value)
                  ?.label ?? value
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {field.options?.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case "multiselect": {
      const selectedValues = Array.isArray(rhf.value) ? rhf.value : [];
      return (
        <div className="flex flex-col gap-2">
          {field.options?.map((option) => {
            const checked = selectedValues.includes(option.value);
            return (
              <label
                key={option.value}
                className="flex items-center gap-2 text-sm"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(next) => {
                    rhf.onChange(
                      next
                        ? [...selectedValues, option.value]
                        : selectedValues.filter((v) => v !== option.value),
                    );
                  }}
                />
                {option.label}
              </label>
            );
          })}
        </div>
      );
    }
    default:
      return (
        <Input
          id={field.id}
          type={
            field.type === "email"
              ? "email"
              : field.type === "url"
                ? "url"
                : field.type === "phone"
                  ? "tel"
                  : "text"
          }
          placeholder={field.placeholder}
          value={typeof rhf.value === "string" ? rhf.value : ""}
          onChange={rhf.onChange}
          onBlur={rhf.onBlur}
        />
      );
  }
}

/**
 * Renders one Field per active custom field, wired to `customFields.<key>`.
 * Generic over the form's values so contacts and opportunities share it —
 * both schemas carry a `customFields` record built by the same builder.
 */
export function CustomFieldsSection<TValues extends FieldValues>({
  fields,
  control,
}: {
  fields: CustomField[];
  control: Control<TValues>;
}) {
  if (fields.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      {fields.map((field) => (
        <Controller
          key={field.id}
          control={control}
          name={`customFields.${field.key}` as Path<TValues>}
          render={({ field: rhf, fieldState }) =>
            field.type === "checkbox" ? (
              <Field orientation="horizontal">
                <Checkbox
                  id={field.id}
                  checked={Boolean(rhf.value)}
                  onCheckedChange={rhf.onChange}
                />
                <FieldLabel htmlFor={field.id}>{field.label}</FieldLabel>
              </Field>
            ) : (
              <Field data-invalid={Boolean(fieldState.error)}>
                <FieldLabel htmlFor={field.id}>
                  {field.label}
                  {field.required ? " *" : ""}
                </FieldLabel>
                <CustomFieldControl field={field} rhf={rhf} />
                {field.helpText ? (
                  <FieldDescription>{field.helpText}</FieldDescription>
                ) : null}
                <FieldError
                  errors={fieldState.error ? [fieldState.error] : undefined}
                />
              </Field>
            )
          }
        />
      ))}
    </div>
  );
}
