import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api";
import { customFieldErrorPath, removalSentence } from "./custom-fields-copy";

describe("customFieldErrorPath", () => {
  it.each([
    ["label", "label"],
    ["type", "type"],
    ["required", "required"],
    ["placeholder", "placeholder"],
    ["helpText", "helpText"],
    ["options", "options"],
    ["options.0.label", "options.0.label"],
    ["options.12.label", "options.12.label"],
    ["options.x.label", null],
    ["options.1", null],
    ["xoptions.1.label", null],
    ["options.1.labels", null],
    ["key", null],
    ["objectType", null],
  ] as const)("a refusal on %s marks %s", (field, path) => {
    expect(customFieldErrorPath(new ApiError("No.", 422, "X", field))).toBe(
      path,
    );
  });

  it("is null for a refusal about no field, and for anything else", () => {
    expect(customFieldErrorPath(new ApiError("No.", 503, "X"))).toBeNull();
    expect(customFieldErrorPath(new Error("label"))).toBeNull();
    expect(customFieldErrorPath(null)).toBeNull();
    expect(customFieldErrorPath("label")).toBeNull();
  });
});

describe("removalSentence", () => {
  it.each([
    [0, "contact", "No contacts hold a value for Referral Code."],
    [
      1,
      "contact",
      "1 contact holds a value for Referral Code; that value is deleted with it.",
    ],
    [
      1234,
      "contact",
      "1,234 contacts hold a value for Referral Code; those values are deleted with it.",
    ],
    [0, "opportunity", "No deals hold a value for Referral Code."],
    [
      1,
      "opportunity",
      "1 deal holds a value for Referral Code; that value is deleted with it.",
    ],
    [
      2,
      "opportunity",
      "2 deals hold a value for Referral Code; those values are deleted with it.",
    ],
  ] as const)("%i on %s", (count, objectType, sentence) => {
    expect(removalSentence(count, objectType, "Referral Code")).toBe(sentence);
  });
});
