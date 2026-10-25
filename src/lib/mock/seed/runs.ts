import type {
  ActionKind,
  AutomationDefinition,
  Contact,
  ID,
  RunStatus,
  WorkflowRun,
  WorkflowRunStep,
} from "@/types";
import { AUTOMATIONS, LAYOUTS } from "@/lib/automations";
import type { Layout, LayoutNode } from "@/lib/automations/layout";
import { TRIGGER_NODE_ID } from "@/lib/automations/walk";
import { newId } from "../ids";
import { REF_DATE, int, pick } from "./rng";

/**
 * Seeded run history for the code-defined automations (design "Phase 8b").
 *
 * Runs are generated from the real registry: each one walks `LAYOUTS` from the
 * trigger along real edges, taking one branch at every fork, so every step it
 * logs is a node the diagram draws. Only waits take real time; every other
 * step follows the one before within seconds.
 *
 * - Drafts never went live, so they have no runs.
 * - Published automations run up to the anchor. A run whose next step would
 *   land after it is `active`, sitting in its wait.
 * - Paused automations keep the history they made while live, up to
 *   `PAUSED_DAYS_AGO`. A run still in a wait at that moment was dropped, so
 *   none of theirs is in flight.
 *
 * The first `IN_FLIGHT` runs of each are placed mid-wait at that cutoff, so
 * every published automation shows runs in flight and every paused one shows
 * runs the pause cut short, whatever the random starts do.
 *
 * Called last in `buildDb()`: it draws from the shared faker stream, so
 * anything seeded after it would shift.
 */

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** How far back a history reaches. */
const HISTORY_DAYS = 60;
/** When the paused automations were paused, before the anchor. */
const PAUSED_DAYS_AGO = 9;
/** Runs per automation, by status. */
const RUN_COUNT = { published: [14, 20], paused: [6, 9] } as const;
/** Runs per automation placed mid-wait at its cutoff. */
const IN_FLIGHT = { published: 2, paused: 1 } as const;
/** A random start lies at least this long before the cutoff. */
const START_MARGIN = 10 * MINUTE;

const UNIT_MS = { minutes: MINUTE, hours: HOUR, days: DAY } as const;

type Step = Exclude<ActionKind, "wait" | "if_else" | "end">;

/** What an action step that worked says. Exhaustive: a new kind needs words. */
const DONE: Record<Step, string> = {
  send_sms: "SMS sent",
  send_email: "Email sent",
  add_tag: "Tag added",
  remove_tag: "Tag removed",
  assign_user: "Contact assigned",
  create_task: "Task created",
  update_contact_field: "Field updated",
  move_opportunity: "Deal moved",
  webhook: "Webhook delivered",
  internal_notification: "Team notified",
};

/** How an action step fails: the step's short detail and the run's error. */
const FAILURE: Record<Step, { detail: string; error: string }> = {
  send_sms: {
    detail: "SMS not delivered",
    error: "The carrier rejected the SMS: the number cannot receive texts.",
  },
  send_email: {
    detail: "Email bounced",
    error: "The email bounced: the mailbox does not exist.",
  },
  add_tag: {
    detail: "Tag not added",
    error: "The tag no longer exists.",
  },
  remove_tag: {
    detail: "Tag not removed",
    error: "The tag no longer exists.",
  },
  assign_user: {
    detail: "Not assigned",
    error: "No active user was available to assign.",
  },
  create_task: {
    detail: "Task not created",
    error: "The task's assignee is no longer active.",
  },
  update_contact_field: {
    detail: "Field not updated",
    error: "The custom field no longer exists.",
  },
  move_opportunity: {
    detail: "Deal not moved",
    error: "The contact has no open deal in that pipeline.",
  },
  webhook: {
    detail: "Webhook failed",
    error: "The webhook endpoint answered with an error (500).",
  },
  internal_notification: {
    detail: "Notification not sent",
    error: "No one on the notification list is active.",
  },
};

const isAction = (node: LayoutNode) => node.category === "action";

/** One path from the trigger to an end node, one branch at each fork. */
function pickPath({ nodes, edges }: Layout): LayoutNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const path: LayoutNode[] = [];
  let node = byId.get(TRIGGER_NODE_ID)!;
  for (;;) {
    path.push(node);
    const out = edges.filter((e) => e.source === node.id);
    if (out.length === 0) return path;
    const edge = out.length === 1 ? out[0]! : pick(out);
    node = byId.get(edge.target)!;
  }
}

/** When a wait entered at `entered` lets the run go on. */
function resumeAt(node: LayoutNode, entered: number): number {
  const c = node.config;
  if (c.kind !== "wait") return entered;
  if (c.mode === "duration") {
    return entered + (c.amount ?? 0) * UNIT_MS[c.unit ?? "minutes"];
  }
  // "until_time": the next HH:MM (UTC) after entering.
  const [hours = 9, minutes = 0] = (c.untilTime ?? "09:00")
    .split(":")
    .map(Number);
  const day = new Date(entered);
  day.setUTCHours(hours, minutes, 0, 0);
  const at = day.getTime();
  return at > entered ? at : at + DAY;
}

/** How long a wait lasts, as the step log says it: "30 minutes", "1 day". */
function waitText(node: LayoutNode): string {
  const c = node.config;
  if (c.kind !== "wait") return "";
  if (c.mode === "until_time") return `until ${c.untilTime ?? "09:00"}`;
  const amount = c.amount ?? 0;
  const unit = c.unit ?? "minutes";
  return `${amount} ${amount === 1 ? unit.slice(0, -1) : unit}`;
}

interface Timed {
  node: LayoutNode;
  at: number;
}

/**
 * Times each node of `path` from `start`, using `gaps` (ms after each
 * non-wait node). Stops before the first node that would run after `cutoff`;
 * only a wait can carry a run past it, so `waitingIn` is that wait.
 */
function timeline(
  path: LayoutNode[],
  gaps: number[],
  start: number,
  cutoff: number,
): { timed: Timed[]; waitingIn?: Timed } {
  const timed: Timed[] = [{ node: path[0]!, at: start }];
  for (let i = 1; i < path.length; i++) {
    const prev = timed[i - 1]!;
    const at =
      prev.node.config.kind === "wait"
        ? resumeAt(prev.node, prev.at)
        : Math.min(prev.at + gaps[i - 1]!, cutoff);
    if (at > cutoff) return { timed, waitingIn: prev };
    timed.push({ node: path[i]!, at });
  }
  return { timed };
}

/**
 * A start that leaves the run sitting in a wait at `cutoff`, or undefined
 * if none can: the path has no wait, or a clock-time wait before it makes the
 * offset depend on the start.
 */
function inFlightStart(
  path: LayoutNode[],
  gaps: number[],
  cutoff: number,
): number | undefined {
  const waits = path.flatMap((n, i) => (n.config.kind === "wait" ? [i] : []));
  if (waits.length === 0) return undefined;
  const w = pick(waits);
  let offset = 0;
  for (let i = 0; i < w; i++) {
    const node = path[i]!;
    const c = node.config;
    if (c.kind === "wait" && c.mode !== "duration") return undefined;
    offset += c.kind === "wait" ? resumeAt(node, 0) : gaps[i]!;
  }
  const length = resumeAt(path[w]!, 0);
  if (length <= 0) return undefined;
  // Entered the wait up to its full length before the cutoff.
  const intoWait = int(0, Math.floor((length - 1) / MINUTE)) * MINUTE;
  return cutoff - intoWait - offset;
}

const iso = (ms: number) => new Date(ms).toISOString();

function okStep(
  timed: Timed[],
  i: number,
  layout: Layout,
  finished = true,
): WorkflowRunStep {
  const { node, at } = timed[i]!;
  const step: WorkflowRunStep = { nodeId: node.id, at: iso(at), status: "ok" };
  const c = node.config;
  if (node.category === "trigger") {
    step.detail = "Enrolled";
  } else if (c.kind === "wait") {
    if (finished) step.detail = `Waited ${waitText(node)}`;
  } else if (c.kind === "if_else") {
    const next = timed[i + 1]?.node.id;
    const edge = layout.edges.find(
      (e) => e.source === node.id && e.target === next,
    );
    if (edge?.label) step.detail = `Branch: ${edge.label}`;
  } else if (c.kind !== "end") {
    step.detail = DONE[c.kind as Step];
  }
  return step;
}

function seedRun(
  definition: AutomationDefinition,
  layout: Layout,
  path: LayoutNode[],
  gaps: number[],
  contactId: ID,
  start: number,
  cutoff: number,
): WorkflowRun {
  const { timed, waitingIn } = timeline(path, gaps, start, cutoff);
  const base = {
    id: newId("run"),
    workflowId: definition.id,
    contactId,
    startedAt: iso(start),
  };
  const ok = (count: number, finishedLast = true) =>
    timed
      .slice(0, count)
      .map((_, i) => okStep(timed, i, layout, finishedLast || i < count - 1));

  if (waitingIn) {
    const steps = ok(timed.length, false);
    if (definition.status !== "paused") {
      steps.at(-1)!.detail = "Waiting";
      return { ...base, status: "active", steps };
    }
    // Paused mid-wait: the step it was waiting for never ran.
    const next = path[timed.length]!;
    return {
      ...base,
      status: "dropped",
      endedAt: iso(cutoff),
      steps: [
        ...steps,
        {
          nodeId: next.id,
          at: iso(cutoff),
          status: "skipped",
          detail: "Stopped: the automation was paused",
        },
      ],
    };
  }

  const roll = int(1, 100);
  const outcome: RunStatus =
    roll <= 72 ? "completed" : roll <= 86 ? "failed" : "dropped";

  if (outcome === "failed") {
    const actions = timed.flatMap((t, i) => (isAction(t.node) ? [i] : []));
    if (actions.length > 0) {
      const i = pick(actions);
      const { node, at } = timed[i]!;
      const failure = FAILURE[node.config.kind as Step];
      return {
        ...base,
        status: "failed",
        endedAt: iso(at),
        error: failure.error,
        steps: [
          ...ok(i),
          {
            nodeId: node.id,
            at: iso(at),
            status: "failed",
            detail: failure.detail,
          },
        ],
      };
    }
  }

  if (outcome === "dropped") {
    // Dropped while waiting: the step after the wait is skipped.
    const waits = timed.flatMap((t, i) =>
      t.node.config.kind === "wait" && i + 1 < timed.length ? [i] : [],
    );
    if (waits.length > 0) {
      const i = pick(waits);
      const from = timed[i]!.at;
      const span = timed[i + 1]!.at - from;
      const at = from + int(0, Math.floor(span / MINUTE)) * MINUTE;
      return {
        ...base,
        status: "dropped",
        endedAt: iso(at),
        steps: [
          ...ok(i + 1, false),
          {
            nodeId: timed[i + 1]!.node.id,
            at: iso(at),
            status: "skipped",
            detail: definition.settings.stopOnReply
              ? "Stopped: the contact replied"
              : "Stopped: the contact unsubscribed",
          },
        ],
      };
    }
  }

  return {
    ...base,
    status: "completed",
    endedAt: iso(timed.at(-1)!.at),
    steps: ok(timed.length),
  };
}

export function seedWorkflowRuns(contacts: Contact[]): WorkflowRun[] {
  const runs: WorkflowRun[] = [];
  const anchor = REF_DATE.getTime();
  const createdAt = new Map(
    contacts.map((c) => [c.id, Date.parse(c.createdAt)]),
  );

  for (const [slug, definition] of Object.entries(AUTOMATIONS)) {
    if (definition.status === "draft") continue;
    const layout = LAYOUTS[slug]!;
    const paused = definition.status === "paused";
    const cutoff = paused ? anchor - PAUSED_DAYS_AGO * DAY : anchor;
    const from = cutoff - HISTORY_DAYS * DAY;
    const onCreate = definition.trigger.config.kind === "contact_created";
    const enrolled = new Set<ID>();
    const [min, max] = RUN_COUNT[paused ? "paused" : "published"];
    const count = int(min, max);

    for (let i = 0; i < count; i++) {
      const path = pickPath(layout);
      const gaps = path.slice(1).map(() => int(5, 90) * SECOND);
      const free = (c: Contact) =>
        definition.settings.allowMultipleEnrollment || !enrolled.has(c.id);

      let contact: Contact | undefined;
      let start: number | undefined;
      if (onCreate) {
        // Enrolled the moment the contact was created.
        const fresh = contacts.filter((c) => {
          const t = createdAt.get(c.id)!;
          return free(c) && t >= from && t <= cutoff - START_MARGIN;
        });
        if (fresh.length > 0) {
          contact = pick(fresh);
          start = createdAt.get(contact.id)!;
        }
      } else {
        start =
          i < IN_FLIGHT[paused ? "paused" : "published"]
            ? inFlightStart(path, gaps, cutoff)
            : undefined;
        if (start === undefined) {
          const span = Math.floor((cutoff - START_MARGIN - from) / MINUTE);
          start = from + int(0, span) * MINUTE;
        }
        const at = start;
        const joined = contacts.filter(
          (c) => free(c) && createdAt.get(c.id)! <= at,
        );
        if (joined.length > 0) contact = pick(joined);
      }
      if (!contact || start === undefined) continue;

      enrolled.add(contact.id);
      runs.push(
        seedRun(definition, layout, path, gaps, contact.id, start, cutoff),
      );
    }
  }
  return runs;
}
