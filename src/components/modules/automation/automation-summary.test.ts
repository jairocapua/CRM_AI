import { describe, expect, it } from "vitest";

import type {
  ID,
  Workflow,
  WorkflowNode,
  WorkflowNodeConfig,
  WorkflowStatus,
} from "@/types";

import {
  STATUS_COPY,
  UNFILED,
  groupByFolder,
  ownerName,
  triggerSummary,
} from "./automation-summary";

/**
 * The automation list page shows each automation's trigger, owner and status
 * as plain sentences. Everything it derives from a `Workflow` lives in
 * `automation-summary.ts` as pure functions, pinned here.
 */

function node(config: WorkflowNodeConfig, id = "trigger"): WorkflowNode {
  return {
    id,
    kind: config.kind,
    category: id === "trigger" ? "trigger" : "action",
    label: "Label",
    position: { x: 0, y: 0 },
    width: 260,
    height: 72,
    config,
  };
}

/** A workflow whose first step is `config`, after one ordinary action. */
function withTrigger(config: WorkflowNodeConfig): Pick<Workflow, "nodes"> {
  return {
    nodes: [
      node({ kind: "send_sms", body: "Hi" }, "sms"),
      node(config),
      node({ kind: "end" }, "end:sms"),
    ],
  };
}

const TAGS: ReadonlyMap<ID, string> = new Map([
  ["tag_1", "Proposal Sent"],
  ["tag_2", "Churn Risk"],
]);

describe("triggerSummary", () => {
  const cases: [string, WorkflowNodeConfig, string][] = [
    [
      "a named form",
      { kind: "form_submitted", formName: "Free Website Audit" },
      "When a form is submitted: Free Website Audit",
    ],
    ["any form", { kind: "form_submitted" }, "When any form is submitted"],
    [
      "one tag, by name",
      { kind: "tag_added", tagIds: ["tag_1"] },
      "When the tag Proposal Sent is added",
    ],
    [
      "several tags, by name",
      { kind: "tag_added", tagIds: ["tag_1", "tag_2"] },
      "When the tag Proposal Sent or Churn Risk is added",
    ],
    [
      "an appointment on any calendar",
      { kind: "appointment_booked", calendarIds: [] },
      "When an appointment is booked",
    ],
    [
      "an appointment on chosen calendars",
      { kind: "appointment_booked", calendarIds: ["cal_1", "cal_2"] },
      "When an appointment is booked on 2 calendars",
    ],
    [
      "an appointment on one chosen calendar",
      { kind: "appointment_booked", calendarIds: ["cal_1"] },
      "When an appointment is booked on 1 calendar",
    ],
    [
      "a stage change",
      { kind: "opportunity_stage_changed" },
      "When a deal moves to another stage",
    ],
    ["a new contact", { kind: "contact_created" }, "When a contact is created"],
    [
      "a message on any channel",
      { kind: "inbound_message", channels: [] },
      "When a contact sends a message",
    ],
    [
      "a message on named channels",
      { kind: "inbound_message", channels: ["sms", "email"] },
      "When a contact sends a message by SMS or Email",
    ],
    ["a birthday", { kind: "birthday" }, "On the contact's birthday"],
    [
      "a manual start",
      { kind: "manual" },
      "When someone on the team starts it",
    ],
  ];

  it.each(cases)("describes %s", (_, config, expected) => {
    expect(triggerSummary(withTrigger(config), TAGS)).toBe(expected);
  });

  it("finds the trigger by its category, wherever it sits in nodes", () => {
    // withTrigger puts an action first: a summary of nodes[0] would be wrong.
    expect(triggerSummary(withTrigger({ kind: "birthday" }), TAGS)).toBe(
      "On the contact's birthday",
    );
  });

  it("drops tag ids it cannot name instead of printing them", () => {
    expect(
      triggerSummary(
        withTrigger({ kind: "tag_added", tagIds: ["tag_gone", "tag_2"] }),
        TAGS,
      ),
    ).toBe("When the tag Churn Risk is added");
  });

  it("falls back to a generic sentence when no tag can be named", () => {
    // The tags read failed (an empty map) or every tag was deleted.
    expect(
      triggerSummary(
        withTrigger({ kind: "tag_added", tagIds: ["tag_1"] }),
        new Map(),
      ),
    ).toBe("When a tag is added");
  });

  it("says so when a workflow has no trigger", () => {
    expect(triggerSummary({ nodes: [] }, TAGS)).toBe("No trigger set");
  });
});

describe("ownerName", () => {
  const users = new Map([
    ["usr_priya", { firstName: "Priya", lastName: "Nair" }],
  ]);

  it("is the owner's full name", () => {
    expect(ownerName("usr_priya", users)).toBe("Priya Nair");
  });

  it("says no owner when the automation has none", () => {
    expect(ownerName(undefined, users)).toBe("No owner");
  });

  it("never prints an id it cannot resolve", () => {
    expect(ownerName("usr_gone", users)).toBe("Unknown owner");
  });
});

describe("STATUS_COPY", () => {
  it("reads as lifecycle state, not an editor control", () => {
    const labels = Object.fromEntries(
      (Object.keys(STATUS_COPY) as WorkflowStatus[]).map((status) => [
        status,
        STATUS_COPY[status].label,
      ]),
    );
    expect(labels).toEqual({
      published: "Live",
      draft: "In development",
      paused: "Paused by the developer",
    });
  });

  it("explains every status in a sentence", () => {
    for (const copy of Object.values(STATUS_COPY)) {
      expect(copy.description).toMatch(/^[A-Z].+\.$/);
    }
  });
});

describe("groupByFolder", () => {
  const wf = (name: string, folder?: string) => ({ name, folder });

  it("groups by folder, folders and names in alphabetical order", () => {
    const groups = groupByFolder([
      wf("Speed to Lead", "Lead Capture"),
      wf("Review Request", "Retention"),
      wf("No-Show Recovery", "Scheduling"),
      wf("Churn Risk Alert", "Retention"),
      wf("Appointment Reminders", "Scheduling"),
    ]);
    expect(
      groups.map((g) => [g.folder, g.workflows.map((w) => w.name)]),
    ).toEqual([
      ["Lead Capture", ["Speed to Lead"]],
      ["Retention", ["Churn Risk Alert", "Review Request"]],
      ["Scheduling", ["Appointment Reminders", "No-Show Recovery"]],
    ]);
  });

  it("puts automations without a folder last, under Unfiled", () => {
    const groups = groupByFolder([
      wf("Loose"),
      wf("Zeta", "Zulu"),
      wf("Blank", "  "),
    ]);
    expect(groups.map((g) => g.folder)).toEqual(["Zulu", UNFILED]);
    expect(groups[1]!.workflows.map((w) => w.name)).toEqual(["Blank", "Loose"]);
  });

  it("does not reorder the caller's array", () => {
    const input = [wf("B", "Two"), wf("A", "One")];
    groupByFolder(input);
    expect(input.map((w) => w.name)).toEqual(["B", "A"]);
  });

  it("returns no groups for no automations", () => {
    expect(groupByFolder([])).toEqual([]);
  });
});
