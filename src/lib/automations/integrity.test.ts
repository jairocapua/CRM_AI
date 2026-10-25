import { describe, expect, it } from "vitest";

import type {
  AutomationDefinition,
  BranchStep,
  LinearStep,
  StepList,
} from "@/types";

import { AUTOMATIONS, LAYOUTS } from ".";
import {
  definitionProblems,
  layoutProblems,
  overlappingNodes,
} from "./integrity";
import { layout, type Layout } from "./layout";

const sms = (id: string): LinearStep => ({
  id,
  label: "Send SMS",
  config: { kind: "send_sms", body: "Hi {{contact.first_name}}" },
});

const fork = (id: string, ...branches: StepList[]): BranchStep => ({
  id,
  label: "Replied?",
  config: {
    kind: "if_else",
    branches: branches.map((steps, i) => ({
      id: `${id}_b${i}`,
      label: `Branch ${i + 1}`,
      filter: { id: `${id}_fg${i}`, combinator: "and", conditions: [] },
      steps,
    })),
  },
});

const definition = (steps: StepList): AutomationDefinition => ({
  id: "wf_fixture",
  name: "Fixture",
  description: "A hand-built definition for integrity tests.",
  folder: "Tests",
  status: "draft",
  owner: "jordan",
  trigger: { label: "Manual trigger", config: { kind: "manual" } },
  steps,
  settings: { allowMultipleEnrollment: false, stopOnReply: true },
});

describe("definitionProblems()", () => {
  it("passes every registry automation", () => {
    expect(definitionProblems(Object.values(AUTOMATIONS))).toEqual([]);
  });

  it("passes a well-formed fork", () => {
    expect(
      definitionProblems([
        definition([sms("a"), fork("f", [sms("b")], [sms("c")])]),
      ]),
    ).toEqual([]);
  });

  it("flags two steps with the same node id", () => {
    expect(definitionProblems([definition([sms("a"), sms("a")])])).toEqual([
      'Fixture repeats node id "a"',
    ]);
  });

  it("flags a step that reuses the trigger's node id", () => {
    expect(definitionProblems([definition([sms("trigger")])])).toEqual([
      'Fixture repeats node id "trigger"',
    ]);
  });

  it("flags a node id repeated across branches", () => {
    expect(
      definitionProblems([definition([fork("f", [sms("x")], [sms("x")])])]),
    ).toEqual(['Fixture repeats node id "x"']);
  });

  it("flags an empty branch", () => {
    expect(
      definitionProblems([definition([fork("f", [sms("a")], [])])]),
    ).toEqual(['Fixture has an empty branch "Branch 2"']);
  });

  it("flags an empty branch nested inside another branch", () => {
    expect(
      definitionProblems([
        definition([
          fork("outer", [fork("inner", [], [sms("b")])], [sms("c")]),
        ]),
      ]),
    ).toEqual(['Fixture has an empty branch "Branch 1"']);
  });
});

const box = (id: string, x: number, y: number, width = 260, height = 78) => ({
  id,
  position: { x, y },
  width,
  height,
});

describe("overlappingNodes()", () => {
  it("finds two boxes that overlap", () => {
    expect(
      overlappingNodes([box("a", 0, 0), box("b", 200, 50), box("c", 0, 400)]),
    ).toEqual([["a", "b"]]);
  });

  it("finds a small box inside a big one", () => {
    expect(
      overlappingNodes([box("card", 0, 0), box("pill", 70, 20, 120, 40)]),
    ).toEqual([["card", "pill"]]);
  });

  it("lets boxes touch without overlapping", () => {
    expect(
      overlappingNodes([
        box("a", 0, 0),
        box("right", 260, 0),
        box("below", 0, 78),
      ]),
    ).toEqual([]);
    // Whichever comes first in the list.
    expect(
      overlappingNodes([
        box("below", 0, 78),
        box("right", 260, 0),
        box("a", 0, 0),
      ]),
    ).toEqual([]);
  });

  it("passes every registry layout", () => {
    for (const [slug, l] of Object.entries(LAYOUTS)) {
      expect(overlappingNodes(l.nodes), slug).toEqual([]);
    }
  });
});

describe("layoutProblems()", () => {
  it("passes every registry automation", () => {
    expect(layoutProblems(Object.values(AUTOMATIONS))).toEqual([]);
  });

  it("reports a definition layout cannot place", () => {
    const fax = {
      id: "x",
      label: "Fax",
      config: { kind: "fax" },
    } as unknown as LinearStep;
    expect(layoutProblems([definition([sms("a"), fax])])).toEqual([
      'Cannot lay out "Fixture": step "x" has unknown kind "fax"',
    ]);
  });

  it("reports overlapping boxes in a layout", () => {
    // A layout that stacks every node on the same spot.
    const pileUp = (d: AutomationDefinition): Layout => {
      const real = layout(d);
      return {
        ...real,
        nodes: real.nodes.map((n) => ({ ...n, position: { x: 0, y: 0 } })),
      };
    };
    expect(layoutProblems([definition([sms("a")])], pileUp)).toEqual([
      'Fixture has overlapping nodes "trigger" and "a"',
      'Fixture has overlapping nodes "trigger" and "end:a"',
      'Fixture has overlapping nodes "a" and "end:a"',
    ]);
  });

  it("leaves a definition definitionProblems() already flags to it", () => {
    expect(layoutProblems([definition([sms("a"), sms("a")])])).toEqual([]);
    expect(layoutProblems([definition([fork("f", [sms("a")], [])])])).toEqual(
      [],
    );
  });
});
