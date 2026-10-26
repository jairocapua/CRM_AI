import { z } from "zod";

import type { CustomField, CustomFieldType } from "@/types";
import { optionalText } from "./details";

/**
 * The custom fields manager (`/settings/custom-fields`): the rules for one
 * field's definition, shared by its add/edit dialog and by
 * `api.customFields.create` / `update`, so the API is never looser than the
 * form and both say the same sentence.
 *
 * Not to be confused with `custom-fields.ts`, which validates the values a
 * contact or deal holds for these fields.
 */

/** Every field type, in the order the type picker lists them. */
export const CUSTOM_FIELD_TYPES = [
  "text",
  "textarea",
  "number",
  "currency",
  "date",
  "checkbox",
  "select",
  "multiselect",
  "phone",
  "email",
  "url",
] as const;

// A type added to `CustomFieldType` but not to the list fails here, at
// compile time.
type MissingType = Exclude<
  CustomFieldType,
  (typeof CUSTOM_FIELD_TYPES)[number]
>;
const everyTypeListed: MissingType extends never ? true : never = true;
void everyTypeListed;

/** How each type reads on screen. */
export const CUSTOM_FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  text: "Text",
  textarea: "Long text",
  number: "Number",
  currency: "Currency",
  date: "Date",
  checkbox: "Checkbox",
  select: "Dropdown",
  multiselect: "Multi-select",
  phone: "Phone",
  email: "Email",
  url: "URL",
};

/** Whether a field of `type` picks from a list of options. */
export function hasOptions(type: CustomFieldType | undefined): boolean {
  return type === "select" || type === "multiselect";
}

/**
 * Whether the contact and deal forms show a field's placeholder for `type`
 * (`CustomFieldsSection`): not for a date, a checkbox or a multi-select.
 */
export function usesPlaceholder(type: CustomFieldType | undefined): boolean {
  return (
    type !== undefined &&
    type !== "date" &&
    type !== "checkbox" &&
    type !== "multiselect"
  );
}

/**
 * Whether the contact and deal forms show a field's help text for `type`:
 * every type but the checkbox (`CustomFieldsSection`).
 */
export function usesHelpText(type: CustomFieldType | undefined): boolean {
  return type !== undefined && type !== "checkbox";
}

/**
 * Whether "Required" means anything for `type`: the forms check a required
 * field has a value, but a checkbox always has one (ticked or not), and
 * shows no required mark.
 */
export function usesRequired(type: CustomFieldType | undefined): boolean {
  return type !== "checkbox";
}

export const LABEL_MAX = 60;
export const OPTION_LABEL_MAX = 60;
export const PLACEHOLDER_MAX = 100;
export const HELP_TEXT_MAX = 200;

/**
 * The machine key a label gives a new field: lowercase letters and numbers,
 * every other run of characters one underscore, none at either end
 * ("Contract Length (months)" is `contract_length_months`). Values are
 * stored under it, so it never changes after the field is created. Empty
 * when the label has no letter or number from a to z or 0 to 9.
 */
export function keyFromLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** The sentence for a label with no letter or number to make a key from. */
export const NO_KEY_MESSAGE =
  "Use at least one letter from A to Z or a number.";

/** One option row as the form and the API take it. */
const optionInput = z.object({
  label: z.string(),
  /** Set on an option the field already has; new options have none. */
  value: z.string().optional(),
});

export type CustomFieldOptionInput = z.input<typeof optionInput>;

/**
 * One field's definition: what the add/edit dialog edits.
 *
 * - `label` is required, trimmed, up to 60 characters, and needs a letter
 *   from a to z or a number (the key is made from it).
 * - `placeholder` and `helpText` are optional and trimmed; empty means none.
 *   Each is checked and kept only for a type the forms show it on
 *   (`usesPlaceholder`, `usesHelpText`); for any other it is dropped, so a
 *   long placeholder typed before switching to Checkbox is no hidden error.
 * - `required` comes out false for a type where it means nothing
 *   (`usesRequired`: a checkbox), so no stored checkbox reads "Required".
 * - `options` are checked only for a Dropdown or Multi-select: at least one,
 *   each named, no two with the same name in any letter case. Other types
 *   have none, and any sent are dropped (the output has no `options`).
 */
export const customFieldSchema = z
  .object({
    label: z
      .string()
      .trim()
      // Not `abort`: an aborting issue would skip the options check below,
      // and the dialog should mark every problem at once.
      .min(1, "Enter a label.")
      .max(LABEL_MAX, `Keep the label to ${LABEL_MAX} characters or fewer.`)
      .refine(
        (label) => label === "" || keyFromLabel(label) !== "",
        NO_KEY_MESSAGE,
      ),
    type: z.enum(CUSTOM_FIELD_TYPES, {
      error: "Choose a type from the list.",
    }),
    required: z.boolean(),
    // Their lengths are checked below, only for a type that shows them.
    placeholder: optionalText().optional(),
    helpText: optionalText().optional(),
    options: z.array(optionInput).optional(),
  })
  .superRefine((field, ctx) => {
    if (
      usesPlaceholder(field.type) &&
      (field.placeholder ?? "").length > PLACEHOLDER_MAX
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["placeholder"],
        message: `Keep the placeholder to ${PLACEHOLDER_MAX} characters or fewer.`,
      });
    }
    if (
      usesHelpText(field.type) &&
      (field.helpText ?? "").length > HELP_TEXT_MAX
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["helpText"],
        message: `Keep the help text to ${HELP_TEXT_MAX} characters or fewer.`,
      });
    }
    if (!hasOptions(field.type)) return;
    const options = field.options ?? [];
    if (options.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["options"],
        message: "Add at least one option.",
      });
      return;
    }
    const seen = new Set<string>();
    options.forEach((option, index) => {
      const label = option.label.trim();
      const path = ["options", index, "label"];
      if (label === "") {
        ctx.addIssue({
          code: "custom",
          path,
          message: "Enter a name for this option.",
        });
      } else if (label.length > OPTION_LABEL_MAX) {
        ctx.addIssue({
          code: "custom",
          path,
          message: `Keep each option to ${OPTION_LABEL_MAX} characters or fewer.`,
        });
      } else if (seen.has(label.toLowerCase())) {
        ctx.addIssue({
          code: "custom",
          path,
          message: `${label} is already an option.`,
        });
      }
      seen.add(label.toLowerCase());
    });
  })
  .transform(({ options, placeholder, helpText, required, ...field }) => ({
    ...field,
    required: usesRequired(field.type) && required,
    ...(usesPlaceholder(field.type) && placeholder !== undefined
      ? { placeholder }
      : {}),
    ...(usesHelpText(field.type) && helpText !== undefined ? { helpText } : {}),
    ...(hasOptions(field.type)
      ? {
          options: (options ?? []).map((o) => ({
            label: o.label.trim(),
            ...(o.value === undefined ? {} : { value: o.value }),
          })),
        }
      : {}),
  }));

/** What the dialog edits. */
export type CustomFieldFormValues = {
  label: string;
  type: CustomFieldType;
  required: boolean;
  placeholder: string;
  helpText: string;
  options: CustomFieldOptionInput[];
};

/** A checked definition: trimmed, options only for a list type. */
export type CustomFieldDefinition = z.output<typeof customFieldSchema>;

/** The dialog, as it opens to add a field: a Text field, one empty option row. */
export const EMPTY_CUSTOM_FIELD: Readonly<CustomFieldFormValues> = {
  label: "",
  type: "text",
  required: false,
  placeholder: "",
  helpText: "",
  options: [{ label: "" }],
};

/** The dialog, as it opens to edit `field`. */
export function formValuesFromField(field: CustomField): CustomFieldFormValues {
  return {
    label: field.label,
    type: field.type,
    required: field.required,
    placeholder: field.placeholder ?? "",
    helpText: field.helpText ?? "",
    options:
      field.options && field.options.length > 0
        ? field.options.map((o) => ({ label: o.label, value: o.value }))
        : [{ label: "" }],
  };
}

/**
 * The checked dialog values as the API takes them. The placeholder and the
 * help text go only for a type the forms show them on, as "" when the type
 * does (so emptying one removes it); options only for a list type; a
 * checkbox is never required (`usesRequired`).
 */
export function toCustomFieldInput(values: CustomFieldDefinition): {
  label: string;
  type: CustomFieldType;
  required: boolean;
  placeholder?: string;
  helpText?: string;
  options?: CustomFieldOptionInput[];
} {
  return {
    label: values.label,
    type: values.type,
    required: usesRequired(values.type) && values.required,
    ...(usesPlaceholder(values.type)
      ? { placeholder: values.placeholder ?? "" }
      : {}),
    ...(usesHelpText(values.type) ? { helpText: values.helpText ?? "" } : {}),
    ...(hasOptions(values.type) ? { options: values.options } : {}),
  };
}

/**
 * A value for an option named `label` that no option in `taken` has: its
 * name in lowercase letters and numbers joined by underscores ("$5k - $15k"
 * is `5k_15k`), "option" when that is empty, and a number appended when
 * needed (`gold_2`).
 */
export function optionValueFor(label: string, taken: ReadonlySet<string>) {
  const base = keyFromLabel(label) || "option";
  let value = base;
  for (let n = 2; taken.has(value); n++) value = `${base}_${n}`;
  return value;
}
