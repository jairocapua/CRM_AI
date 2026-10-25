import type {
  ID,
  RunStepStatus,
  Workflow,
  WorkflowEdge,
  WorkflowNode,
} from "@/types";
import { fullName } from "@/lib/format";

import { triggerSummary } from "./automation-summary";

/**
 * Plain-language copy for an automation's detail page (`/automation/[id]`):
 * the steps as a tree, a one-line summary of each, and how the automation
 * behaves. Pure functions over the `Workflow` that `api.workflows` returns
 * (its nodes and edges, not the authored definition), so the page works the
 * same behind a real backend.
 */

/** One step in the list. A fork carries one branch per path; others none. */
export interface StepItem {
  node: WorkflowNode;
  branches: BranchItem[];
}

/** One path out of a fork: its authored label and the steps along it. */
export interface BranchItem {
  /** The branch id, which is also the fork edge's `sourceHandle`. */
  id: ID;
  label: string;
  steps: StepItem[];
}

/**
 * The automation as a tree: the trigger, then each step in order, a fork
 * ending its list with one nested list per branch (in the order the
 * definition gives them, whatever order the edges come in). Emitted `end`
 * nodes stay in, as each path's last step, so a run log can mark them.
 *
 * Built by following edges from the trigger, so a node nothing points at is
 * not listed. Each node is visited once, so a malformed graph with a cycle
 * ends instead of looping; an edge to a missing node ends its path.
 */
export function stepTree(
  workflow: Pick<Workflow, "nodes" | "edges">,
): StepItem[] {
  const byId = new Map(workflow.nodes.map((n) => [n.id, n]));
  const outgoing = new Map<ID, WorkflowEdge[]>();
  for (const e of workflow.edges) {
    const list = outgoing.get(e.source);
    if (list) list.push(e);
    else outgoing.set(e.source, [e]);
  }
  const seen = new Set<ID>();

  function path(startId: ID | undefined): StepItem[] {
    const items: StepItem[] = [];
    let id = startId;
    while (id !== undefined && !seen.has(id)) {
      const node = byId.get(id);
      if (!node) break;
      seen.add(id);
      const out = outgoing.get(id) ?? [];
      if (node.config.kind === "if_else") {
        // A fork is terminal (StepList): its branches are the rest.
        const branches = node.config.branches.map((b) => ({
          id: b.id,
          label: b.label,
          steps: path(out.find((e) => e.sourceHandle === b.id)?.target),
        }));
        items.push({ node, branches });
        break;
      }
      items.push({ node, branches: [] });
      id = out[0]?.target;
    }
    return items;
  }

  const trigger = workflow.nodes.find((n) => n.category === "trigger");
  return trigger ? path(trigger.id) : [];
}

/** Names the step summaries may need: tag names and users, by id. */
export interface StepNames {
  tagNames: ReadonlyMap<ID, string>;
  usersById: ReadonlyMap<ID, { firstName: string; lastName: string }>;
}

/** "A", "A and B", "A, B and C"; `or` instead of `and` on request. */
function joinNames(names: readonly string[], word = "and"): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} ${word} ${names.at(-1)}`;
}

/** Ids that name something, as names; an id that names nothing is dropped. */
function named(ids: readonly ID[], lookup: (id: ID) => string | undefined) {
  return ids.flatMap((id) => {
    const name = lookup(id);
    return name ? [name] : [];
  });
}

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

const UNIT_NAMES = {
  minutes: ["minute", "minutes"],
  hours: ["hour", "hours"],
  days: ["day", "days"],
} as const;

/**
 * One line saying what a step does: "Waits 30 minutes", "Notifies Priya Nair
 * and Jordan Reyes: New audit request". A trigger reads as on the list page
 * (`triggerSummary`). Tags and users are named through `names`; an id that
 * names nothing is left out, never printed.
 */
export function stepSummary(node: WorkflowNode, names: StepNames): string {
  if (node.category === "trigger") {
    return triggerSummary({ nodes: [node] }, names.tagNames);
  }
  const tag = (id: ID) => names.tagNames.get(id);
  const user = (id: ID) => {
    const u = names.usersById.get(id);
    return u ? fullName(u) : undefined;
  };

  const c = node.config;
  switch (c.kind) {
    case "send_sms":
      return c.body ? `Texts: ${c.body}` : "Sends a text message";
    case "send_email": {
      const from = c.fromUserId ? user(c.fromUserId) : undefined;
      return `Emails “${c.subject}”${from ? ` from ${from}` : ""}`;
    }
    case "wait": {
      if (c.mode === "until_time") {
        return c.untilTime ? `Waits until ${c.untilTime}` : "Waits";
      }
      if (c.amount === undefined || c.unit === undefined) return "Waits";
      const [one, many] = UNIT_NAMES[c.unit];
      return `Waits ${plural(c.amount, one, many)}`;
    }
    case "if_else":
      return `Splits into ${plural(c.branches.length, "path", "paths")}: ${joinNames(
        c.branches.map((b) => b.label),
        "or",
      )}`;
    case "add_tag":
    case "remove_tag": {
      const verb = c.kind === "add_tag" ? "Adds" : "Removes";
      const tags = named(c.tagIds, tag);
      if (tags.length === 0) return `${verb} a tag`;
      return `${verb} the ${tags.length === 1 ? "tag" : "tags"} ${joinNames(tags)}`;
    }
    case "assign_user": {
      const users = named(c.userIds, user);
      if (users.length === 0) return "Assigns a team member";
      return c.strategy === "round_robin"
        ? `Assigns in turn to ${joinNames(users)}`
        : `Assigns to ${joinNames(users)}`;
    }
    case "create_task": {
      const due =
        c.dueInDays === 0
          ? "due the same day"
          : `due in ${plural(c.dueInDays, "day", "days")}`;
      const assignee = c.assigneeId ? user(c.assigneeId) : undefined;
      return `Task “${c.title}”, ${due}${assignee ? `, for ${assignee}` : ""}`;
    }
    case "internal_notification": {
      const users = named(c.userIds, user);
      const who = users.length > 0 ? joinNames(users) : "the team";
      return c.body ? `Notifies ${who}: ${c.body}` : `Notifies ${who}`;
    }
    case "update_contact_field":
      return `Updates the contact field ${c.fieldKey}`;
    case "move_opportunity":
      return "Moves the deal to another stage";
    case "webhook":
      return `Calls ${c.method} ${c.url}`;
    case "end":
      return "Nothing else happens on this path.";
    case "form_submitted":
    case "tag_added":
    case "appointment_booked":
    case "opportunity_stage_changed":
    case "contact_created":
    case "inbound_message":
    case "birthday":
    case "manual":
      // A trigger config on a node not marked as the trigger.
      return triggerSummary(
        { nodes: [{ ...node, category: "trigger" }] },
        names.tagNames,
      );
    default: {
      // Every config kind has a case above, so a new kind is a compile error
      // here until it gets its own summary.
      const unhandled: never = c;
      return unhandled;
    }
  }
}

/**
 * The automation's settings as "how this behaves" sentences (design §9):
 * whether a contact can go through it more than once, and whether a reply
 * stops it.
 */
export function behaviourCopy(settings: Workflow["settings"]): string[] {
  return [
    settings.allowMultipleEnrollment
      ? "A contact can go through this automation again each time it is triggered."
      : "A contact goes through this automation once, even if it is triggered again.",
    settings.stopOnReply
      ? "It stops for a contact as soon as they reply."
      : "A reply from the contact does not stop it.",
  ];
}

/**
 * Where the automation's code lives, derived from its registry key for
 * display (design §2: never a stored field, which would rot on a rename).
 */
export function sourcePath(slug: string): string {
  return `src/lib/automations/${slug}.ts`;
}

/** A run step's status as the step list labels it (run logs, P8-T07). */
export const RUN_STEP_STATUS_COPY: Readonly<Record<RunStepStatus, string>> = {
  ok: "Done",
  skipped: "Skipped",
  failed: "Failed",
};
