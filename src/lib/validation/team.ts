import { z } from "zod";

import type { User, UserRole } from "@/types";
import { optionalText, requiredEmail, requiredText } from "./details";

/**
 * The team page (`/settings/team`): inviting a teammate and changing a
 * teammate's role. `api.users.invite` checks `inviteSchema` itself, and
 * `api.users.update` checks `roleSchema`, so the API is never looser than
 * the form.
 */

/** Every role, in the order the role pickers list them. */
export const USER_ROLES = ["agency_owner", "admin", "user"] as const;

// A role added to `UserRole` but not to the list fails here, at compile time.
type MissingRole = Exclude<UserRole, (typeof USER_ROLES)[number]>;
const everyRoleListed: MissingRole extends never ? true : never = true;
void everyRoleListed;

/** One of the three roles; anything else is "Choose a role from the list.". */
export const roleSchema = z.enum(USER_ROLES, {
  error: "Choose a role from the list.",
});

/**
 * The invite form. `jobTitle` is optional: empty (or absent, for an API
 * caller) means none, and nothing is stored.
 */
export const inviteSchema = z.object({
  firstName: requiredText("Enter a first name."),
  lastName: requiredText("Enter a last name."),
  email: requiredEmail(),
  role: roleSchema,
  jobTitle: optionalText().optional(),
});

export type InviteFormValues = z.infer<typeof inviteSchema>;

/** The keys the invite form edits, and the only ones it sends. */
export type InviteKey = keyof InviteFormValues;

/** The invite form, as it opens: everything empty, role "User". */
export const EMPTY_INVITE: Readonly<Required<InviteFormValues>> = {
  firstName: "",
  lastName: "",
  email: "",
  role: "user",
  jobTitle: "",
};

/** Validated invite values as the `users.invite` draft: exactly its keys. */
export function toInviteDraft(
  values: InviteFormValues,
): Pick<User, "firstName" | "lastName" | "email" | "role"> &
  Partial<Pick<User, "jobTitle">> {
  return {
    firstName: values.firstName,
    lastName: values.lastName,
    email: values.email,
    role: values.role,
    jobTitle: values.jobTitle,
  };
}
