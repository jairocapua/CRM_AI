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
 * them with `create()` and may take back their own with `withdraw()` while
 * it is still "requested"; the developer answers with `setStatus()`, which
 * is also where a shipped request names the automation it became. Shaped
 * like `smart-lists.ts`: reads never fail, mutations take longer, may fail,
 * and invalidate "automationRequests".
 */

/** A request as listed: the stored record plus its automation's name. */
export interface AutomationRequestRow extends AutomationRequest {
  /**
   * The shipped automation's name, joined at read time from the registry by
   * `shippedWorkflowId` and never stored. Unset when the request is not
   * shipped or the automation is gone.
   */
  shippedWorkflowName?: string;
  /**
   * Whether the current user may withdraw it now: they asked for it and it
   * is still "requested". Worked out at read time by the same rule
   * `withdraw()` enforces, so the UI never repeats the rule.
   */
  canWithdraw: boolean;
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

/**
 * The statuses `setStatus()` may set: the developer's. "withdrawn" is not
 * one of them; only the asker withdraws, through `withdraw()`.
 */
const DEVELOPER_STATUSES: readonly AutomationRequestStatus[] = [
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

/**
 * Why `currentUserId` may not withdraw `request` now, or `undefined` when
 * they may. The one place the rule lives: `withdraw()` throws it and
 * `canWithdraw` on every row reads it. Not the asker (including a request
 * with no asker) is a 403; a request already withdrawn, or one the developer
 * has already moved on, is a 409, each with its own sentence.
 */
function withdrawRefusal(
  request: AutomationRequest,
  currentUserId: ID,
): ApiError | undefined {
  if (!request.createdBy || request.createdBy !== currentUserId) {
    return new ApiError(
      "Only the teammate who asked can withdraw this request.",
      403,
      "NOT_YOUR_REQUEST",
    );
  }
  if (request.status === "withdrawn") {
    return new ApiError(
      "This request is already withdrawn.",
      409,
      "REQUEST_NOT_WITHDRAWABLE",
    );
  }
  if (request.status !== "requested") {
    return new ApiError(
      "This request can no longer be withdrawn: your developer has already answered it.",
      409,
      "REQUEST_NOT_WITHDRAWABLE",
    );
  }
  return undefined;
}

function toRow(
  request: AutomationRequest,
  currentUserId: ID,
): AutomationRequestRow {
  const row: AutomationRequestRow = {
    ...request,
    canWithdraw: withdrawRefusal(request, currentUserId) === undefined,
  };
  const name = workflowName(request.shippedWorkflowId);
  if (name) row.shippedWorkflowName = name;
  return row;
}

/** Every request, newest first unless `query.sort` says otherwise. */
export async function list(
  query: ListQuery = {},
): Promise<Page<AutomationRequestRow>> {
  return simulate(
    () => {
      const { automationRequests, currentUserId } = db.getState();
      const page = applyQuery(Object.values(automationRequests), query, {
        searchFields: ["title", "problem", "trigger", "outcome"],
        defaultSort: [{ field: "createdAt", desc: true }],
      });
      return {
        ...page,
        rows: page.rows.map((row) => toRow(row, currentUserId)),
      };
    },
    { canFail: false },
  );
}

export async function get(id: ID): Promise<AutomationRequestRow> {
  return simulate(
    () => {
      const { automationRequests, currentUserId } = db.getState();
      return toRow(
        automationRequests[id] ?? notFound("Automation request", id),
        currentUserId,
      );
    },
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
 * shipped request had. "withdrawn" is refused with a 422: withdrawing is
 * the asker's move, through `withdraw()`. A request already withdrawn is
 * final: any move on it is a 409, writing nothing.
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
      if (prev.status === "withdrawn") {
        throw new ApiError(
          "This request was withdrawn by the teammate who asked.",
          409,
          "REQUEST_WITHDRAWN",
        );
      }
      if (status === "withdrawn") {
        invalid(
          "Status: Only the teammate who asked can withdraw a request.",
          "status",
        );
      }
      if (!DEVELOPER_STATUSES.includes(status)) {
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

/**
 * The asker takes their request back: it becomes "withdrawn" and stays
 * listed, so its history is kept. Only the current user's own request, and
 * only while it is "requested" (see `withdrawRefusal`: 403 / 409); 404 for
 * an unknown id. May fail, writing nothing.
 */
export async function withdraw(id: ID): Promise<AutomationRequest> {
  const request = await simulate(
    () => {
      const state = db.getState();
      const prev =
        state.automationRequests[id] ?? notFound("Automation request", id);
      const refusal = withdrawRefusal(prev, state.currentUserId);
      if (refusal) throw refusal;

      const next: AutomationRequest = {
        ...prev,
        status: "withdrawn",
        updatedAt: nowIso(),
      };
      db.setState((s) => ({
        automationRequests: { ...s.automationRequests, [id]: next },
      }));
      return next;
    },
    { ms: 450 },
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
