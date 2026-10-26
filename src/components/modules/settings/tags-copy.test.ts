import { describe, expect, it } from "vitest";

import type { Tag } from "@/types";
import type { TagWithCount } from "@/lib/api";
import { ApiError } from "@/lib/api";
import {
  recordsPhrase,
  tagErrorField,
  tagMergedDescription,
  tagMergeSentences,
  tagOptionLabel,
  tagRemovalSentence,
} from "./tags-copy";
import { shownTags, storedTag, type MergedCount } from "./tags-view";

describe("recordsPhrase", () => {
  it("names the contacts and deals there are", () => {
    expect(recordsPhrase(12, 3)).toBe("12 contacts and 3 deals");
    expect(recordsPhrase(1, 1)).toBe("1 contact and 1 deal");
    expect(recordsPhrase(1, 0)).toBe("1 contact");
    expect(recordsPhrase(0, 3)).toBe("3 deals");
    expect(recordsPhrase(0, 0)).toBe("");
  });
});

describe("tagRemovalSentence", () => {
  it("says who loses the tag, in the number they are", () => {
    expect(tagRemovalSentence(0, 0)).toBe(
      "No contacts or deals have this tag.",
    );
    expect(tagRemovalSentence(1, 0)).toBe("1 contact loses this tag.");
    expect(tagRemovalSentence(0, 1)).toBe("1 deal loses this tag.");
    expect(tagRemovalSentence(1, 1)).toBe(
      "1 contact and 1 deal lose this tag.",
    );
    expect(tagRemovalSentence(12, 3)).toBe(
      "12 contacts and 3 deals lose this tag.",
    );
    expect(tagRemovalSentence(1200, 0)).toBe("1,200 contacts lose this tag.");
  });
});

describe("tagMergeSentences", () => {
  it("says who gets the target, where the target ends up and that the source goes", () => {
    expect(
      tagMergeSentences(
        { contacts: 12, deals: 3, contactsAfter: 40 },
        "Warm",
        "Hot Lead",
      ),
    ).toEqual([
      "12 contacts and 3 deals tagged Warm get Hot Lead instead.",
      "Hot Lead ends up on 40 contacts.",
      "Warm is deleted.",
    ]);
    expect(
      tagMergeSentences(
        { contacts: 1, deals: 0, contactsAfter: 1 },
        "Warm",
        "Hot Lead",
      ),
    ).toEqual([
      "1 contact tagged Warm gets Hot Lead instead.",
      "Hot Lead ends up on 1 contact.",
      "Warm is deleted.",
    ]);
  });

  it("words the empty cases properly", () => {
    expect(
      tagMergeSentences(
        { contacts: 0, deals: 0, contactsAfter: 7 },
        "Warm",
        "VIP",
      ),
    ).toEqual([
      "No contacts or deals are tagged Warm.",
      "VIP ends up on 7 contacts.",
      "Warm is deleted.",
    ]);
    expect(
      tagMergeSentences(
        { contacts: 0, deals: 2, contactsAfter: 0 },
        "Warm",
        "VIP",
      ),
    ).toEqual(["2 deals tagged Warm get VIP instead.", "Warm is deleted."]);
    // No target yet: no count after.
    expect(tagMergeSentences({ contacts: 2, deals: 0 }, "Warm", "VIP")).toEqual(
      ["2 contacts tagged Warm get VIP instead.", "Warm is deleted."],
    );
  });
});

describe("the tags page's other words", () => {
  it("describes a merge in its toast", () => {
    expect(tagMergedDescription("Warm", "Hot Lead")).toBe(
      "Every contact and deal tagged Warm now has Hot Lead.",
    );
  });

  it("lists a tag with its contact count", () => {
    expect(tagOptionLabel({ name: "VIP", contactCount: 1 })).toBe(
      "VIP (1 contact)",
    );
    expect(tagOptionLabel({ name: "VIP", contactCount: 0 })).toBe(
      "VIP (0 contacts)",
    );
  });

  it("marks a refusal on the field it names, else none", () => {
    expect(
      tagErrorField(new ApiError("Taken.", 409, "NAME_TAKEN", "name")),
    ).toBe("name");
    expect(
      tagErrorField(new ApiError("Pick one.", 422, "INVALID_TAG", "color")),
    ).toBe("color");
    expect(
      tagErrorField(new ApiError("Named.", 409, "NAMED_IN_AUTOMATION")),
    ).toBeNull();
    expect(tagErrorField(new Error("x"))).toBeNull();
  });
});

const T0 = "2026-10-01T00:00:00.000Z";
const T1 = "2026-10-02T00:00:00.000Z";
const T2 = "2026-10-03T00:00:00.000Z";

const row = (
  id: string,
  name: string,
  contactCount: number,
  updatedAt = T0,
  extra: Partial<TagWithCount> = {},
): TagWithCount => ({
  id,
  name,
  slug: name.toLowerCase(),
  color: "slate",
  createdAt: T0,
  updatedAt,
  contactCount,
  ...extra,
});
const tag = (id: string, name: string, updatedAt: string): Tag =>
  storedTag(row(id, name, 0, updatedAt));
const none = new Map<string, Tag>();
const noCounts = new Map<string, MergedCount>();

describe("shownTags", () => {
  it("sorts by name and shows nothing before the first read", () => {
    expect(shownTags(undefined, none, new Set(), noCounts)).toEqual([]);
    const listed = [row("b", "Warm", 2), row("a", "Cold", 1)];
    expect(
      shownTags(listed, none, new Set(), noCounts).map((t) => t.name),
    ).toEqual(["Cold", "Warm"]);
  });

  it("shows the saved copy while it is newer, keeping the listed count and refusal", () => {
    const listed = [row("a", "Cold", 4, T0, { renameRefusal: "No." })];
    const saved = new Map([["a", tag("a", "Frozen", T1)]]);
    expect(shownTags(listed, saved, new Set(), noCounts)).toEqual([
      { ...row("a", "Frozen", 4, T1, { renameRefusal: "No." }) },
    ]);
    // The list catches up (or overtakes): the listed copy shows.
    const caughtUp = [row("a", "Icy", 4, T1)];
    expect(
      shownTags(caughtUp, saved, new Set(), noCounts).map((t) => t.name),
    ).toEqual(["Icy"]);
  });

  it("adds a tag created since the read, and hides removed ones at once", () => {
    const listed = [row("a", "Cold", 1), row("b", "Warm", 2)];
    const saved = new Map([["n", tag("n", "Podcast", T1)]]);
    const shown = shownTags(listed, saved, new Set(["b"]), noCounts);
    expect(shown.map((t) => [t.name, t.contactCount])).toEqual([
      ["Cold", 1],
      ["Podcast", 0],
    ]);
    expect(
      shownTags(listed, saved, new Set(["n"]), noCounts).map((t) => t.name),
    ).toEqual(["Cold", "Warm"]);
  });

  it("shows a merge target's count from the merge until the list is as new", () => {
    const listed = [row("b", "Warm", 2, T0)];
    const counts = new Map([["b", { contactCount: 9, asOf: T1 }]]);
    const saved = new Map([["b", tag("b", "Warm", T1)]]);
    expect(shownTags(listed, saved, new Set(), counts)[0]!.contactCount).toBe(
      9,
    );
    // Recoloured since, the list still old: the merge's count stands.
    const later = new Map([["b", tag("b", "Warm", T2)]]);
    expect(shownTags(listed, later, new Set(), counts)[0]!.contactCount).toBe(
      9,
    );
    // The list read after the merge has the count from then on.
    expect(
      shownTags([row("b", "Warm", 11, T1)], saved, new Set(), counts)[0]!
        .contactCount,
    ).toBe(11);
  });
});
