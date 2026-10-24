import { z } from "zod";

import type { CustomField, CustomFieldValue } from "@/types";
import { centsToInput, parseCents } from "@/lib/format";

/**
 * Custom field values live in the form as plain strings/booleans/arrays (so
 * every input stays a simple controlled control); `toCustomFieldsPatch` below
 * converts them to the typed `CustomFieldValue`s the API expects.
 *
 * Nothing here is contact- or opportunity-specific — the shape is driven
 * entirely by the runtime `CustomField[]`, so both forms feed it unchanged.
 *
 * Number and currency fields refuse non-finite values ('Infinity', '1e400')
 * here, under the field: stored, JSON would turn them into `null` on reload,
 * and the opportunities API refuses them with a 422.
 */

/** A number field's value is a finite number. */
function isFiniteNumber(v: string): boolean {
  return Number.isFinite(Number(v));
}

/**
 * A currency field's value, typed in dollars, is finite once in cents. The
 * `* 100` matches `parseCents`, so it can never return Infinity: '1e308'
 * dollars is finite, its cents are not.
 */
function hasFiniteCents(v: string): boolean {
  return Number.isFinite(Number(v) * 100);
}

function numericSchema(field: CustomField, isValid: (v: string) => boolean) {
  return field.required
    ? z
        .string()
        .trim()
        .min(1, `${field.label} is required.`)
        .refine(isValid, "Enter a number.")
    : z
        .string()
        .trim()
        .refine((v) => v === "" || isValid(v), "Enter a number.");
}

function customFieldValueSchema(field: CustomField) {
  switch (field.type) {
    case "checkbox":
      return z.boolean();
    case "multiselect":
      return field.required
        ? z.array(z.string()).min(1, `${field.label} is required.`)
        : z.array(z.string());
    case "number":
      return numericSchema(field, isFiniteNumber);
    case "currency":
      return numericSchema(field, hasFiniteCents);
    default:
      return field.required
        ? z.string().trim().min(1, `${field.label} is required.`)
        : z.string();
  }
}

export function buildCustomFieldsSchema(fields: CustomField[]) {
  const shape: Record<string, z.ZodType> = {};
  for (const field of fields) {
    shape[field.key] = customFieldValueSchema(field);
  }
  return z.object(shape);
}

/** Converts the form's string/boolean/array custom field values into the typed map the API stores. */
export function toCustomFieldsPatch(
  values: Record<string, unknown>,
  fields: CustomField[],
): Record<string, CustomFieldValue> {
  const patch: Record<string, CustomFieldValue> = {};
  for (const field of fields) {
    const raw = values[field.key];
    switch (field.type) {
      case "checkbox":
        patch[field.key] = Boolean(raw);
        break;
      case "multiselect":
        patch[field.key] = Array.isArray(raw) ? raw : [];
        break;
      case "number":
        patch[field.key] = raw === "" || raw == null ? null : Number(raw);
        break;
      // Currency fields are stored as integer cents like every other money
      // value in the app, but typed in the form as dollars.
      case "currency":
        patch[field.key] =
          raw === "" || raw == null ? null : parseCents(String(raw));
        break;
      default:
        patch[field.key] = raw === "" || raw == null ? null : String(raw);
    }
  }
  return patch;
}

/** Seeds form state for existing custom field values (or blanks, for a new record). */
export function fromCustomFieldsValue(
  stored: Record<string, CustomFieldValue> | undefined,
  fields: CustomField[],
): Record<string, string | boolean | string[]> {
  const values: Record<string, string | boolean | string[]> = {};
  for (const field of fields) {
    const value = stored?.[field.key];
    switch (field.type) {
      case "checkbox":
        values[field.key] = Boolean(value);
        break;
      case "multiselect":
        values[field.key] = Array.isArray(value) ? value : [];
        break;
      case "currency":
        values[field.key] =
          value == null || value === "" ? "" : centsToInput(Number(value));
        break;
      default:
        values[field.key] = value == null ? "" : String(value);
    }
  }
  return values;
}
