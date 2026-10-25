import type { ID, User } from "@/types";
import { db } from "@/lib/mock/db";
import { AUTOMATIONS } from "@/lib/automations";
import { referencedKeys } from "@/lib/automations/keys";
import { reassignUserReferences } from "@/lib/mock/cascade";
import { newId } from "@/lib/mock/ids";
import { profileSchema } from "@/lib/validation/profile";
import { invalidate } from "./cache";
import { ApiError, notFound, nowIso, simulate } from "./http";
import { parsePatch, withoutEmpty, withoutUndefined } from "./patch";

export async function list(): Promise<User[]> {
  return simulate(
    () =>
      Object.values(db.getState().users).sort((a, b) =>
        a.firstName.localeCompare(b.firstName),
      ),
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

export async function invite(
  input: Pick<User, "firstName" | "lastName" | "email" | "role"> &
    Partial<Pick<User, "jobTitle">>,
): Promise<User> {
  const user = await simulate(
    () => {
      const at = nowIso();
      const record: User = {
        id: newId("usr"),
        slug: slugFor(input.email, Object.values(db.getState().users)),
        timezone: "America/Los_Angeles",
        isActive: true,
        createdAt: at,
        updatedAt: at,
        ...input,
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

/**
 * Applies `patch` to a user and returns the saved record.
 *
 * The profile keys (first and last name, email, phone, job title, time
 * zone) must pass the profile form's own rules (`profileSchema`), so the
 * API is never looser than the form: otherwise the call is a 422
 * `INVALID_PROFILE` whose `message` is the form's sentence for the first bad
 * field ("Enter a first name.") and whose `field` is that key, and nothing
 * is saved. They are saved trimmed, and an emptied phone or job title
 * removes the stored value. Other keys pass through unchecked, as before
 * (P9-T03 narrows them); `id` is always the stored one.
 */
export async function update(id: ID, patch: Partial<User>): Promise<User> {
  const user = await simulate(() => {
    const prev = db.getState().users[id] ?? notFound("User", id);
    const profile = parsePatch(
      profilePatchSchema,
      patch,
      "INVALID_PROFILE",
      "Those profile details are not valid.",
    );
    const next: User = withoutEmpty(
      {
        ...prev,
        ...withoutUndefined(patch),
        ...withoutUndefined(profile),
        id,
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
 * Removes a teammate and hands what they hold to `reassignTo` (by default the
 * current user): see `reassignUserReferences` for the list. History keeps
 * its author. Refusals write nothing:
 *
 * - 404 `NOT_FOUND` for an unknown teammate;
 * - 409 `CANNOT_REMOVE_YOURSELF` for the current user;
 * - 400 `REASSIGN_TO_SELF` when `reassignTo` is the teammate being removed;
 * - 404 `REASSIGN_TARGET_NOT_FOUND` for an unknown `reassignTo`;
 * - 409 `NAMED_IN_AUTOMATION` while an automation names the teammate's slug:
 *   automations are code staff cannot edit, so a developer changes them
 *   first. The message names them.
 */
export async function remove(
  id: ID,
  options: { reassignTo?: ID } = {},
): Promise<void> {
  await simulate(() => {
    const state = db.getState();
    const user = state.users[id] ?? notFound("User", id);
    const name = `${user.firstName} ${user.lastName}`;
    if (id === state.currentUserId) {
      throw new ApiError(
        "You can't remove yourself from the team.",
        409,
        "CANNOT_REMOVE_YOURSELF",
      );
    }
    const toId = options.reassignTo ?? state.currentUserId;
    if (toId === id) {
      throw new ApiError(
        `Pick another teammate to take over ${name}'s records.`,
        400,
        "REASSIGN_TO_SELF",
        "reassignTo",
      );
    }
    if (!state.users[toId]) {
      throw new ApiError(
        `Teammate ${toId} was not found, so ${name}'s records have nobody to go to.`,
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
      throw new ApiError(
        `${name} is named in the ${listNames(naming)} ${
          naming.length === 1 ? "automation" : "automations"
        }. Ask your developer to change ${
          naming.length === 1 ? "it" : "them"
        } before removing ${user.firstName}.`,
        409,
        "NAMED_IN_AUTOMATION",
      );
    }

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
