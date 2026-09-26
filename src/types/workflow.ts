import type { Audited, ID, ISODate } from "./common";
import type { CustomFieldValue } from "./settings";
import type { FilterGroup } from "./filter";

export type TriggerKind =
  | "form_submitted"
  | "tag_added"
  | "appointment_booked"
  | "opportunity_stage_changed"
  | "contact_created"
  | "inbound_message"
  | "birthday"
  | "manual";

export type ActionKind =
  | "send_sms"
  | "send_email"
  | "wait"
  | "if_else"
  | "add_tag"
  | "remove_tag"
  | "assign_user"
  | "create_task"
  | "update_contact_field"
  | "move_opportunity"
  | "webhook"
  | "internal_notification"
  | "end";

export type WorkflowNodeKind = TriggerKind | ActionKind;

export type NodeCategory = "trigger" | "action" | "logic";

/**
 * Config is discriminated on `kind`, so the side panel switches on one union
 * and adding a node type is one member plus one panel case.
 */
export type WorkflowNodeConfig =
  | { kind: "form_submitted"; formName?: string }
  | { kind: "tag_added"; tagIds: ID[] }
  | { kind: "appointment_booked"; calendarIds: ID[] }
  | { kind: "opportunity_stage_changed"; pipelineId?: ID; stageId?: ID }
  | { kind: "contact_created" }
  | { kind: "inbound_message"; channels: string[] }
  | { kind: "birthday" }
  | { kind: "manual" }
  | { kind: "send_sms"; body: string; templateId?: ID }
  | {
      kind: "send_email";
      subject: string;
      body: string;
      templateId?: ID;
      fromUserId?: ID;
    }
  | {
      kind: "wait";
      mode: "duration" | "until_time";
      amount?: number;
      unit?: "minutes" | "hours" | "days";
      untilTime?: string;
    }
  | {
      kind: "if_else";
      branches: { id: ID; label: string; filter: FilterGroup }[];
    }
  | { kind: "add_tag"; tagIds: ID[] }
  | { kind: "remove_tag"; tagIds: ID[] }
  | { kind: "assign_user"; strategy: "specific" | "round_robin"; userIds: ID[] }
  | { kind: "create_task"; title: string; dueInDays: number; assigneeId?: ID }
  | { kind: "update_contact_field"; fieldKey: string; value: CustomFieldValue }
  | { kind: "move_opportunity"; pipelineId?: ID; stageId?: ID }
  | { kind: "webhook"; url: string; method: "POST" | "GET" }
  | { kind: "internal_notification"; userIds: ID[]; body: string }
  | { kind: "end" };

export interface WorkflowNode {
  id: ID;
  kind: WorkflowNodeKind;
  category: NodeCategory;
  /** User-editable node title. */
  label: string;
  position: { x: number; y: number };
  /**
   * React Flow only renders nodes it has dimensions for. Persisting them means
   * the graph draws correctly on first paint, before measurement.
   */
  width: number;
  height: number;
  config: WorkflowNodeConfig;
  /** Fake run counters, for realism on the canvas. */
  stats?: { entered: number; completed: number };
}

export interface WorkflowEdge {
  id: ID;
  source: ID;
  target: ID;
  /** Branch id on if_else nodes. */
  sourceHandle?: string;
  label?: string;
  animated?: boolean;
}

export type WorkflowStatus = "draft" | "published" | "paused";

export interface Workflow extends Audited {
  id: ID;
  name: string;
  description?: string;
  folder?: string;
  status: WorkflowStatus;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  viewport?: { x: number; y: number; zoom: number };
  settings: {
    allowMultipleEnrollment: boolean;
    stopOnReply: boolean;
  };
  stats: { enrolled: number; active: number; completed: number };
  publishedAt?: ISODate;
}
