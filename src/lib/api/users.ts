import { z } from "zod";

import type { ID, User } from "@/types";
import { db } from "@/lib/mock/db";
import type { DbState } from "@/lib/mock/db-state";
import { AUTOMATIONS } from "@/lib/automations";
import { referencedKeys } from "@/lib/automations/keys";
import {
  countUserReferences,
  reassignUserReferences,
  type UserReferenceCounts,
} from "@/lib/mock/cascade";
import { newId } from "@/lib/mock/ids";
import { profileSchema, type ProfileKey } from "@/lib/validation/profile";
import { inviteSchema, roleSchema } from "@/lib/validation/team";
import { invalidate } from "./cache";
import { ApiError, notFound, nowIso, simulate } from "./http";
import { parsePatch, withoutEmpty, withoutUndefined } from "./patch";

export type { UserReferenceCounts } from "@/lib/mock/cascade";

export async function list(): Promise<User[]> {
  return simulate(
    () =>
      Object.values(db.getState().users).sort((a, b) =>
        a.firstName.localeCompare(b.firstName),
      ),
    { canFail: false },
  );
}

/**
 * "pending": invited but never signed in (no `lastSeenAt`); "active":
 * signed in at least once.
 */
export type TeamMemberStatus = "active" | "pending";

/** A teammate as the team page lists them. */
export interface TeamMember extends User {
  /** Whether this is the current user. */
  isYou: boolean;
  /** Read-time, from `lastSeenAt`; never stored. */
  status: TeamMemberStatus;
}

/**
 * Everyone on the team, by first name, each marked `isYou` (the current
 * user) and with a read-time `status`. One read, so the team page has one
 * load error.
 */
export async function team(): Promise<TeamMember[]> {
  return simulate(
    () => {
      const { users, currentUserId } = db.getState();
      return Object.values(users)
        .sort((a, b) => a.firstName.localeCompare(b.firstName))
        .map((user): TeamMember => ({
          ...user,
          isYou: user.id === currentUserId,
          status: user.lastSeenAt ? "active" : "pending",
        }));
    },
    { canFail: false },
  );
}

export async function me(): Promise<User> {
  return simulate(
    () => {
      const { users, currentUserId } = db.getState();
      return users[currentUserId] ?? notFound("User", currentUserId);
    },
    { canFail: false },
  );
}

export async function get(id: ID): Promise<User> {
  return simulate(() => db.getState().users[id] ?? notFound("User", id), {
    canFail: false,
  });
}

/**
 * A new user's slug: their email's local part, lowercased to [a-z0-9], with a
 * number appended when another user already has it. Automation definitions
 * name users by slug, so it must be unique.
 */
function slugFor(email: string, users: User[]): string {
  const base =
    (email.split("@")[0] ?? "").toLowerCase().replace(/[^a-z0-9]/g, "") ||
    "user";
  const taken = new Set(users.map((u) => u.slug));
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}${n}`;
  return slug;
}

const fullName = (user: Pick<User, "firstName" | "lastName">) =>
  `${user.firstName} ${user.lastName}`;

/**
 * Throws 409 `EMAIL_TAKEN` (field `email`) when a user other than `exceptId`
 * already has `email`, compared without regard to case: one address, one
 * teammate.
 */
function refuseTakenEmail(
  email: string,
  users: Record<ID, User>,
  exceptId?: ID,
): void {
  const wanted = email.toLowerCase();
  const holder = Object.values(users).find(
    (u) => u.id !== exceptId && u.email.toLowerCase() === wanted,
  );
  if (holder) {
    throw new ApiError(
      `That email address already belongs to ${fullName(holder)}.`,
      409,
      "EMAIL_TAKEN",
      "email",
    );
  }
}

/** What `invite()` takes: the invite form's keys. */
export type InviteDraft = z.input<typeof inviteSchema>;

/**
 * Adds a teammate and returns them. Nothing is sent to them: the demo has
 * no email.
 *
 * The draft must pass the invite form's own rules (`inviteSchema`):
 * otherwise a 422 `INVALID_INVITE` with the form's sentence and the bad
 * `field`. An email another teammate already has (in any case) is a 409
 * `EMAIL_TAKEN` on `email`. Values are saved trimmed; an empty job title is
 * not stored, and keys outside the form are ignored. The new teammate gets
 * the active location's time zone and no `lastSeenAt`: they have never
 * signed in, so `team()` lists them as pending. Refusals write nothing.
 */
export async function invite(input: InviteDraft): Promise<User> {
  const user = await simulate(
    () => {
      const draft = parsePatch(
        inviteSchema,
        input,
        "INVALID_INVITE",
        "Those invite details are not valid.",
      );
      const state = db.getState();
      refuseTakenEmail(draft.email, state.users);
      const at = nowIso();
      const record: User = {
        id: newId("usr"),
        slug: slugFor(draft.email, Object.values(state.users)),
        firstName: draft.firstName,
        lastName: draft.lastName,
        email: draft.email,
        role: draft.role,
        ...(draft.jobTitle ? { jobTitle: draft.jobTitle } : {}),
        timezone:
          state.locations[state.locationId]?.timezone ?? "America/Los_Angeles",
        isActive: true,
        createdAt: at,
        updatedAt: at,
      };
      db.setState((s) => ({ users: { ...s.users, [record.id]: record } }));
      return record;
    },
    { ms: 420 },
  );
  invalidate("users");
  return user;
}

/** The profile keys `update()` checks: any of them may be sent alone. */
const profilePatchSchema = profileSchema.partial();
const rolePatchSchema = z.object({ role: roleSchema.optional() });

/** What `update()` saves: the profile keys and the role. */
export type UserPatch = Partial<Pick<User, ProfileKey | "role">>;

/**
 * Applies `patch` to a user and returns the saved record. An allow-list:
 * only the profile keys (first and last name, email, phone, job title, time
 * zone) and `role` are saved; anything else (`id`, `slug`, `createdAt`,
 * `isActive`, `lastSeenAt`, …) is ignored, as is an `undefined` value.
 *
 * Refusals write nothing, checked in this order:
 *
 * - 404 `NOT_FOUND` for an unknown user;
 * - 422 `INVALID_PROFILE` when a profile key breaks the profile form's own
 *   rules (`profileSchema`): `message` is the form's sentence for the first
 *   bad field ("Enter a first name.") and `field` is that key;
 * - 422 `INVALID_ROLE` (field `role`) for a role outside the three;
 * - 409 `CANNOT_CHANGE_OWN_ROLE` when the current user's own role would
 *   change (sending it unchanged is fine);
 * - 409 `EMAIL_TAKEN` (field `email`) for an email another user has.
 *
 * Values are saved trimmed, and an emptied phone or job title removes the
 * stored value.
 */
export async function update(id: ID, patch: UserPatch): Promise<User> {
  const user = await simulate(() => {
    const state = db.getState();
    const prev = state.users[id] ?? notFound("User", id);
    const profile = parsePatch(
      profilePatchSchema,
      patch,
      "INVALID_PROFILE",
      "Those profile details are not valid.",
    );
    const { role } = parsePatch(
      rolePatchSchema,
      { role: patch.role },
      "INVALID_ROLE",
      "That role is not valid.",
    );
    if (
      role !== undefined &&
      role !== prev.role &&
      id === state.currentUserId
    ) {
      throw new ApiError(
        "You can't change your own role.",
        409,
        "CANNOT_CHANGE_OWN_ROLE",
        "role",
      );
    }
    if (profile.email !== undefined) {
      refuseTakenEmail(profile.email, state.users, id);
    }
    const next: User = withoutEmpty(
      {
        ...prev,
        ...withoutUndefined(profile),
        ...(role === undefined ? {} : { role }),
        updatedAt: nowIso(),
      },
      ["phone", "jobTitle"],
    );
    db.setState((s) => ({ users: { ...s.users, [id]: next } }));
    return next;
  });
  invalidate("users");
  return user;
}

/** "A", "A and B", "A, B and C". */
function listNames(names: string[]): string {
  return names.length <= 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * Why `remove(user.id, { reassignTo })` would refuse now, or `undefined`
 * when it would go ahead. The one place the rules live: `remove()` throws
 * this, and `removalPreview()` reports its message, so the dialog never
 * repeats a rule. In order:
 *
 * - 409 `CANNOT_REMOVE_YOURSELF` for the current user;
 * - 400 `REASSIGN_TO_SELF` (field `reassignTo`) when `reassignTo` is the
 *   teammate being removed;
 * - 404 `REASSIGN_TARGET_NOT_FOUND` (field `reassignTo`) for an unknown
 *   `reassignTo`;
 * - 409 `NAMED_IN_AUTOMATION` while an automation names the teammate's slug:
 *   automations are code staff cannot edit, so a developer changes them
 *   first. The message names them.
 */
function removalRefusal(
  state: DbState,
  user: User,
  reassignTo: ID | undefined,
): ApiError | undefined {
  const name = fullName(user);
  if (user.id === state.currentUserId) {
    return new ApiError(
      "You can't remove yourself from the team.",
      409,
      "CANNOT_REMOVE_YOURSELF",
    );
  }
  const toId = reassignTo ?? state.currentUserId;
  if (toId === user.id) {
    return new ApiError(
      `Pick another teammate to take over ${name}'s records.`,
      400,
      "REASSIGN_TO_SELF",
      "reassignTo",
    );
  }
  if (!state.users[toId]) {
    return new ApiError(
      `The teammate picked to take over ${name}'s records is no longer on the team. Pick someone else.`,
      404,
      "REASSIGN_TARGET_NOT_FOUND",
      "reassignTo",
    );
  }
  const naming = Object.values(AUTOMATIONS)
    .filter((d) => referencedKeys(d).users.includes(user.slug))
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b));
  if (naming.length > 0) {
    return new ApiError(
      `${name} is named in the ${listNames(naming)} ${
        naming.length === 1 ? "automation" : "automations"
      }. Ask your developer to change ${
        naming.length === 1 ? "it" : "them"
      } before removing ${user.firstName}.`,
      409,
      "NAMED_IN_AUTOMATION",
    );
  }
  return undefined;
}

/** What removing a teammate would do, before anyone confirms. */
export interface RemovalPreview {
  /** What `remove()` would hand over (and the follows it would drop). */
  counts: UserReferenceCounts;
  /**
   * The sentence `remove()` would refuse with right now, or unset when it
   * would go ahead. Read-time, never stored.
   */
  refusal?: string;
}

/**
 * What `remove(id, options)` would do now: the counts of what it would
 * reassign (`countUserReferences`, the same tests the reassignment uses)
 * and, when it would refuse, its sentence (`removalRefusal`, the function
 * `remove()` throws from). 404 `NOT_FOUND` for an unknown teammate, as
 * `remove()`. A read: never fails on the Demo Data failure rate.
 */
export async function removalPreview(
  id: ID,
  options: { reassignTo?: ID } = {},
): Promise<RemovalPreview> {
  return simulate(
    () => {
      const state = db.getState();
      const user = state.users[id] ?? notFound("User", id);
      const preview: RemovalPreview = {
        counts: countUserReferences(state, id),
      };
      const refusal = removalRefusal(state, user, options.reassignTo);
      if (refusal) preview.refusal = refusal.message;
      return preview;
    },
    { canFail: false },
  );
}

/**
 * Removes a teammate and hands what they hold to `reassignTo` (by default the
 * current user): see `reassignUserReferences` for the list. Their follows
 * are dropped. History keeps its author id. Refusals write nothing: 404
 * `NOT_FOUND` for an unknown teammate, then each of `removalRefusal`'s.
 */
export async function remove(
  id: ID,
  options: { reassignTo?: ID } = {},
): Promise<void> {
  await simulate(() => {
    const state = db.getState();
    const user = state.users[id] ?? notFound("User", id);
    const refusal = removalRefusal(state, user, options.reassignTo);
    if (refusal) throw refusal;
    const toId = options.reassignTo ?? state.currentUserId;

    db.setState((s) => {
      const users = { ...s.users };
      delete users[id];
      return { users, ...reassignUserReferences(s, id, toId) };
    });
  });
  invalidate(
    "users",
    "contacts",
    "opportunities",
    "tasks",
    "conversations",
    "appointments",
    "calendars",
    "smartLists",
  );
}
