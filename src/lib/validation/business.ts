import { z } from "zod";

import type { Location } from "@/types";
import {
  optionalEmail,
  optionalText,
  optionalWebsite,
  requiredText,
  timeZone,
} from "./details";

/**
 * The business form (`/settings/business`): the active location's details.
 * `api.settings.updateLocation` saves only these keys and checks the same
 * rules on them, so the API is never looser than the form.
 *
 * Out of the form: the currency (shown read-only, since changing it would
 * change what every stored amount means), the address and the logo.
 *
 * `email`, `phone`, `website` and `industry` are optional: an empty string
 * means "none", and the API then removes the stored value.
 */
export const businessSchema = z.object({
  name: requiredText("Enter the business name."),
  email: optionalEmail(),
  phone: optionalText(),
  website: optionalWebsite(),
  industry: optionalText(),
  timezone: timeZone(),
});

export type BusinessFormValues = z.infer<typeof businessSchema>;

/** The `Location` keys the business form edits, and the only ones saved. */
export type BusinessKey = keyof BusinessFormValues;

/** The location as the form loads it: absent optional values read as
 *  empty. */
export function toBusinessForm(location: Location): BusinessFormValues {
  return {
    name: location.name,
    email: location.email ?? "",
    phone: location.phone ?? "",
    website: location.website ?? "",
    industry: location.industry ?? "",
    timezone: location.timezone,
  };
}

/** Validated form values as the `settings.updateLocation` patch: exactly the
 *  business keys, whatever else the values carry. */
export function toBusinessPatch(
  values: BusinessFormValues,
): Pick<Location, BusinessKey> {
  return {
    name: values.name,
    email: values.email,
    phone: values.phone,
    website: values.website,
    industry: values.industry,
    timezone: values.timezone,
  };
}
