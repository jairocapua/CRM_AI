import type {
  AutomationRequest,
  AutomationRequestPriority,
  AutomationRequestStatus,
  ID,
} from "@/types";
import { AUTOMATIONS } from "@/lib/automations";
import { db } from "@/lib/mock/db";
import { newId } from "@/lib/mock/ids";
import { invalidate } from "./cache";
import {
  ApiError,
  applyQuery,
  notFound,
  nowIso,
  simulate,
  type ListQuery,
  type Page,
} from "./http";

/**
 * Requests for new automations (design "Phase 8b — API and UI"). Staff file
 * them with `create()`; the developer answers with `setStatus()`, which is
 * also where a shipped request names the automation it became. Shaped like
 * `smart-lists.ts`: reads never fail, mutations take longer, may fail, and
 * invalidate "automationRequests".
 */

/** A request as listed: the stored record plus its automation's name. */
export interface AutomationRequestRow extends AutomationRequest {
  /**
   * The shipped automation's name, joined at read time from the registry by
   * `shippedWorkflowId` and never stored. Unset when the request is not
   * shipped or the automation is gone.
   */
  shippedWorkflowName?: string;
}

/** What staff fill in. Status, reply and who asked are not theirs to set. */
export type AutomationRequestDraft = Pick<
  AutomationRequest,
  "title" | "problem" | "trigger" | "outcome" | "priority"
>;

/** The developer's answer that goes with a status change. */
export interface AutomationRequestReply {
  /** Replaces the reply; blank removes it; left out keeps the one there. */
  notes?: string;
  /** Required to ship, and only allowed then: a real `Workflow.id`. */
  shippedWorkflowId?: ID;
}

const STATUSES: readonly AutomationRequestStatus[] = [
  "requested",
  "in_review",
  "shipped",
  "declined",
];
const PRIORITIES: readonly AutomationRequestPriority[] = [
  "low",
  "normal",
  "high",
];

/** Each free-text field, with what to say when it is blank. */
const REQUIRED_TEXT = [
  ["title", "Title: Give the request a title."],
  ["problem", "Problem: Say what goes wrong today."],
  ["trigger", "Trigger: Say what should start it."],
  ["outcome", "Outcome: Say what should happen."],
] as const;

function invalid(message: string, field: string): never {
  throw new ApiError(message, 422, "INVALID_AUTOMATION_REQUEST", field);
}

const workflowName = (id: ID | undefined): string | undefined =>
  id === undefined
    ? undefined
    : Object.values(AUTOMATIONS).find((d) => d.id === id)?.name;

function toRow(request: AutomationRequest): AutomationRequestRow {
  const name = workflowName(request.shippedWorkflowId);
  return name ? { ...request, shippedWorkflowName: name } : request;
}

/** Every request, newest first unless `query.sort` says otherwise. */
export async function list(
  query: ListQuery = {},
): Promise<Page<AutomationRequestRow>> {
  return simulate(
    () => {
      const page = applyQuery(
        Object.values(db.getState().automationRequests),
        query,
        {
          searchFields: ["title", "problem", "trigger", "outcome"],
          defaultSort: [{ field: "createdAt", desc: true }],
        },
      );
      return { ...page, rows: page.rows.map(toRow) };
    },
    { canFail: false },
  );
}

export async function get(id: ID): Promise<AutomationRequestRow> {
  return simulate(
    () =>
      toRow(
        db.getState().automationRequests[id] ??
          notFound("Automation request", id),
      ),
    { canFail: false },
  );
}

/**
 * Files a request as the current user, at the demo clock's now, with status
 * "requested". Text is trimmed; a blank field or an unknown priority is a 422
 * naming the field. Anything in `draft` beyond its five fields is ignored.
 */
export async function create(
  draft: AutomationRequestDraft,
): Promise<AutomationRequest> {
  const request = await simulate(
    () => {
      const text = {} as Record<(typeof REQUIRED_TEXT)[number][0], string>;
      for (const [field, message] of REQUIRED_TEXT) {
        const value = draft[field];
        const trimmed = typeof value === "string" ? value.trim() : "";
        if (!trimmed) invalid(message, field);
        text[field] = trimmed;
      }
      if (!PRIORITIES.includes(draft.priority)) {
        invalid("Priority: Pick low, normal or high.", "priority");
      }

      const state = db.getState();
      const at = nowIso();
      const record: AutomationRequest = {
        id: newId("req"),
        ...text,
        priority: draft.priority,
        status: "requested",
        createdAt: at,
        updatedAt: at,
      };
      if (state.users[state.currentUserId]) {
        record.createdBy = state.currentUserId;
      }
      db.setState((s) => ({
        automationRequests: { ...s.automationRequests, [record.id]: record },
      }));
      return record;
    },
    { ms: 480 },
  );
  invalidate("automationRequests");
  return request;
}

/**
 * The developer's move. Shipping needs `reply.shippedWorkflowId`, a real
 * registry automation; any other status refuses one and drops the one a
 * shipped request had.
 */
export async function setStatus(
  id: ID,
  status: AutomationRequestStatus,
  reply: AutomationRequestReply = {},
): Promise<AutomationRequest> {
  const request = await simulate(
    () => {
      const prev =
        db.getState().automationRequests[id] ??
        notFound("Automation request", id);
      if (!STATUSES.includes(status)) {
        invalid("Status: Not a status a request can have.", "status");
      }
      const { shippedWorkflowId } = reply;
      if (status === "shipped") {
        if (!shippedWorkflowId) {
          invalid(
            "Shipped automation: Name the automation that shipped.",
            "shippedWorkflowId",
          );
        }
        if (workflowName(shippedWorkflowId) === undefined) {
          invalid(
            "Shipped automation: No automation has this id.",
            "shippedWorkflowId",
          );
        }
      } else if (shippedWorkflowId !== undefined) {
        invalid(
          "Shipped automation: Only a shipped request names an automation.",
          "shippedWorkflowId",
        );
      }

      const next: AutomationRequest = {
        ...prev,
        status,
        updatedAt: nowIso(),
      };
      if (status === "shipped") next.shippedWorkflowId = shippedWorkflowId;
      else delete next.shippedWorkflowId;
      if (reply.notes !== undefined) {
        const notes = reply.notes.trim();
        if (notes) next.notes = notes;
        else delete next.notes;
      }
      db.setState((s) => ({
        automationRequests: { ...s.automationRequests, [id]: next },
      }));
      return next;
    },
    { ms: 420 },
  );
  invalidate("automationRequests");
  return request;
}

export async function remove(id: ID): Promise<void> {
  await simulate(
    () => {
      if (!db.getState().automationRequests[id]) {
        notFound("Automation request", id);
      }
      db.setState((s) => {
        const automationRequests = { ...s.automationRequests };
        delete automationRequests[id];
        return { automationRequests };
      });
    },
    { ms: 420 },
  );
  invalidate("automationRequests");
}
