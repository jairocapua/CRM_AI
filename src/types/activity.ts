import type { ID, ISODate } from "./common";

export type ActivityType =
  | "contact.created"
  | "contact.updated"
  | "contact.tagged"
  | "message.sent"
  | "message.received"
  | "call.logged"
  | "note.added"
  | "task.created"
  | "task.completed"
  | "appointment.booked"
  | "appointment.status_changed"
  | "opportunity.created"
  | "opportunity.stage_changed"
  | "opportunity.won"
  | "opportunity.lost"
  | "workflow.enrolled"
  | "form.submitted";

export interface Activity {
  id: ID;
  type: ActivityType;
  at: ISODate;
  /** undefined = system or automation, not a person. */
  actorId?: ID;
  contactId?: ID;
  opportunityId?: ID;
  conversationId?: ID;
  appointmentId?: ID;
  workflowId?: ID;
  /** Pre-rendered headline, so timelines do not re-derive copy. */
  summary: string;
  meta?: Record<string, unknown>;
}
