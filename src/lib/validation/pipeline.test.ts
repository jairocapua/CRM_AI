import { describe, expect, it } from "vitest";

import { TAG_COLORS } from "@/lib/constants";
import {
  EMPTY_STAGE,
  pipelineFormValues,
  pipelineSchema,
  stageFormValues,
  stageSchema,
} from "./pipeline";

/** Each failing field's first message, by path. */
function messages(
  schema: typeof pipelineSchema | typeof stageSchema,
  input: unknown,
): Record<string, string> {
  const result = schema.safeParse(input);
  if (result.success) return {};
  const out: Record<string, string> = {};
  for (const issue of result.error.issues) {
    out[issue.path.join(".")] ??= issue.message;
  }
  return out;
}

describe("pipelineSchema", () => {
  it("needs a name, trimmed, of at most 60 characters", () => {
    expect(messages(pipelineSchema, { name: "" })).toEqual({
      name: "Enter a pipeline name.",
    });
    expect(messages(pipelineSchema, { name: "   " })).toEqual({
      name: "Enter a pipeline name.",
    });
    expect(messages(pipelineSchema, { name: "x".repeat(61) })).toEqual({
      name: "Keep the pipeline name to 60 characters or fewer.",
    });
    expect(pipelineSchema.parse({ name: `  ${"x".repeat(60)}  ` })).toEqual({
      name: "x".repeat(60),
    });
  });

  it("opens empty, or on the pipeline's name", () => {
    expect(pipelineFormValues(null)).toEqual({ name: "" });
    expect(pipelineFormValues({ name: "Renewals" })).toEqual({
      name: "Renewals",
    });
  });
});

describe("stageSchema", () => {
  const VALID = { name: "Qualified", color: "sky", probability: 40 };

  it("accepts a named stage with a tag colour and a whole probability", () => {
    expect(stageSchema.parse({ ...VALID, name: "  Qualified " })).toEqual(
      VALID,
    );
    for (const color of TAG_COLORS) {
      expect(stageSchema.safeParse({ ...VALID, color }).success).toBe(true);
    }
    expect(stageSchema.safeParse({ ...VALID, probability: 0 }).success).toBe(
      true,
    );
    expect(stageSchema.safeParse({ ...VALID, probability: 100 }).success).toBe(
      true,
    );
  });

  it("gives each broken field its own sentence", () => {
    expect(messages(stageSchema, { ...VALID, name: " " })).toEqual({
      name: "Enter a stage name.",
    });
    expect(messages(stageSchema, { ...VALID, name: "x".repeat(41) })).toEqual({
      name: "Keep the stage name to 40 characters or fewer.",
    });
    expect(messages(stageSchema, { ...VALID, color: "gold" })).toEqual({
      color: "Choose a colour.",
    });
    expect(messages(stageSchema, { ...VALID, probability: 101 })).toEqual({
      probability: "Enter a probability from 0 to 100.",
    });
    expect(messages(stageSchema, { ...VALID, probability: -1 })).toEqual({
      probability: "Enter a probability from 0 to 100.",
    });
    expect(messages(stageSchema, { ...VALID, probability: 12.5 })).toEqual({
      probability: "Enter a whole number from 0 to 100.",
    });
    // An emptied number input.
    expect(
      messages(stageSchema, { ...VALID, probability: Number.NaN }),
    ).toEqual({ probability: "Enter a probability from 0 to 100." });
    expect(messages(stageSchema, { ...VALID, probability: "40" })).toEqual({
      probability: "Enter a probability from 0 to 100.",
    });
  });

  it("opens on slate at 50%, or on the stage's values", () => {
    expect(EMPTY_STAGE).toEqual({ name: "", color: "slate", probability: 50 });
    expect(
      stageFormValues({ name: "Won", color: "green", probability: 100 }),
    ).toEqual({ name: "Won", color: "green", probability: 100 });
  });
});
