import type { AutomationDefinition, ID } from "@/types";

import { layout, type Layout } from "./layout";
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

/** What the overlap check needs of a node: its box. */
export interface NodeBox {
  id: ID;
  position: { x: number; y: number };
  width: number;
  height: number;
}

/**
 * Every pair of nodes whose boxes overlap (AABB), in node order. Boxes that
 * only touch do not count.
 */
export function overlappingNodes(nodes: readonly NodeBox[]): [ID, ID][] {
  const pairs: [ID, ID][] = [];
  nodes.forEach((a, i) => {
    for (const b of nodes.slice(i + 1)) {
      if (
        a.position.x < b.position.x + b.width &&
        b.position.x < a.position.x + a.width &&
        a.position.y < b.position.y + b.height &&
        b.position.y < a.position.y + a.height
      ) {
        pairs.push([a.id, b.id]);
      }
    }
  });
  return pairs;
}

/**
 * Layout checks for the integrity report: a definition layout throws on, and
 * nodes drawn over each other. A definition `definitionProblems()` already
 * flags is skipped, so one mistake is reported once. `place` is the layout
 * under test; tests pass a broken one.
 */
export function layoutProblems(
  definitions: readonly AutomationDefinition[],
  place: (definition: AutomationDefinition) => Layout = layout,
): string[] {
  const problems: string[] = [];
  for (const definition of definitions) {
    if (definitionProblems([definition]).length > 0) continue;
    let nodes: readonly NodeBox[];
    try {
      nodes = place(definition).nodes;
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
      continue;
    }
    for (const [a, b] of overlappingNodes(nodes)) {
      problems.push(
        `${definition.name} has overlapping nodes "${a}" and "${b}"`,
      );
    }
  }
  return problems;
}
