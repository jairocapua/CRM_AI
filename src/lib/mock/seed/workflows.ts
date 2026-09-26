import type {
  ID,
  Tag,
  Workflow,
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeConfig,
  WorkflowStatus,
} from "@/types";
import { newId } from "../ids";
import { int, pick, refPlusDays } from "./rng";

/**
 * Node geometry is persisted rather than measured. React Flow only renders
 * nodes it has dimensions for, so shipping width/height means the graph draws
 * correctly on first paint instead of flashing empty.
 */
export const NODE_WIDTH = 260;
export const NODE_HEIGHT = 78;
const X = 0;
const Y_STEP = 130;

const CATEGORY: Record<string, WorkflowNode["category"]> = {
  form_submitted: "trigger",
  tag_added: "trigger",
  appointment_booked: "trigger",
  opportunity_stage_changed: "trigger",
  contact_created: "trigger",
  inbound_message: "trigger",
  birthday: "trigger",
  manual: "trigger",
  if_else: "logic",
  wait: "logic",
  end: "logic",
};

function node(
  config: WorkflowNodeConfig,
  label: string,
  row: number,
  column = 0,
): WorkflowNode {
  return {
    id: newId("node"),
    kind: config.kind,
    category: CATEGORY[config.kind] ?? "action",
    label,
    position: { x: X + column * 300, y: row * Y_STEP },
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    config,
    stats: { entered: int(20, 900), completed: int(10, 800) },
  };
}

function chain(nodes: WorkflowNode[]): WorkflowEdge[] {
  const edges: WorkflowEdge[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    edges.push({
      id: newId("edge"),
      source: nodes[i]!.id,
      target: nodes[i + 1]!.id,
    });
  }
  return edges;
}

function shell(
  name: string,
  description: string,
  folder: string,
  status: WorkflowStatus,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): Workflow {
  const enrolled = int(40, 1200);
  const completed = Math.round(enrolled * (int(35, 85) / 100));
  return {
    id: newId("wf"),
    name,
    description,
    folder,
    status,
    nodes,
    edges,
    viewport: { x: 0, y: 0, zoom: 1 },
    settings: { allowMultipleEnrollment: false, stopOnReply: true },
    stats: { enrolled, active: enrolled - completed, completed },
    publishedAt:
      status === "published" ? refPlusDays(-int(10, 200)) : undefined,
    createdAt: refPlusDays(-int(60, 320)),
    updatedAt: refPlusDays(-int(1, 40)),
  };
}

export function seedWorkflows(tags: Tag[], userIds: ID[]): Workflow[] {
  const tagId = (name: string) =>
    tags.find((t) => t.name === name)?.id ?? tags[0]!.id;

  const workflows: Workflow[] = [];

  // 1. Speed-to-lead: the canonical GHL workflow, with a branch.
  {
    const trigger = node(
      { kind: "form_submitted", formName: "Free Website Audit" },
      "Form submitted",
      0,
    );
    const notify = node(
      {
        kind: "internal_notification",
        userIds: userIds.slice(0, 2),
        body: "New audit request",
      },
      "Notify sales",
      1,
    );
    const sms = node(
      {
        kind: "send_sms",
        body: "Hi {{contact.first_name}}, thanks for requesting the audit! When is a good time to talk?",
      },
      "Send SMS",
      2,
    );
    const wait = node(
      { kind: "wait", mode: "duration", amount: 30, unit: "minutes" },
      "Wait 30 minutes",
      3,
    );
    const branch = node(
      {
        kind: "if_else",
        branches: [
          {
            id: "b_replied",
            label: "Replied",
            filter: {
              id: newId("fg"),
              combinator: "and",
              conditions: [
                {
                  id: newId("fc"),
                  field: "lastActivityAt",
                  operator: "inLastDays",
                  value: 1,
                },
              ],
            },
          },
          {
            id: "b_silent",
            label: "No reply",
            filter: { id: newId("fg"), combinator: "and", conditions: [] },
          },
        ],
      },
      "Replied?",
      4,
    );
    const assign = node(
      {
        kind: "assign_user",
        strategy: "round_robin",
        userIds: userIds.slice(1, 4),
      },
      "Assign rep",
      5,
      -1,
    );
    const email = node(
      {
        kind: "send_email",
        subject: "Your website audit",
        body: "Hi {{contact.first_name}}, here is the audit we promised.",
      },
      "Send audit email",
      5,
      1,
    );

    const nodes = [trigger, notify, sms, wait, branch, assign, email];
    const edges = [
      ...chain([trigger, notify, sms, wait, branch]),
      {
        id: newId("edge"),
        source: branch.id,
        target: assign.id,
        sourceHandle: "b_replied",
        label: "Replied",
      },
      {
        id: newId("edge"),
        source: branch.id,
        target: email.id,
        sourceHandle: "b_silent",
        label: "No reply",
      },
    ];

    workflows.push(
      shell(
        "Speed to Lead",
        "Respond to new audit requests within minutes and route hot leads to a rep.",
        "Lead Capture",
        "published",
        nodes,
        edges,
      ),
    );
  }

  // 2. Appointment reminder sequence.
  {
    const trigger = node(
      { kind: "appointment_booked", calendarIds: [] },
      "Appointment booked",
      0,
    );
    const confirm = node(
      {
        kind: "send_sms",
        body: "You are booked for {{appointment.time}}. Reply R to reschedule.",
      },
      "Confirmation SMS",
      1,
    );
    const wait = node(
      { kind: "wait", mode: "duration", amount: 1, unit: "days" },
      "Wait 1 day",
      2,
    );
    const remind = node(
      { kind: "send_sms", body: "See you tomorrow at {{appointment.time}}!" },
      "Reminder SMS",
      3,
    );
    const tag = node(
      { kind: "add_tag", tagIds: [tagId("Demo Booked")] },
      "Tag as booked",
      4,
    );
    const end = node({ kind: "end" }, "End", 5);
    const nodes = [trigger, confirm, wait, remind, tag, end];
    workflows.push(
      shell(
        "Appointment Reminders",
        "Confirm the booking, then remind the day before to cut no-shows.",
        "Scheduling",
        "published",
        nodes,
        chain(nodes),
      ),
    );
  }

  // 3. No-show recovery.
  {
    const trigger = node(
      { kind: "tag_added", tagIds: [tagId("Needs Follow Up")] },
      "Tagged: Needs Follow Up",
      0,
    );
    const sms = node(
      {
        kind: "send_sms",
        body: "Sorry we missed you! Grab another time here: {{calendar.link}}",
      },
      "No-show SMS",
      1,
    );
    const wait = node(
      { kind: "wait", mode: "duration", amount: 2, unit: "days" },
      "Wait 2 days",
      2,
    );
    const task = node(
      { kind: "create_task", title: "Call the no-show", dueInDays: 1 },
      "Create task",
      3,
    );
    const nodes = [trigger, sms, wait, task];
    workflows.push(
      shell(
        "No-Show Recovery",
        "Win back missed appointments with a text and a follow-up task.",
        "Scheduling",
        "published",
        nodes,
        chain(nodes),
      ),
    );
  }

  // 4. Long-term nurture.
  {
    const trigger = node({ kind: "contact_created" }, "Contact created", 0);
    const tag = node(
      { kind: "add_tag", tagIds: [tagId("Newsletter")] },
      "Add to newsletter",
      1,
    );
    const wait = node(
      { kind: "wait", mode: "duration", amount: 3, unit: "days" },
      "Wait 3 days",
      2,
    );
    const email = node(
      {
        kind: "send_email",
        subject: "3 things we would fix first",
        body: "Hi {{contact.first_name}}, here are the three things we would tackle first.",
      },
      "Value email",
      3,
    );
    const nodes = [trigger, tag, wait, email];
    workflows.push(
      shell(
        "New Lead Nurture",
        "Warm up every new contact with a short value sequence.",
        "Nurture",
        "published",
        nodes,
        chain(nodes),
      ),
    );
  }

  // 5–8: shorter drafts and paused flows, so the list page has variety.
  const extras: [string, string, string, WorkflowStatus][] = [
    [
      "Proposal Follow-Up",
      "Chase proposals that have gone quiet for five days.",
      "Sales",
      "paused",
    ],
    [
      "Review Request",
      "Ask happy clients for a review after a won deal.",
      "Retention",
      "published",
    ],
    [
      "Churn Risk Alert",
      "Flag accounts that have gone quiet for 30 days.",
      "Retention",
      "draft",
    ],
    [
      "Birthday Greeting",
      "Send a short birthday note to every active contact.",
      "Nurture",
      "draft",
    ],
  ];

  for (const [name, description, folder, status] of extras) {
    const trigger = node(
      pick<WorkflowNodeConfig>([
        { kind: "manual" },
        { kind: "tag_added", tagIds: [tagId("Proposal Sent")] },
        { kind: "birthday" },
      ]),
      "Trigger",
      0,
    );
    const wait = node(
      { kind: "wait", mode: "duration", amount: int(1, 5), unit: "days" },
      `Wait ${int(1, 5)} days`,
      1,
    );
    const send = node(
      {
        kind: "send_email",
        subject: name,
        body: "Hi {{contact.first_name}}, just checking in.",
      },
      "Send email",
      2,
    );
    const nodes = [trigger, wait, send];
    workflows.push(
      shell(name, description, folder, status, nodes, chain(nodes)),
    );
  }

  return workflows;
}
