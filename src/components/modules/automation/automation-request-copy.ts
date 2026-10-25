import type {
  AutomationRequestPriority,
  AutomationRequestStatus,
  ID,
} from "@/types";
import { fullName } from "@/lib/format";

/**
 * Words for the automation requests page (`/automation/requests`). Status is
 * read-only copy: the developer moves a request, staff only see where it is.
 */

/** A request's status as a label. Exhaustive: a new status needs words. */
export function requestStatusLabel(status: AutomationRequestStatus): string {
  switch (status) {
    case "requested":
      return "Requested";
    case "in_review":
      return "In review";
    case "shipped":
      return "Shipped";
    case "declined":
      return "Declined";
    default: {
      const unknown: never = status;
      throw new Error(`No label for request status "${String(unknown)}"`);
    }
  }
}

export const PRIORITY_LABELS: Record<AutomationRequestPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
};

/** The form's priority choices, lowest first. */
export const PRIORITIES = Object.keys(PRIORITY_LABELS) as [
  AutomationRequestPriority,
  ...AutomationRequestPriority[],
];

/**
 * Who asked, by name. Never an id: a request with no `createdBy`, or one
 * whose user is gone or not loaded, reads "Unknown teammate".
 */
export function askerName(
  createdBy: ID | undefined,
  usersById: ReadonlyMap<ID, { firstName: string; lastName: string }>,
): string {
  const user = createdBy === undefined ? undefined : usersById.get(createdBy);
  return user ? fullName(user) : "Unknown teammate";
}
