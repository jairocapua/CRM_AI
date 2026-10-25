import { describe, expect, it } from "vitest";

import type {
  AuthoredActionConfig,
  BranchStep,
  LinearStep,
  StepList,
} from "@/types";

import { AUTOMATIONS } from ".";
import { referencedKeys } from "./keys";

type WaitConfig = Extract<AuthoredActionConfig, { kind: "wait" }>;

/** Every linear step in a step list, depth-first through branches. */
function linearSteps(steps: StepList): LinearStep[] {
  return steps.flatMap((step) =>
    step.config.kind === "if_else"
      ? step.config.branches.flatMap((b) => linearSteps(b.steps))
      : [step as LinearStep],
  );
}

/** What a wait step's label must say, given its config. */
function waitLabel(config: WaitConfig): string {
  if (config.mode === "until_time") return `Wait until ${config.untilTime}`;
  const unit =
    config.amount === 1 ? config.unit!.replace(/s$/, "") : config.unit!;
  return `Wait ${config.amount} ${unit}`;
}

describe("AUTOMATIONS", () => {
  const entries = Object.entries(AUTOMATIONS);

  it("holds the eight automations in five folders", () => {
    expect(entries).toHaveLength(8);
    expect(new Set(entries.map(([, d]) => d.folder)).size).toBe(5);
  });

  it("keys each automation by slug, with a matching hand-written wf_* id", () => {
    for (const [slug, definition] of entries) {
      expect(slug).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(definition.id).toBe(`wf_${slug.replaceAll("-", "_")}`);
    }
    expect(new Set(entries.map(([, d]) => d.id)).size).toBe(entries.length);
  });

  it("labels every wait step with the wait it actually performs", () => {
    // The old seed drew the label's number and the wait's number separately.
    let waits = 0;
    for (const [, definition] of entries) {
      for (const step of linearSteps(definition.steps)) {
        if (step.config.kind !== "wait") continue;
        waits += 1;
        expect(step.label, `${definition.name} / ${step.id}`).toBe(
          waitLabel(step.config),
        );
      }
    }
    expect(waits).toBeGreaterThanOrEqual(8);
  });

  it("keeps Speed to Lead's two-way fork", () => {
    const fork = AUTOMATIONS["speed-to-lead"]!.steps.at(-1) as BranchStep;
    expect(fork.config.kind).toBe("if_else");
    expect(
      fork.config.branches.map((b) => [b.id, b.label, b.steps.length > 0]),
    ).toEqual([
      ["b_replied", "Replied", true],
      ["b_silent", "No reply", true],
    ]);
  });

  it("references tags by name and users by slug, never by id", () => {
    for (const [, definition] of entries) {
      const { tags, users } = referencedKeys(definition);
      for (const tag of tags) expect(tag).not.toMatch(/^tag_/);
      for (const user of users) expect(user).toMatch(/^[a-z]+$/);
    }
  });

  it("is frozen", () => {
    const speed = AUTOMATIONS["speed-to-lead"]!;
    expect(Object.isFrozen(AUTOMATIONS)).toBe(true);
    expect(Object.isFrozen(speed)).toBe(true);
    expect(Object.isFrozen(speed.steps)).toBe(true);
    expect(Object.isFrozen(speed.steps[0]!.config)).toBe(true);
  });
});

describe("StepList", () => {
  const sms: LinearStep = {
    id: "sms",
    label: "Send SMS",
    config: { kind: "send_sms", body: "Hi" },
  };
  const fork: BranchStep = {
    id: "fork",
    label: "Replied?",
    config: { kind: "if_else", branches: [] },
  };

  it("allows a branch only as the last step (checked by tsc)", () => {
    const linear: StepList = [sms, sms];
    const forked: StepList = [sms, fork];
    // @ts-expect-error a step after a branch would rejoin the tree
    const rejoin: StepList = [fork, sms];
    expect([linear, forked, rejoin]).toHaveLength(3);
  });
});
