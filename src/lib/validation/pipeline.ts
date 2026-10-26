import { z } from "zod";

import type { Pipeline, PipelineStage, TagColor } from "@/types";
import { TAG_COLORS } from "@/lib/constants";
import { requiredText } from "./details";

/**
 * The pipelines manager (`/settings/pipelines`): the rules for a pipeline's
 * name and for one stage, shared by its dialogs and by `api.pipelines.*`,
 * so the API is never looser than the form and both say the same sentence.
 */

export const PIPELINE_NAME_MAX = 60;
export const STAGE_NAME_MAX = 40;

const PROBABILITY_RANGE = "Enter a probability from 0 to 100.";

/** The pipeline dialog: a name, trimmed, 1 to 60 characters. */
export const pipelineSchema = z.object({
  name: requiredText("Enter a pipeline name.").max(
    PIPELINE_NAME_MAX,
    `Keep the pipeline name to ${PIPELINE_NAME_MAX} characters or fewer.`,
  ),
});

export type PipelineFormValues = z.infer<typeof pipelineSchema>;

/**
 * The stage dialog: a name (trimmed, 1 to 40 characters), one of the tag
 * colours, and a whole-number probability from 0 to 100 (the weighted
 * forecast). An empty probability input reaches the schema as `NaN`, which
 * gets the range sentence too.
 */
export const stageSchema = z.object({
  name: requiredText("Enter a stage name.").max(
    STAGE_NAME_MAX,
    `Keep the stage name to ${STAGE_NAME_MAX} characters or fewer.`,
  ),
  color: z.enum(TAG_COLORS as [TagColor, ...TagColor[]], {
    error: "Choose a colour.",
  }),
  probability: z
    .number({ error: PROBABILITY_RANGE })
    .int("Enter a whole number from 0 to 100.")
    .min(0, PROBABILITY_RANGE)
    .max(100, PROBABILITY_RANGE),
});

export type StageFormValues = z.infer<typeof stageSchema>;

/** The pipeline dialog, as it opens to add one or to rename `pipeline`. */
export function pipelineFormValues(
  pipeline: Pick<Pipeline, "name"> | null,
): PipelineFormValues {
  return { name: pipeline?.name ?? "" };
}

/** The stage dialog, as it opens to add one: slate, 50%. */
export const EMPTY_STAGE: Readonly<StageFormValues> = {
  name: "",
  color: "slate",
  probability: 50,
};

/** The stage dialog, as it opens to edit `stage`. */
export function stageFormValues(
  stage: Pick<PipelineStage, "name" | "color" | "probability">,
): StageFormValues {
  return {
    name: stage.name,
    color: stage.color,
    probability: stage.probability,
  };
}
