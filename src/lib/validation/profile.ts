import { z } from "zod";

import type { User } from "@/types";
import { optionalText, requiredEmail, requiredText, timeZone } from "./details";

/**
 * The profile form (`/settings/profile`): the current user's own details.
 * `api.users.update` checks the same rules on these keys, so the API is never
 * looser than the form. The role is not here: it is shown read-only, and
 * changed on the Team page (P9-T03).
 *
 * `phone` and `jobTitle` are optional: an empty string means "none", and the
 * API then removes the stored value.
 */
export const profileSchema = z.object({
  firstName: requiredText("Enter a first name."),
  lastName: requiredText("Enter a last name."),
  email: requiredEmail(),
  phone: optionalText(),
  jobTitle: optionalText(),
  timezone: timeZone(),
});

export type ProfileFormValues = z.infer<typeof profileSchema>;

/** The `User` keys the profile form edits, and the only ones it sends. */
export type ProfileKey = keyof ProfileFormValues;

/** The user's details as the form loads them: absent optional values read
 *  as empty. */
export function toProfileForm(user: User): ProfileFormValues {
  return {
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone ?? "",
    jobTitle: user.jobTitle ?? "",
    timezone: user.timezone,
  };
}

/**
 * Validated form values as the `users.update` patch: exactly the profile's
 * keys, never `id`, `slug` or `role`, whatever else the values carry.
 */
export function toProfilePatch(
  values: ProfileFormValues,
): Pick<User, ProfileKey> {
  return {
    firstName: values.firstName,
    lastName: values.lastName,
    email: values.email,
    phone: values.phone,
    jobTitle: values.jobTitle,
    timezone: values.timezone,
  };
}
