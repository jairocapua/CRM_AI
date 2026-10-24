import { describe, expect, it } from "vitest";

import type { CustomField } from "@/types";

import { buildContactFormSchema } from "./contact";
import { buildCustomFieldsSchema, toCustomFieldsPatch } from "./custom-fields";
import { buildOpportunityFormSchema } from "./opportunity";

const AT = "2026-09-01T09:00:00.000Z";

function field(overrides: Partial<CustomField>): CustomField {
  return {
    id: "cf_fixture",
    key: "contract_length",
    label: "Contract length",
    type: "number",
    objectType: "opportunity",
    required: false,
    position: 0,
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

const NUMBER = field({});
const REQUIRED_NUMBER = field({ required: true });
const CURRENCY = field({
  key: "retainer",
  label: "Retainer",
  type: "currency",
});

/** The issues safeParse reports for one value of `f`, as path + message. */
function issuesFor(f: CustomField, value: string) {
  const result = buildCustomFieldsSchema([f]).safeParse({ [f.key]: value });
  return result.success
    ? []
    : result.error.issues.map((i) => ({ path: i.path, message: i.message }));
}

// Each of these would be stored as a non-finite number: JSON writes it as
// null, and the opportunities API refuses it with a 422.
const NON_FINITE = ["Infinity", "-Infinity", "1e400", "-1e400"];

describe("a number field refuses values it cannot store", () => {
  it.each(
    [...NON_FINITE, "abc"].flatMap((value) => [
      { value, f: NUMBER, kind: "optional" },
      { value, f: REQUIRED_NUMBER, kind: "required" },
    ]),
  )("$value on the $kind field", ({ value, f }) => {
    expect(issuesFor(f, value)).toEqual([
      { path: ["contract_length"], message: "Enter a number." },
    ]);
  });
});

describe("a number field accepts finite numbers", () => {
  it.each(["", "42", " 7 ", "-3.5", "0", "1e308"])(
    "'%s' on the optional field",
    (value) => {
      expect(issuesFor(NUMBER, value)).toEqual([]);
    },
  );

  it("an empty required field still reports that it is required", () => {
    expect(issuesFor(REQUIRED_NUMBER, "")).toEqual([
      { path: ["contract_length"], message: "Contract length is required." },
    ]);
  });
});

describe("a currency field refuses an amount whose cents overflow", () => {
  // 1e308 dollars is a finite number, but 1e308 * 100 cents is not.
  it.each(["Infinity", "1e400", "1e308"])("refuses '%s'", (value) => {
    expect(issuesFor(CURRENCY, value)).toEqual([
      { path: ["retainer"], message: "Enter a number." },
    ]);
  });

  it.each(["13500", "12.34", ""])("accepts '%s'", (value) => {
    expect(issuesFor(CURRENCY, value)).toEqual([]);
  });
});

describe("every accepted value converts to a finite stored number", () => {
  const ACCEPTED: { f: CustomField; value: string }[] = [
    ...["", "42", " 7 ", "-3.5", "0", "1e308"].map((value) => ({
      f: NUMBER,
      value,
    })),
    ...["", "13500", "12.34", "1e300"].map((value) => ({ f: CURRENCY, value })),
  ];

  it.each(ACCEPTED)("$f.type $value", ({ f, value }) => {
    const parsed = buildCustomFieldsSchema([f]).parse({ [f.key]: value });
    const stored = toCustomFieldsPatch(parsed, [f])[f.key];
    if (value === "") expect(stored).toBeNull();
    else expect(Number.isFinite(stored)).toBe(true);
  });
});

describe("both forms refuse it on the field", () => {
  it.each([
    { form: "contact", build: buildContactFormSchema },
    { form: "deal", build: buildOpportunityFormSchema },
  ])("the $form form", ({ build }) => {
    // A partial draft: only the custom field's own issue is checked.
    const result = build([NUMBER]).safeParse({
      customFields: { contract_length: "Infinity" },
    });
    expect(result.success).toBe(false);
    const issues = (result.error?.issues ?? []).filter(
      (i) => i.path.join(".") === "customFields.contract_length",
    );
    expect(issues.map((i) => i.message)).toEqual(["Enter a number."]);
  });
});
