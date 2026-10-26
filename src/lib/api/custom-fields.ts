import { z } from "zod";

import type { CustomField, CustomFieldType, ID } from "@/types";
import { db } from "@/lib/mock/db";
import { newId } from "@/lib/mock/ids";
import {
  cascadeCustomFieldDelete,
  countCustomFieldValues,
} from "@/lib/mock/cascade";
import {
  customFieldSchema,
  keyFromLabel,
  optionValueFor,
  type CustomFieldDefinition,
  type CustomFieldOptionInput,
} from "@/lib/validation/custom-field-definition";
import { invalidate } from "./cache";
import { ApiError, notFound, nowIso, simulate } from "./http";
import { parsePatch, withoutEmpty } from "./patch";

export async function list(
  objectType?: CustomField["objectType"],
): Promise<CustomField[]> {
  return simulate(
    () =>
      Object.values(db.getState().customFields)
        .filter((f) => !objectType || f.objectType === objectType)
        .sort((a, b) => a.position - b.position),
    { canFail: false },
  );
}

const INVALID = "INVALID_CUSTOM_FIELD";
const INVALID_FALLBACK = "Those field details are not valid.";

/** How each object type is named in a sentence. */
const OBJECT_NOUNS: Record<CustomField["objectType"], string> = {
  contact: "contact",
  opportunity: "deal",
};

const objectTypeSchema = z.object({
  objectType: z.enum(["contact", "opportunity"], {
    error: "Choose contacts or deals.",
  }),
});

const keySchema = z.object({
  key: z
    .string()
    .regex(
      /^[a-z0-9_]*[a-z0-9][a-z0-9_]*$/,
      "Use only lowercase letters, numbers and underscores in the key.",
    )
    .optional(),
});

/**
 * What `create()` takes: the add dialog's keys and the object type. `key` is
 * for tests and seeds only (the dialog has none): without it the key comes
 * from the label (`keyFromLabel`).
 */
export interface CustomFieldDraft {
  objectType: CustomField["objectType"];
  label: string;
  type: CustomFieldType;
  required: boolean;
  placeholder?: string;
  helpText?: string;
  options?: CustomFieldOptionInput[];
  key?: string;
}

/** What `update()` saves: the edit dialog's keys. */
export interface CustomFieldPatch {
  label?: string;
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  options?: CustomFieldOptionInput[];
}

/**
 * Throws 409 `KEY_TAKEN` (field `label`, the dialog has no key input) when a
 * field of `objectType` already stores its values under `key`: a second one
 * would share them. A contact field and a deal field may share a key.
 */
function refuseTakenKey(
  key: string,
  objectType: CustomField["objectType"],
  fields: Record<ID, CustomField>,
): void {
  const holder = Object.values(fields).find(
    (f) => f.objectType === objectType && f.key === key,
  );
  if (holder) {
    throw new ApiError(
      `A ${OBJECT_NOUNS[objectType]} field named ${holder.label} already exists.`,
      409,
      "KEY_TAKEN",
      "label",
    );
  }
}

/**
 * Every value the records of `field`'s object type hold under its key: a
 * string value, or each string in a list (a multi-select's).
 */
function heldValues(field: CustomField): Set<string> {
  const state = db.getState();
  const table: Record<ID, { customFields: Record<string, unknown> }> =
    field.objectType === "contact" ? state.contacts : state.opportunities;
  const held = new Set<string>();
  for (const row of Object.values(table)) {
    const value = row.customFields[field.key];
    for (const item of Array.isArray(value) ? value : [value]) {
      if (typeof item === "string") held.add(item);
    }
  }
  return held;
}

/**
 * The options to store for a checked definition. An option sent with the
 * value of one of `existing` keeps that value (a relabel keeps what records
 * hold); any other gets a value from its name that no option of the field
 * has and no record holds (`optionValueFor`, `held`), so a new option never
 * takes over the values records still hold for a removed one. Undefined for
 * a type with no options.
 */
function storedOptions(
  definition: CustomFieldDefinition,
  existing: CustomField["options"] = [],
  held: ReadonlySet<string> = new Set(),
): CustomField["options"] {
  if (!definition.options) return undefined;
  const known = new Set(existing.map((o) => o.value));
  const kept = new Set(
    definition.options
      .map((o) => o.value)
      .filter((v): v is string => v !== undefined && known.has(v)),
  );
  const taken = new Set([...known, ...held]);
  return definition.options.map((option) => {
    if (option.value !== undefined && kept.has(option.value)) {
      // Only its first use keeps it: a value sent twice is new the second time.
      kept.delete(option.value);
      return { value: option.value, label: option.label };
    }
    const value = optionValueFor(option.label, taken);
    taken.add(value);
    return { value, label: option.label };
  });
}

/**
 * A checked definition as stored keys: the label, type and required flag,
 * the placeholder and help text when not empty, and the options for a list
 * type.
 */
function definitionKeys(
  definition: CustomFieldDefinition,
  options: CustomField["options"],
): Pick<
  CustomField,
  "label" | "type" | "required" | "placeholder" | "helpText" | "options"
> {
  return withoutEmpty(
    {
      label: definition.label,
      type: definition.type,
      required: definition.required,
      placeholder: definition.placeholder,
      helpText: definition.helpText,
      ...(options ? { options } : {}),
    },
    ["placeholder", "helpText"],
  );
}

/** Drops the keys whose value is `undefined`, so none is stored. */
function compact<T extends object>(record: T): T {
  for (const key of Object.keys(record) as (keyof T)[]) {
    if (record[key] === undefined) delete record[key];
  }
  return record;
}

/**
 * Adds a field to the end of its object type's list and returns it.
 *
 * Refusals write nothing, checked in this order:
 *
 * - 422 `INVALID_CUSTOM_FIELD` (field `objectType`) for an object type other
 *   than contacts or deals;
 * - 422 `INVALID_CUSTOM_FIELD` when the draft breaks the dialog's own rules
 *   (`customFieldSchema`): `message` is its sentence and `field` the key
 *   (`options.1.label` for an option);
 * - 422 `INVALID_CUSTOM_FIELD` (field `key`) for a `key` that is not
 *   lowercase letters, numbers and underscores;
 * - 409 `KEY_TAKEN` (field `label`) when a field of the same object type
 *   already has the key.
 *
 * The key comes from the label (`keyFromLabel`), and each option's value
 * from its name; values sent for options are ignored. Values are saved
 * trimmed; an empty placeholder or help text is not stored, nor one for a
 * type the forms do not show it on; a checkbox is never required; options
 * are stored only for a Dropdown or Multi-select; keys outside the draft
 * are ignored. The position is one past the highest of its object type's.
 */
export async function create(input: CustomFieldDraft): Promise<CustomField> {
  const field = await simulate(() => {
    const { objectType } = parsePatch(
      objectTypeSchema,
      { objectType: input.objectType },
      INVALID,
      INVALID_FALLBACK,
    );
    const definition = parsePatch(
      customFieldSchema,
      {
        label: input.label,
        type: input.type,
        required: input.required,
        placeholder: input.placeholder,
        helpText: input.helpText,
        // New options: whatever value was sent is not the API's to keep.
        options: Array.isArray(input.options)
          ? input.options.map((o) => ({ label: o?.label }))
          : input.options,
      },
      INVALID,
      INVALID_FALLBACK,
    );
    const { key: explicitKey } = parsePatch(
      keySchema,
      { key: input.key },
      INVALID,
      INVALID_FALLBACK,
    );
    const key = explicitKey ?? keyFromLabel(definition.label);
    const state = db.getState();
    refuseTakenKey(key, objectType, state.customFields);

    const at = nowIso();
    const record: CustomField = compact({
      id: newId("cf"),
      key,
      ...definitionKeys(definition, storedOptions(definition)),
      objectType,
      // After the last of its object type's fields, whatever gaps the
      // positions have.
      position:
        Math.max(
          -1,
          ...Object.values(state.customFields)
            .filter((f) => f.objectType === objectType)
            .map((f) => f.position),
        ) + 1,
      createdAt: at,
      updatedAt: at,
    });
    db.setState((s) => ({
      customFields: { ...s.customFields, [record.id]: record },
    }));
    return record;
  });
  invalidate("customFields");
  return field;
}

/**
 * Applies `patch` to a field and returns the saved record. An allow-list:
 * only the label, the required flag, the placeholder, the help text and the
 * options are saved. The key, object type, type, position, group, id,
 * timestamps and unknown keys are ignored: the key and object type say where
 * records keep their values, and a new type would misread them.
 *
 * The field as it would be saved must pass the dialog's rules
 * (`customFieldSchema`), or a 422 `INVALID_CUSTOM_FIELD` with its sentence
 * and `field`; 404 `NOT_FOUND` for an unknown field. Refusals write nothing.
 *
 * Options are matched by value: one sent with a value the field has keeps
 * it (a relabel), any other is new and gets a value from its name that no
 * option has and no record of the field's object type holds. An option
 * left out is removed from the field; records that hold it keep the value.
 * An emptied placeholder or help text removes it, as does a type that does
 * not show it; a checkbox is saved as not required.
 */
export async function update(
  id: ID,
  patch: CustomFieldPatch,
): Promise<CustomField> {
  const field = await simulate(() => {
    const prev = db.getState().customFields[id] ?? notFound("Custom field", id);
    const definition = parsePatch(
      customFieldSchema,
      {
        label: patch.label ?? prev.label,
        type: prev.type,
        required: patch.required ?? prev.required,
        placeholder: patch.placeholder ?? prev.placeholder,
        helpText: patch.helpText ?? prev.helpText,
        options: patch.options ?? prev.options,
      },
      INVALID,
      INVALID_FALLBACK,
    );
    const next: CustomField = compact({
      id,
      key: prev.key,
      ...definitionKeys(
        definition,
        storedOptions(definition, prev.options, heldValues(prev)),
      ),
      objectType: prev.objectType,
      group: prev.group,
      position: prev.position,
      createdAt: prev.createdAt,
      updatedAt: nowIso(),
    });
    db.setState((s) => ({ customFields: { ...s.customFields, [id]: next } }));
    return next;
  });
  invalidate("customFields");
  return field;
}

/**
 * Deletes a field and the values stored under its key on the records of its
 * object type (contacts or deals, never both); the fields of that type left
 * are renumbered 0..n-1 in their order. 404 for an unknown field.
 */
export async function remove(id: ID): Promise<void> {
  const objectType = await simulate(() => {
    const field =
      db.getState().customFields[id] ?? notFound("Custom field", id);
    db.setState((s) => cascadeCustomFieldDelete(s, id));
    return field.objectType;
  });
  invalidate(
    "customFields",
    objectType === "contact" ? "contacts" : "opportunities",
  );
}

/** What removing a field would delete, before anyone confirms. */
export interface CustomFieldRemovalPreview {
  /**
   * How many records of the field's object type hold a value for it
   * (`countCustomFieldValues`, the values `remove()` deletes).
   */
  count: number;
}

/**
 * What `remove(id)` would delete now. 404 `NOT_FOUND` for an unknown field,
 * as `remove()`. A read: never fails on the Demo Data failure rate.
 */
export async function removalPreview(
  id: ID,
): Promise<CustomFieldRemovalPreview> {
  return simulate(
    () => {
      const state = db.getState();
      const field = state.customFields[id] ?? notFound("Custom field", id);
      return { count: countCustomFieldValues(state, field) };
    },
    { canFail: false },
  );
}

/**
 * Stores `orderedIds` as the order of `objectType`'s fields (positions 0 to
 * n-1) in one write. A 422 `INVALID_ORDER` unless the list is exactly that
 * object type's fields, each once: none missing, none extra, none twice and
 * none of the other type. A refusal writes nothing. Timestamps are kept.
 */
export async function reorder(
  objectType: CustomField["objectType"],
  orderedIds: ID[],
): Promise<void> {
  await simulate(() => {
    const { customFields } = db.getState();
    const own = Object.values(customFields)
      .filter((f) => f.objectType === objectType)
      .map((f) => f.id);
    const sent = new Set(orderedIds);
    if (
      orderedIds.length !== own.length ||
      sent.size !== orderedIds.length ||
      own.some((fieldId) => !sent.has(fieldId))
    ) {
      throw new ApiError(
        "The fields changed since this list loaded. Try again.",
        422,
        "INVALID_ORDER",
      );
    }
    db.setState((s) => {
      const next = { ...s.customFields };
      orderedIds.forEach((fieldId, position) => {
        next[fieldId] = { ...next[fieldId]!, position };
      });
      return { customFields: next };
    });
  });
  invalidate("customFields");
}
