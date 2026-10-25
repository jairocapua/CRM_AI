import { describe, expect, it } from "vitest";

import type {
  AutomationDefinition,
  BranchStep,
  LinearStep,
  StepList,
} from "@/types";

import { AUTOMATIONS } from ".";
import { definitionProblems } from "./integrity";

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
