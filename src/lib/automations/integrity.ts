import type { AutomationDefinition } from "@/types";

import { TRIGGER_NODE_ID, allBranches, allSteps } from "./walk";

/**
 * Structural checks over authored definitions, for the integrity report.
 * Pure, so a test can feed it a broken definition: the registry itself is
 * frozen code and cannot be broken at runtime.
 *
 * - Node ids must be unique within a definition (the trigger is
 *   `"trigger"`): run logs and the diagram address steps by id.
 * - Every branch needs at least one step, or the fork leads nowhere.
 */
export function definitionProblems(
  definitions: readonly AutomationDefinition[],
): string[] {
  const problems: string[] = [];
  for (const definition of definitions) {
    const seen = new Set<string>([TRIGGER_NODE_ID]);
    const repeated = new Set<string>();
    for (const step of allSteps(definition.steps)) {
      if (seen.has(step.id)) repeated.add(step.id);
      seen.add(step.id);
    }
    for (const id of repeated) {
      problems.push(`${definition.name} repeats node id "${id}"`);
    }
    for (const branch of allBranches(definition.steps)) {
      if (branch.steps.length === 0) {
        problems.push(
          `${definition.name} has an empty branch "${branch.label}"`,
        );
      }
    }
  }
  return problems;
}
