import type { ISODate, UserRole } from "@/types";
import type { TeamMemberStatus, UserReferenceCounts } from "@/lib/api";
import { formatRelative, pluralize } from "@/lib/format";

/**
 * The team page's words (`/settings/team`): role and status labels, the
 * last-seen line, and the remove dialog's summary of what moves. Pure, so
 * each is unit-tested.
 */

/** How each role reads on screen. */
export const ROLE_LABELS: Record<UserRole, string> = {
  agency_owner: "Agency owner",
  admin: "Admin",
  user: "User",
};

/** "Active" or "Pending" (invited, never signed in). */
export function memberStatusLabel(status: TeamMemberStatus): string {
  switch (status) {
    case "active":
      return "Active";
    case "pending":
      return "Pending";
    default: {
      const unknown: never = status;
      return unknown;
    }
  }
}

/**
 * When a teammate was last seen, from the demo clock (`now` is `apiNow()`):
 * "5 minutes ago", or "Never signed in" for someone with no `lastSeenAt`.
 */
export function lastSeenLabel(
  lastSeenAt: ISODate | undefined,
  now: Date,
): string {
  return lastSeenAt ? formatRelative(lastSeenAt, now) : "Never signed in";
}

/**
 * The last-seen line under a name on a phone, where there is no Last seen
 * column: "Last seen 5 minutes ago", or "Never signed in".
 */
export function lastSeenLine(
  lastSeenAt: ISODate | undefined,
  now: Date,
): string {
  return lastSeenAt
    ? `Last seen ${lastSeenLabel(lastSeenAt, now)}`
    : lastSeenLabel(lastSeenAt, now);
}

/** Each kind of record that moves, in the order the summary names them. */
const MOVED: readonly [
  Exclude<keyof UserReferenceCounts, "follows">,
  string,
  string?,
][] = [
  ["contacts", "contact"],
  ["opportunities", "deal"],
  ["tasks", "task"],
  ["conversations", "conversation"],
  ["appointments", "appointment"],
  ["calendars", "calendar seat"],
  ["smartLists", "private smart list"],
];

/** "A", "A and B", "A, B and C". */
function listItems(items: string[]): string {
  return items.length <= 1
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Whether a removal would hand anything over (follows are dropped, not moved). */
export function movesAnything(counts: UserReferenceCounts): boolean {
  return MOVED.some(([key]) => counts[key] > 0);
}

/**
 * What a removal hands to `targetName`, naming only the non-zero kinds:
 * "2 contacts and 1 deal move to Jordan Reyes.", or "Nothing to reassign."
 * when there is nothing. Follows are not in it: they are dropped
 * (`followsSentence`).
 */
export function removalSummary(
  counts: UserReferenceCounts,
  targetName: string,
): string {
  const parts = MOVED.filter(([key]) => counts[key] > 0).map(
    ([key, one, many]) => pluralize(counts[key], one, many),
  );
  if (parts.length === 0) return "Nothing to reassign.";
  const total = MOVED.reduce((sum, [key]) => sum + counts[key], 0);
  return `${listItems(parts)} ${total === 1 ? "moves" : "move"} to ${targetName}.`;
}

/**
 * The removal toast's description: "Their records now belong to Jordan
 * Reyes." when anything moved (`movesAnything`), otherwise none, so the
 * toast never claims a handover that did not happen.
 */
export function removedDescription(
  counts: UserReferenceCounts,
  targetName: string,
): string | undefined {
  return movesAnything(counts)
    ? `Their records now belong to ${targetName}.`
    : undefined;
}

/**
 * Follows are personal, so a removal drops them rather than moving them:
 * "Follows are dropped, not moved: Casey follows 2 contacts." (the count only
 * when there are some).
 */
export function followsSentence(follows: number, firstName: string): string {
  return follows > 0
    ? `Follows are dropped, not moved: ${firstName} follows ${pluralize(follows, "contact")}.`
    : "Follows are dropped, not moved.";
}

/**
 * The form field an API refusal is about, when it is one of `fields`;
 * otherwise `null`, and the form shows the sentence above its submit
 * button instead (`root.server`).
 */
export function serverErrorField<F extends string>(
  error: unknown,
  fields: readonly F[],
): F | null {
  const field =
    typeof error === "object" && error !== null && "field" in error
      ? (error as { field?: unknown }).field
      : undefined;
  return fields.find((f) => f === field) ?? null;
}
