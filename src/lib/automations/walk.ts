import type { AuthoredBranch, BranchStep, LinearStep, StepList } from "@/types";

export type Step = LinearStep | BranchStep;

/** The node id every definition's trigger gets. Steps must not reuse it. */
export const TRIGGER_NODE_ID = "trigger";

export function isBranchStep(step: Step): step is BranchStep {
  return step.config.kind === "if_else";
}

/** Every step in a step list, depth-first, each branch's steps in order. */
export function allSteps(steps: StepList): Step[] {
  return steps.flatMap((step: Step) =>
    isBranchStep(step)
      ? [step, ...step.config.branches.flatMap((b) => allSteps(b.steps))]
      : [step],
  );
}

/** Every branch in a step list, nested ones included. */
export function allBranches(steps: StepList): AuthoredBranch[] {
  return allSteps(steps).flatMap((step) =>
    isBranchStep(step) ? step.config.branches : [],
  );
}
