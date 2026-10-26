import type { Path } from "react-hook-form";

import type { CustomField } from "@/types";
import { pluralize } from "@/lib/format";
import type { CustomFieldFormValues } from "@/lib/validation/custom-field-definition";
import { serverErrorField } from "./team-copy";

/**
 * The custom fields page's words (`/settings/custom-fields`), per object
 * type. Pure, so each is unit-tested.
 */

export type CustomFieldObjectType = CustomField["objectType"];

/** Every object type, in tab order. */
export const OBJECT_TYPES = [
  "contact",
  "opportunity",
] as const satisfies readonly CustomFieldObjectType[];

interface ObjectCopy {
  /** The tab: "Contacts". */
  tab: string;
  /** The list's heading: "Contact fields". */
  heading: string;
  /** One record: "contact". */
  one: string;
  /** Records: "contacts". */
  many: string;
}

export const OBJECT_COPY: Record<CustomFieldObjectType, ObjectCopy> = {
  contact: {
    tab: "Contacts",
    heading: "Contact fields",
    one: "contact",
    many: "contacts",
  },
  opportunity: {
    tab: "Deals",
    heading: "Deal fields",
    one: "deal",
    many: "deals",
  },
};

/**
 * What removing `label` deletes, from `removalPreview`'s count: "1 contact
 * holds a value for Referral Code; that value is deleted with it.", "3 deals
 * hold a value for Tier; those values are deleted with it.", or "No contacts
 * hold a value for Referral Code."
 */
export function removalSentence(
  count: number,
  objectType: CustomFieldObjectType,
  label: string,
): string {
  const { one, many } = OBJECT_COPY[objectType];
  if (count === 0) return `No ${many} hold a value for ${label}.`;
  return count === 1
    ? `${pluralize(count, one, many)} holds a value for ${label}; that value is deleted with it.`
    : `${pluralize(count, one, many)} hold a value for ${label}; those values are deleted with it.`;
}

/** The keys an API refusal can be about (`ApiError.field`) besides options. */
const PLAIN_FIELDS = [
  "label",
  "type",
  "required",
  "placeholder",
  "helpText",
] as const satisfies readonly (keyof CustomFieldFormValues)[];

/**
 * The field dialog's input an API refusal is about: one of `PLAIN_FIELDS`
 * (`serverErrorField`), an option's name (`options.2.label`) or the options
 * as a whole; otherwise `null`, and the form shows the sentence above its
 * buttons.
 */
export function customFieldErrorPath(
  error: unknown,
): Path<CustomFieldFormValues> | null {
  return (
    serverErrorField(error, [...PLAIN_FIELDS, "options"] as const) ??
    optionLabelPath(error)
  );
}

/** `options.<n>.label` when that is what `error.field` says, else null. */
function optionLabelPath(error: unknown): `options.${number}.label` | null {
  const field =
    typeof error === "object" && error !== null && "field" in error
      ? (error as { field?: unknown }).field
      : undefined;
  return typeof field === "string" && /^options\.\d+\.label$/.test(field)
    ? (field as `options.${number}.label`)
    : null;
}
