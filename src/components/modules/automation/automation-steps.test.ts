import { describe, expect, it } from "vitest";

import type {
  ID,
  RunStepStatus,
  Workflow,
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeConfig,
} from "@/types";

import {
  RUN_STEP_STATUS_COPY,
  behaviourCopy,
  sourcePath,
  stepSummary,
  stepTree,
  type StepItem,
} from "./automation-steps";

/**
 * The detail page (`/automation/[id]`) draws an automation as a nested step
 * list. Everything it derives from a `Workflow` (the step tree, each step's
 * one-line summary, the "how this behaves" sentences, the source path) lives
 * in `automation-steps.ts` as pure functions, pinned here.
 */

function node(
  id: ID,
  config: WorkflowNodeConfig,
  label = id,
  category: WorkflowNode["category"] = id === "trigger" ? "trigger" : "action",
): WorkflowNode {
  return {
    id,
    kind: config.kind,
    category,
    label,
    position: { x: 0, y: 0 },
    width: 260,
    height: 78,
    config,
  };
}

const edge = (
  source: ID,
  target: ID,
  branch?: { id: ID; label: string },
): WorkflowEdge => ({
  id: `${source}->${target}`,
  source,
  target,
  ...(branch ? { sourceHandle: branch.id, label: branch.label } : {}),
});

const FILTER = { id: "fg", combinator: "and" as const, conditions: [] };
const REPLIED = { id: "b_replied", label: "Replied" };
const SILENT = { id: "b_silent", label: "No reply" };

/**
 * Speed to Lead's shape: trigger, two steps, then a fork whose branches each
 * hold one step and an emitted end. Nodes and edges are deliberately out of
 * order (the No reply edge first, the trigger not first), as an API is free
 * to return them.
 */
function forked(): Pick<Workflow, "nodes" | "edges"> {
  return {
    nodes: [
      node("sms", { kind: "send_sms", body: "Hi" }, "Send SMS"),
      node("end:email", { kind: "end" }, "End", "logic"),
      node("trigger", { kind: "manual" }, "Manual trigger"),
      node(
        "fork",
        {
          kind: "if_else",
          branches: [
            { ...REPLIED, filter: FILTER },
            { ...SILENT, filter: FILTER },
          ],
        },
        "Replied?",
        "logic",
      ),
      node("wait", { kind: "wait", mode: "duration", amount: 1, unit: "days" }),
      node(
        "assign",
        { kind: "assign_user", strategy: "specific", userIds: [] },
        "Assign rep",
      ),
      node(
        "email",
        { kind: "send_email", subject: "Audit", body: "Hi" },
        "Send audit email",
      ),
      node("end:assign", { kind: "end" }, "End", "logic"),
    ],
    edges: [
      edge("fork", "email", SILENT),
      edge("email", "end:email"),
      edge("trigger", "sms"),
      edge("sms", "wait"),
      edge("wait", "fork"),
      edge("fork", "assign", REPLIED),
      edge("assign", "end:assign"),
    ],
  };
}

/** A tree as ids, branches as `{ label: [ids] }`, for readable assertions. */
function shape(items: StepItem[]): unknown[] {
  return items.map((item) =>
    item.branches.length === 0
      ? item.node.id
      : {
          [item.node.id]: item.branches.map((b) => ({
            [`${b.id}:${b.label}`]: shape(b.steps),
          })),
        },
  );
}

describe("stepTree", () => {
  it("walks from the trigger, forks into one list per branch in authored order", () => {
    expect(shape(stepTree(forked()))).toEqual([
      "trigger",
      "sms",
      "wait",
      {
        fork: [
          { "b_replied:Replied": ["assign", "end:assign"] },
          { "b_silent:No reply": ["email", "end:email"] },
        ],
      },
    ]);
  });

  it("keeps each step's node, so the list can show its label and config", () => {
    const [trigger, sms] = stepTree(forked());
    expect(trigger!.node.label).toBe("Manual trigger");
    expect(sms!.node.config).toEqual({ kind: "send_sms", body: "Hi" });
  });

  it("names a branch by its authored label even if the edge has none", () => {
    const workflow = forked();
    workflow.edges = workflow.edges.map((e) => ({ ...e, label: undefined }));
    const fork = stepTree(workflow).at(-1)!;
    expect(fork.branches.map((b) => b.label)).toEqual(["Replied", "No reply"]);
  });

  it("lists a branch with no edge as empty instead of dropping it", () => {
    const workflow = forked();
    workflow.edges = workflow.edges.filter(
      (e) => e.sourceHandle !== "b_silent",
    );
    const fork = stepTree(workflow).at(-1)!;
    expect(fork.branches.map((b) => [b.label, b.steps.length])).toEqual([
      ["Replied", 2],
      ["No reply", 0],
    ]);
  });

  it("nests a fork inside a branch, each fork's branches in authored order", () => {
    const HOT = { id: "b_hot", label: "Hot" };
    const COLD = { id: "b_cold", label: "Cold" };
    const outer = node(
      "outer",
      {
        kind: "if_else",
        branches: [
          { ...REPLIED, filter: FILTER },
          { ...SILENT, filter: FILTER },
        ],
      },
      "Replied?",
      "logic",
    );
    const inner = node(
      "inner",
      {
        kind: "if_else",
        branches: [
          { ...HOT, filter: FILTER },
          { ...COLD, filter: FILTER },
        ],
      },
      "Hot lead?",
      "logic",
    );
    // Edges in reverse of the authored branch order at both levels.
    const workflow: Pick<Workflow, "nodes" | "edges"> = {
      nodes: [
        node("end:email", { kind: "end" }, "End", "logic"),
        inner,
        node("trigger", { kind: "manual" }),
        node("email", { kind: "send_email", subject: "Audit", body: "Hi" }),
        node("end:cold", { kind: "end" }, "End", "logic"),
        node("task", { kind: "create_task", title: "Call", dueInDays: 0 }),
        outer,
        node("end:task", { kind: "end" }, "End", "logic"),
      ],
      edges: [
        edge("outer", "email", SILENT),
        edge("email", "end:email"),
        edge("inner", "end:cold", COLD),
        edge("inner", "task", HOT),
        edge("task", "end:task"),
        edge("outer", "inner", REPLIED),
        edge("trigger", "outer"),
      ],
    };

    expect(shape(stepTree(workflow))).toEqual([
      "trigger",
      {
        outer: [
          {
            "b_replied:Replied": [
              {
                inner: [
                  { "b_hot:Hot": ["task", "end:task"] },
                  { "b_cold:Cold": ["end:cold"] },
                ],
              },
            ],
          },
          { "b_silent:No reply": ["email", "end:email"] },
        ],
      },
    ]);
  });

  it("is a straight list when nothing forks", () => {
    const workflow: Pick<Workflow, "nodes" | "edges"> = {
      nodes: [
        node("trigger", { kind: "birthday" }),
        node("wait", { kind: "wait", mode: "until_time", untilTime: "09:00" }),
        node("end:wait", { kind: "end" }, "End", "logic"),
      ],
      edges: [edge("trigger", "wait"), edge("wait", "end:wait")],
    };
    expect(shape(stepTree(workflow))).toEqual(["trigger", "wait", "end:wait"]);
  });

  it("is empty without a trigger, and stops at an edge to a missing node", () => {
    expect(stepTree({ nodes: [], edges: [] })).toEqual([]);
    const workflow: Pick<Workflow, "nodes" | "edges"> = {
      nodes: [node("trigger", { kind: "manual" })],
      edges: [edge("trigger", "ghost")],
    };
    expect(shape(stepTree(workflow))).toEqual(["trigger"]);
  });

  it("visits each node once, so a cycle cannot hang the page", () => {
    const workflow: Pick<Workflow, "nodes" | "edges"> = {
      nodes: [
        node("trigger", { kind: "manual" }),
        node("a", { kind: "send_sms", body: "Hi" }),
      ],
      edges: [edge("trigger", "a"), edge("a", "trigger")],
    };
    expect(shape(stepTree(workflow))).toEqual(["trigger", "a"]);
  });
});

const NAMES = {
  tagNames: new Map<ID, string>([
    ["tag_1", "Newsletter"],
    ["tag_2", "Demo Booked"],
  ]),
  usersById: new Map<ID, { firstName: string; lastName: string }>([
    ["usr_1", { firstName: "Priya", lastName: "Nair" }],
    ["usr_2", { firstName: "Marcus", lastName: "Bell" }],
    ["usr_3", { firstName: "Lena", lastName: "Okafor" }],
  ]),
};

describe("stepSummary", () => {
  const cases: [string, WorkflowNodeConfig, string][] = [
    [
      "a trigger, as the list page says it",
      { kind: "form_submitted", formName: "Free Website Audit" },
      "When a form is submitted: Free Website Audit",
    ],
    [
      "an SMS",
      { kind: "send_sms", body: "Hi {{contact.first_name}}" },
      "Texts: Hi {{contact.first_name}}",
    ],
    ["an empty SMS", { kind: "send_sms", body: "" }, "Sends a text message"],
    [
      "an email from a known user",
      { kind: "send_email", subject: "Audit", body: "Hi", fromUserId: "usr_2" },
      "Emails “Audit” from Marcus Bell",
    ],
    [
      "an email from an unknown user",
      { kind: "send_email", subject: "Audit", body: "Hi", fromUserId: "usr_x" },
      "Emails “Audit”",
    ],
    [
      "a wait of one unit",
      { kind: "wait", mode: "duration", amount: 1, unit: "days" },
      "Waits 1 day",
    ],
    [
      "a wait of several units",
      { kind: "wait", mode: "duration", amount: 30, unit: "minutes" },
      "Waits 30 minutes",
    ],
    [
      "a wait until a time",
      { kind: "wait", mode: "until_time", untilTime: "09:00" },
      "Waits until 09:00",
    ],
    ["a wait with nothing set", { kind: "wait", mode: "duration" }, "Waits"],
    [
      "a fork",
      {
        kind: "if_else",
        branches: [
          { ...REPLIED, filter: FILTER },
          { ...SILENT, filter: FILTER },
        ],
      },
      "Splits into 2 paths: Replied or No reply",
    ],
    [
      "one tag added",
      { kind: "add_tag", tagIds: ["tag_1"] },
      "Adds the tag Newsletter",
    ],
    [
      "two tags removed, one unknown dropped",
      { kind: "remove_tag", tagIds: ["tag_1", "tag_x", "tag_2"] },
      "Removes the tags Newsletter and Demo Booked",
    ],
    [
      "a tag that resolves to nothing",
      { kind: "add_tag", tagIds: ["tag_x"] },
      "Adds a tag",
    ],
    [
      "round-robin assignment",
      {
        kind: "assign_user",
        strategy: "round_robin",
        userIds: ["usr_1", "usr_2", "usr_3"],
      },
      "Assigns in turn to Priya Nair, Marcus Bell and Lena Okafor",
    ],
    [
      "a specific assignee",
      { kind: "assign_user", strategy: "specific", userIds: ["usr_1"] },
      "Assigns to Priya Nair",
    ],
    [
      "an assignment to nobody known",
      { kind: "assign_user", strategy: "specific", userIds: ["usr_x"] },
      "Assigns a team member",
    ],
    [
      "a task with an assignee",
      {
        kind: "create_task",
        title: "Call back",
        dueInDays: 1,
        assigneeId: "usr_3",
      },
      "Task “Call back”, due in 1 day, for Lena Okafor",
    ],
    [
      "a task due today with no assignee",
      { kind: "create_task", title: "Call back", dueInDays: 0 },
      "Task “Call back”, due the same day",
    ],
    [
      "a task due in several days",
      { kind: "create_task", title: "Call back", dueInDays: 3 },
      "Task “Call back”, due in 3 days",
    ],
    [
      "a notification",
      {
        kind: "internal_notification",
        userIds: ["usr_1", "usr_2"],
        body: "New audit request",
      },
      "Notifies Priya Nair and Marcus Bell: New audit request",
    ],
    [
      "a notification to nobody known",
      { kind: "internal_notification", userIds: [], body: "Heads up" },
      "Notifies the team: Heads up",
    ],
    [
      "a contact field update",
      { kind: "update_contact_field", fieldKey: "budget_range", value: "high" },
      "Updates the contact field budget_range",
    ],
    [
      "a deal move",
      { kind: "move_opportunity" },
      "Moves the deal to another stage",
    ],
    [
      "a webhook",
      { kind: "webhook", url: "https://example.com/hook", method: "POST" },
      "Calls POST https://example.com/hook",
    ],
    ["an end", { kind: "end" }, "Nothing else happens on this path."],
  ];

  it.each(cases)("%s", (_name, config, expected) => {
    const category = config.kind === "form_submitted" ? "trigger" : "action";
    const id = category === "trigger" ? "trigger" : "step";
    expect(stepSummary(node(id, config, "Label", category), NAMES)).toBe(
      expected,
    );
  });
});

describe("behaviourCopy", () => {
  it("says once-only and stop-on-reply plainly", () => {
    expect(
      behaviourCopy({ allowMultipleEnrollment: false, stopOnReply: true }),
    ).toEqual([
      "A contact goes through this automation once, even if it is triggered again.",
      "It stops for a contact as soon as they reply.",
    ]);
  });

  it("says repeat enrolment and keep-going plainly", () => {
    expect(
      behaviourCopy({ allowMultipleEnrollment: true, stopOnReply: false }),
    ).toEqual([
      "A contact can go through this automation again each time it is triggered.",
      "A reply from the contact does not stop it.",
    ]);
  });
});

describe("sourcePath", () => {
  it("derives the module path from the registry key", () => {
    expect(sourcePath("speed-to-lead")).toBe(
      "src/lib/automations/speed-to-lead.ts",
    );
  });
});

describe("RUN_STEP_STATUS_COPY", () => {
  it("names every run step status", () => {
    const statuses: RunStepStatus[] = ["ok", "skipped", "failed"];
    expect(statuses.map((s) => RUN_STEP_STATUS_COPY[s])).toEqual([
      "Done",
      "Skipped",
      "Failed",
    ]);
  });
});
