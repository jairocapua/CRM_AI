import type { TagMergePreview, TagWithCount } from "@/lib/api";
import { pluralize } from "@/lib/format";
import { serverErrorField } from "./team-copy";

/**
 * The tags page's words (`/settings/tags`). Pure, so each is unit-tested.
 * Every sentence claims only what `api.tags` does: a removal takes the tag
 * off contacts and deals (`cascadeTagDelete`), a merge moves both to the
 * target and deletes the source (`cascadeTagMerge`).
 */

/** "12 contacts and 3 deals", "1 contact", "3 deals"; "" for none. */
export function recordsPhrase(contacts: number, deals: number): string {
  return [
    contacts > 0 ? pluralize(contacts, "contact") : null,
    deals > 0 ? pluralize(deals, "deal") : null,
  ]
    .filter(Boolean)
    .join(" and ");
}

/**
 * What removing a tag does, from `removalPreview`: "12 contacts and 3 deals
 * lose this tag.", "1 contact loses this tag.", or "No contacts or deals
 * have this tag."
 */
export function tagRemovalSentence(contacts: number, deals: number): string {
  if (contacts + deals === 0) return "No contacts or deals have this tag.";
  return `${recordsPhrase(contacts, deals)} ${contacts + deals === 1 ? "loses" : "lose"} this tag.`;
}

/**
 * What merging `source` into `target` does, from `mergePreview`, one
 * sentence each: who carries the target instead ("12 contacts and 3 deals
 * tagged Warm get Hot Lead instead." / "No contacts or deals are tagged
 * Warm."), how many contacts the target ends up on ("Hot Lead ends up on 40
 * contacts."; left out when none), and "Warm is deleted."
 */
export function tagMergeSentences(
  preview: Pick<TagMergePreview, "contacts" | "deals" | "contactsAfter">,
  source: string,
  target: string,
): string[] {
  const { contacts, deals, contactsAfter } = preview;
  const moved =
    contacts + deals === 0
      ? `No contacts or deals are tagged ${source}.`
      : `${recordsPhrase(contacts, deals)} tagged ${source} ${
          contacts + deals === 1 ? "gets" : "get"
        } ${target} instead.`;
  const after =
    contactsAfter !== undefined && contactsAfter > 0
      ? `${target} ends up on ${pluralize(contactsAfter, "contact")}.`
      : null;
  return [moved, after, `${source} is deleted.`].filter(
    (s): s is string => s !== null,
  );
}

/**
 * The toast after a merge: every contact and deal tagged `source` now has
 * `target`. Only those: saved smart-list filters naming `source` do not move.
 */
export function tagMergedDescription(source: string, target: string): string {
  return `Every contact and deal tagged ${source} now has ${target}.`;
}

/** A tag as the merge dialog's picker lists it: "Warm (12 contacts)". */
export function tagOptionLabel(
  tag: Pick<TagWithCount, "name" | "contactCount">,
): string {
  return `${tag.name} (${pluralize(tag.contactCount, "contact")})`;
}

/** The tag dialog's inputs an API refusal can be about. */
const TAG_FIELDS = ["name", "color"] as const;

/** The tag dialog's input a refusal is about, or null (root error). */
export function tagErrorField(
  error: unknown,
): (typeof TAG_FIELDS)[number] | null {
  return serverErrorField(error, TAG_FIELDS);
}
