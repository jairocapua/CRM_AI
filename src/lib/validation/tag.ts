import { z } from "zod";

import type { Tag, TagColor } from "@/types";
import { TAG_COLORS } from "@/lib/constants";
import { requiredText } from "./details";

/**
 * The tags manager (`/settings/tags`): the rules for a tag's name and
 * colour, shared by its dialog and by `api.tags.create` / `update`, so the
 * API is never looser than the form and both say the same sentence.
 */

export const TAG_NAME_MAX = 40;

/** The tag dialog: a name (trimmed, 1 to 40 characters) and a colour. */
export const tagSchema = z.object({
  name: requiredText("Enter a tag name.").max(
    TAG_NAME_MAX,
    `Keep the tag name to ${TAG_NAME_MAX} characters or fewer.`,
  ),
  color: z.enum(TAG_COLORS as [TagColor, ...TagColor[]], {
    error: "Choose a colour.",
  }),
});

export type TagFormValues = z.infer<typeof tagSchema>;

/**
 * A tag's slug, worked out from its name and from nothing else (as the
 * seed does): lowercased, each run of spaces a hyphen. "Hot Lead" ->
 * "hot-lead".
 */
export function tagSlug(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "-");
}

/** The tag dialog, as it opens to create one: slate. */
export const EMPTY_TAG: Readonly<TagFormValues> = { name: "", color: "slate" };

/** The tag dialog, as it opens to edit `tag`. */
export function tagFormValues(tag: Pick<Tag, "name" | "color">): TagFormValues {
  return { name: tag.name, color: tag.color };
}
