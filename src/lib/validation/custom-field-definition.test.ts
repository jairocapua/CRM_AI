import { describe, expect, it } from "vitest";

import type { CustomField } from "@/types";
import {
  customFieldSchema,
  EMPTY_CUSTOM_FIELD,
  formValuesFromField,
  keyFromLabel,
  optionValueFor,
  toCustomFieldInput,
} from "./custom-field-definition";
import { buildCustomFieldsSchema, toCustomFieldsPatch } from "./custom-fields";

/** Each failing path's first message. */
function messages(input: unknown): Record<string, string> {
  const result = customFieldSchema.safeParse(input);
  if (result.success) return {};
  const out: Record<string, string> = {};
  for (const issue of result.error.issues) {
    out[issue.path.join(".")] ??= issue.message;
  }
  return out;
}

const TEXT = { ...EMPTY_CUSTOM_FIELD, label: "Referral Code" };
const DROPDOWN = {
  ...EMPTY_CUSTOM_FIELD,
  label: "Tier",
  type: "select",
  options: [{ label: "Gold" }, { label: "Silver" }],
} as const;

describe("customFieldSchema", () => {
  it("asks for a label, and for an option name on a list type, at once", () => {
    expect(messages(EMPTY_CUSTOM_FIELD)).toEqual({ label: "Enter a label." });
    expect(messages({ ...EMPTY_CUSTOM_FIELD, label: "   " })).toEqual({
      label: "Enter a label.",
    });
    expect(messages({ ...EMPTY_CUSTOM_FIELD, type: "select" })).toEqual({
      label: "Enter a label.",
      "options.0.label": "Enter a name for this option.",
    });
  });

  it("refuses a label with no letter or number, and a long one", () => {
    expect(messages({ ...TEXT, label: "!!! ?" })).toEqual({
      label: "Use at least one letter from A to Z or a number.",
    });
    expect(messages({ ...TEXT, label: "x".repeat(61) })).toEqual({
      label: "Keep the label to 60 characters or fewer.",
    });
    expect(messages({ ...TEXT, label: "x".repeat(60) })).toEqual({});
  });

  it("refuses a type outside the list", () => {
    expect(messages({ ...TEXT, type: "colour" })).toEqual({
      type: "Choose a type from the list.",
    });
  });

  it("needs at least one option, each named once in any letter case", () => {
    expect(messages({ ...DROPDOWN, options: [] })).toEqual({
      options: "Add at least one option.",
    });
    expect(messages({ ...DROPDOWN, options: undefined })).toEqual({
      options: "Add at least one option.",
    });
    expect(
      messages({
        ...DROPDOWN,
        type: "multiselect",
        options: [{ label: "Gold" }, { label: " " }, { label: " gold " }],
      }),
    ).toEqual({
      "options.1.label": "Enter a name for this option.",
      "options.2.label": "gold is already an option.",
    });
  });

  it("saves trimmed values, and options only for a list type", () => {
    expect(
      customFieldSchema.parse({
        ...TEXT,
        label: "  Referral Code ",
        placeholder: " R-123 ",
        helpText: " ",
        options: [{ label: "dropped" }],
      }),
    ).toEqual({
      label: "Referral Code",
      type: "text",
      required: false,
      placeholder: "R-123",
      helpText: "",
    });
    expect(
      customFieldSchema.parse({
        ...DROPDOWN,
        options: [{ label: " Gold ", value: "gold" }, { label: "Silver" }],
      }).options,
    ).toEqual([{ label: "Gold", value: "gold" }, { label: "Silver" }]);
  });

  it("checks and keeps a placeholder and help text only where the type shows them", () => {
    const long = {
      ...TEXT,
      placeholder: "x".repeat(101),
      helpText: "y".repeat(201),
    };
    expect(messages(long)).toEqual({
      placeholder: "Keep the placeholder to 100 characters or fewer.",
      helpText: "Keep the help text to 200 characters or fewer.",
    });
    expect(messages({ ...long, placeholder: "x".repeat(100) })).toEqual({
      helpText: "Keep the help text to 200 characters or fewer.",
    });
    // A checkbox shows neither: typed before switching type, both drop.
    expect(customFieldSchema.parse({ ...long, type: "checkbox" })).toEqual({
      label: "Referral Code",
      type: "checkbox",
      required: false,
    });
    // A date and a multi-select show help text but no placeholder.
    expect(messages({ ...long, type: "date" })).toEqual({
      helpText: "Keep the help text to 200 characters or fewer.",
    });
    const dated = customFieldSchema.parse({
      ...long,
      type: "date",
      helpText: " When ",
    });
    expect(dated).toEqual({
      label: "Referral Code",
      type: "date",
      required: false,
      helpText: "When",
    });
    expect(
      messages({ ...long, type: "multiselect", options: DROPDOWN.options }),
    ).toEqual({
      helpText: "Keep the help text to 200 characters or fewer.",
    });
  });

  it("makes a checkbox not required, and keeps required on any other type", () => {
    expect(
      customFieldSchema.parse({ ...TEXT, type: "checkbox", required: true })
        .required,
    ).toBe(false);
    expect(customFieldSchema.parse({ ...TEXT, required: true }).required).toBe(
      true,
    );
  });
});

describe("keyFromLabel / optionValueFor", () => {
  it.each([
    ["Referral Code", "referral_code"],
    ["Contract Length (months)", "contract_length_months"],
    ["  $5k - $15k ", "5k_15k"],
    ["!!!", ""],
    ["Café", "caf"],
  ])("%s -> %s", (label, key) => {
    expect(keyFromLabel(label)).toBe(key);
  });

  it("appends a number to a value already taken, and names a symbol-only option", () => {
    expect(optionValueFor("Gold", new Set())).toBe("gold");
    expect(optionValueFor("Gold", new Set(["gold", "gold_2"]))).toBe("gold_3");
    expect(optionValueFor("€", new Set())).toBe("option");
  });
});

describe("the dialog's values", () => {
  const AT = "2026-09-01T09:00:00.000Z";
  const stored: CustomField = {
    id: "cf_fixture",
    key: "tier",
    label: "Tier",
    type: "select",
    objectType: "contact",
    required: true,
    position: 0,
    placeholder: "Pick one",
    options: [{ value: "gold", label: "Gold" }],
    createdAt: AT,
    updatedAt: AT,
  };

  it("open on the stored field, and send only what the type shows", () => {
    const values = formValuesFromField(stored);
    expect(values).toEqual({
      label: "Tier",
      type: "select",
      required: true,
      placeholder: "Pick one",
      helpText: "",
      options: [{ label: "Gold", value: "gold" }],
    });
    expect(toCustomFieldInput(customFieldSchema.parse(values))).toEqual({
      label: "Tier",
      type: "select",
      required: true,
      placeholder: "Pick one",
      helpText: "",
      options: [{ label: "Gold", value: "gold" }],
    });
    // A checkbox shows neither a placeholder nor help text, and is never
    // required (it always has a value); a date has no placeholder.
    expect(
      toCustomFieldInput(
        customFieldSchema.parse({ ...values, type: "checkbox" }),
      ),
    ).toEqual({ label: "Tier", type: "checkbox", required: false });
    expect(
      toCustomFieldInput(customFieldSchema.parse({ ...values, type: "date" })),
    ).toEqual({ label: "Tier", type: "date", required: true, helpText: "" });
  });
});

describe("a currency custom field stays in cents", () => {
  it("saves dollars typed in the form as integer cents", () => {
    const fee: CustomField = {
      id: "cf_fee",
      key: "setup_fee",
      label: "Setup Fee",
      type: "currency",
      objectType: "opportunity",
      required: false,
      position: 0,
      createdAt: "2026-09-01T09:00:00.000Z",
      updatedAt: "2026-09-01T09:00:00.000Z",
    };
    for (const [typed, cents] of [
      ["12.34", 1234],
      ["13500", 1_350_000],
      ["0.1", 10],
    ] as const) {
      const parsed = buildCustomFieldsSchema([fee]).parse({
        setup_fee: typed,
      });
      const stored = toCustomFieldsPatch(parsed, [fee]).setup_fee;
      expect(stored).toBe(cents);
      expect(Number.isInteger(stored)).toBe(true);
    }
  });
});
