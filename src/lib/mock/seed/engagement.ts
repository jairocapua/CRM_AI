import type {
  Activity,
  Appointment,
  Contact,
  Conversation,
  Message,
  Note,
  Opportunity,
  Pipeline,
  SmartList,
  Task,
  User,
} from "@/types";
import { newId } from "../ids";
import { chance, int, pick, refPlusDays } from "./rng";

const TASK_TITLES = [
  "Call to confirm budget",
  "Send the revised proposal",
  "Follow up on the contract",
  "Prepare the audit deck",
  "Check in after kickoff",
  "Chase missing brand assets",
  "Book the quarterly review",
  "Update the pipeline forecast",
  "Reply to the pricing question",
  "Send onboarding checklist",
];

export function seedTasks(
  contacts: Contact[],
  opportunities: Opportunity[],
  users: User[],
  count: number,
): Task[] {
  const tasks: Task[] = [];
  for (let i = 0; i < count; i++) {
    // Roughly a third are already done, so the list has both states.
    const done = chance(0.35);
    const dueOffset = done ? -int(1, 30) : int(-4, 21);
    const opportunity = chance(0.5) ? pick(opportunities) : undefined;
    const contactId = opportunity?.contactId ?? pick(contacts).id;

    tasks.push({
      id: newId("task"),
      title: pick(TASK_TITLES),
      description: chance(0.3)
        ? "Context from the last call is in the thread."
        : undefined,
      dueAt: refPlusDays(dueOffset, int(9, 17)),
      completedAt: done ? refPlusDays(dueOffset, int(9, 17)) : undefined,
      assigneeId: pick(users).id,
      contactId,
      opportunityId: opportunity?.id,
      priority: pick(["low", "medium", "medium", "high"]),
      createdAt: refPlusDays(dueOffset - int(1, 10), int(8, 17)),
      updatedAt: refPlusDays(Math.min(dueOffset, 0), int(8, 17)),
    });
  }
  return tasks;
}

const NOTE_BODIES = [
  "Prefers email over phone. Decision goes through their ops lead.",
  "Currently on a month-to-month with another agency, unhappy with reporting.",
  "Budget approved for Q4, wants to start in the first week.",
  "Asked about case studies in the dental space - sent three.",
  "Has an in-house designer, so we only need to cover paid media.",
  "Very responsive on SMS, slow on email.",
];

export function seedNotes(
  contacts: Contact[],
  users: User[],
  count: number,
): Note[] {
  const notes: Note[] = [];
  const pool = [...contacts].sort((a, b) => b.score - a.score).slice(0, 120);
  for (let i = 0; i < count; i++) {
    const at = refPlusDays(-int(1, 120), int(9, 18));
    notes.push({
      id: newId("note"),
      contactId: pool[i % pool.length]!.id,
      authorId: pick(users).id,
      body: pick(NOTE_BODIES),
      pinned: chance(0.15),
      createdAt: at,
      updatedAt: at,
    });
  }
  return notes;
}

export function seedSmartLists(users: User[]): SmartList[] {
  const created = { createdAt: refPlusDays(-200), updatedAt: refPlusDays(-20) };
  const owner = users[0]!.id;

  const list = (
    name: string,
    conditions: SmartList["filter"]["conditions"],
    isPinned = true,
    combinator: "and" | "or" = "and",
  ): SmartList => ({
    id: newId("sl"),
    name,
    objectType: "contact",
    filter: { id: newId("fg"), combinator, conditions },
    isPinned,
    ownerId: undefined,
    ...created,
  });

  return [
    list("Hot Leads", [
      { id: newId("fc"), field: "status", operator: "eq", value: "lead" },
      { id: newId("fc"), field: "score", operator: "gte", value: 70 },
    ]),
    list("Customers", [
      { id: newId("fc"), field: "status", operator: "eq", value: "customer" },
    ]),
    list("No Recent Activity", [
      {
        id: newId("fc"),
        field: "lastActivityAt",
        operator: "before",
        value: refPlusDays(-30),
      },
    ]),
    list(
      "Missing Phone",
      [{ id: newId("fc"), field: "phone", operator: "isEmpty" }],
      false,
    ),
    {
      ...list("My Contacts", [
        { id: newId("fc"), field: "ownerId", operator: "eq", value: owner },
      ]),
      ownerId: owner,
    },
    list(
      "Churn Risk",
      [
        { id: newId("fc"), field: "status", operator: "eq", value: "churned" },
        { id: newId("fc"), field: "score", operator: "lt", value: 30 },
      ],
      false,
      "or",
    ),
  ];
}

/**
 * Activities are derived from entities that already exist rather than invented
 * separately, so every timeline entry corresponds to something the user can
 * actually click through to.
 */
export function seedActivities(input: {
  contacts: Contact[];
  opportunities: Opportunity[];
  pipelines: Pipeline[];
  conversations: Conversation[];
  messages: Message[];
  appointments: Appointment[];
  tasks: Task[];
  notes: Note[];
}): Activity[] {
  const activities: Activity[] = [];
  const stageName = new Map<string, string>();
  for (const pipeline of input.pipelines) {
    for (const stage of pipeline.stages) stageName.set(stage.id, stage.name);
  }

  for (const contact of input.contacts) {
    activities.push({
      id: newId("act"),
      type: "contact.created",
      at: contact.createdAt,
      contactId: contact.id,
      actorId: contact.source === "manual" ? contact.ownerId : undefined,
      summary: `${contact.firstName} ${contact.lastName} was created`,
      meta: { source: contact.source },
    });
  }

  for (const opportunity of input.opportunities) {
    activities.push({
      id: newId("act"),
      type: "opportunity.created",
      at: opportunity.createdAt,
      contactId: opportunity.contactId,
      opportunityId: opportunity.id,
      actorId: opportunity.ownerId,
      summary: `Opportunity "${opportunity.name}" was created`,
    });

    if (opportunity.stageEnteredAt !== opportunity.createdAt) {
      activities.push({
        id: newId("act"),
        type:
          opportunity.status === "won"
            ? "opportunity.won"
            : opportunity.status === "lost"
              ? "opportunity.lost"
              : "opportunity.stage_changed",
        at: opportunity.stageEnteredAt,
        contactId: opportunity.contactId,
        opportunityId: opportunity.id,
        actorId: opportunity.ownerId,
        summary:
          opportunity.status === "won"
            ? `Won "${opportunity.name}"`
            : opportunity.status === "lost"
              ? `Lost "${opportunity.name}" - ${opportunity.lostReason}`
              : `Moved to ${stageName.get(opportunity.stageId) ?? "a new stage"}`,
        meta: { stage: stageName.get(opportunity.stageId) },
      });
    }
  }

  // Only the newest few messages per thread become activities — otherwise the
  // feed is nothing but message noise.
  const byConversation = new Map<string, Message[]>();
  for (const message of input.messages) {
    const list = byConversation.get(message.conversationId) ?? [];
    list.push(message);
    byConversation.set(message.conversationId, list);
  }

  for (const conversation of input.conversations) {
    const thread = (byConversation.get(conversation.id) ?? []).slice(-2);
    for (const message of thread) {
      activities.push({
        id: newId("act"),
        type:
          message.channel === "call"
            ? "call.logged"
            : message.direction === "inbound"
              ? "message.received"
              : "message.sent",
        at: message.sentAt,
        contactId: conversation.contactId,
        conversationId: conversation.id,
        actorId: message.authorId,
        summary:
          message.channel === "call"
            ? "Call logged"
            : message.direction === "inbound"
              ? `Received a ${message.channel} message`
              : `Sent a ${message.channel} message`,
      });
    }
  }

  for (const appointment of input.appointments) {
    activities.push({
      id: newId("act"),
      type: "appointment.booked",
      at: appointment.createdAt,
      contactId: appointment.contactId,
      appointmentId: appointment.id,
      actorId:
        appointment.source === "manual"
          ? appointment.assignedUserId
          : undefined,
      summary: `Booked "${appointment.title}"`,
    });
    if (appointment.status !== "confirmed") {
      activities.push({
        id: newId("act"),
        type: "appointment.status_changed",
        at: appointment.updatedAt,
        contactId: appointment.contactId,
        appointmentId: appointment.id,
        summary: `Appointment marked ${appointment.status.replace("_", " ")}`,
      });
    }
  }

  for (const task of input.tasks) {
    if (!task.completedAt) continue;
    activities.push({
      id: newId("act"),
      type: "task.completed",
      at: task.completedAt,
      contactId: task.contactId,
      opportunityId: task.opportunityId,
      actorId: task.assigneeId,
      summary: `Completed "${task.title}"`,
    });
  }

  for (const note of input.notes) {
    activities.push({
      id: newId("act"),
      type: "note.added",
      at: note.createdAt,
      contactId: note.contactId,
      actorId: note.authorId,
      summary: "Note added",
    });
  }

  return activities.sort((a, b) => b.at.localeCompare(a.at));
}
