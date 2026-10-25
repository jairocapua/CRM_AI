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

/**
 * What `api.workflows` returns: an `AutomationDefinition` with its stable keys
 * resolved to ids and its steps flattened into nodes and edges.
 */
export interface Workflow extends Audited {
  id: ID;
  name: string;
  description?: string;
  folder?: string;
  status: WorkflowStatus;
  /** The definition's `owner` slug, resolved; unset if no user has it. */
  ownerId?: ID;
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

// ---------------------------------------------------------------------------
// The authored layer: what a developer writes in `src/lib/automations/`.
//
// Definitions are code, but tags and users are seeded rows whose ids change on
// every reseed. So definitions never hold an id for either: they name tags by
// `name` and users by `slug` (the `tags` / `users` / `owner` / `fromUser` /
// `assignee` fields below), and `api.workflows` resolves them at read time
// into the id-based `WorkflowNodeConfig` above.
// ---------------------------------------------------------------------------

/** Config kinds whose authored form names tags or users by stable key. */
type KeyedKind =
  | "tag_added"
  | "add_tag"
  | "remove_tag"
  | "assign_user"
  | "internal_notification"
  | "send_email"
  | "create_task";

type Unkeyed<K extends WorkflowNodeKind> = Exclude<
  Extract<WorkflowNodeConfig, { kind: K }>,
  { kind: KeyedKind }
>;

export type AuthoredTriggerConfig =
  Unkeyed<TriggerKind> | { kind: "tag_added"; tags: string[] };

/** Every step kind except `if_else` (a `BranchStep`) and `end` (emitted, never authored). */
export type AuthoredActionConfig =
  | Unkeyed<Exclude<ActionKind, "if_else" | "end">>
  | { kind: "add_tag"; tags: string[] }
  | { kind: "remove_tag"; tags: string[] }
  | {
      kind: "assign_user";
      strategy: "specific" | "round_robin";
      users: string[];
    }
  | { kind: "internal_notification"; users: string[]; body: string }
  | {
      kind: "send_email";
      subject: string;
      body: string;
      templateId?: ID;
      fromUser?: string;
    }
  | {
      kind: "create_task";
      title: string;
      dueInDays: number;
      assignee?: string;
    };

/**
 * Step ids are hand-written and unique within a definition (the trigger is
 * always node `"trigger"`): run logs and the diagram refer to steps by them.
 * No position or size — layout derives those.
 */
export interface LinearStep {
  id: ID;
  label: string;
  config: AuthoredActionConfig;
}

export interface AuthoredBranch {
  /** Becomes the edge's `sourceHandle`. */
  id: ID;
  label: string;
  filter: FilterGroup;
  /** Must hold at least one step; the integrity report checks. */
  steps: StepList;
}

export interface BranchStep {
  id: ID;
  label: string;
  config: { kind: "if_else"; branches: AuthoredBranch[] };
}

/**
 * A branch is terminal: it can only be the last step, so paths never rejoin
 * and the steps form a tree. A step after an `if_else` is a compile error
 * rather than a silently unreachable node.
 */
export type StepList = [...LinearStep[], BranchStep] | LinearStep[];

export interface AutomationDefinition {
  /** Stable, hand-written: "wf_speed_to_lead". Never generated. */
  id: ID;
  name: string;
  description: string;
  folder: string;
  status: WorkflowStatus;
  /** User slug, resolved to a real user at read time. */
  owner: string;
  trigger: { label: string; config: AuthoredTriggerConfig };
  steps: StepList;
  settings: { allowMultipleEnrollment: boolean; stopOnReply: boolean };
}
