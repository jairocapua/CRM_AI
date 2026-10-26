import { describe, expect, it } from "vitest";

import type { Contact, ID, Opportunity, Tag } from "@/types";
import { TAG_COLORS } from "@/lib/constants";
import { seededWorld, setDemoNow, settle } from "@/lib/mock/testing";
import { TAG_NAME_MAX, tagSchema, tagSlug } from "@/lib/validation/tag";

/**
 * The tags manager's API (P9-T06): creating, renaming, recolouring,
 * removing and merging tags, the previews the dialogs read first, and the
 * rule that a tag an automation names keeps its name. Each test starts from
 * a fresh seed. Seeded tags are found by name (constants in
 * src/lib/mock/seed/core.ts); five are named by automations.
 */

/** The seeded tags an automation names, and the automation naming each. */
const NAMED_TAGS: [string, string][] = [
  ["Churn Risk", "Churn Risk Alert"],
  ["Demo Booked", "Appointment Reminders"],
  ["Needs Follow Up", "No-Show Recovery"],
  ["Newsletter", "New Lead Nurture"],
  ["Proposal Sent", "Proposal Follow-Up"],
];
const NAMED = new Set(NAMED_TAGS.map(([name]) => name));

async function world() {
  const { db } = await seededWorld();
  const tags = await import("./tags");
  const settings = await import("./settings");
  const http = await import("./http");
  const cache = await import("./cache");

  const byName = (name: string): Tag =>
    Object.values(db.getState().tags).find((t) => t.name === name)!;
  const contacts = (): Contact[] => Object.values(db.getState().contacts);
  const deals = (): Opportunity[] => Object.values(db.getState().opportunities);
  const taggedContacts = (id: ID) =>
    contacts().filter((c) => c.tagIds.includes(id));
  const taggedDeals = (id: ID) => deals().filter((o) => o.tagIds.includes(id));
  const report = () => settle(settings.integrityReport());
  /** Unnamed seeded tags, by name, with contacts and deals. */
  const plainTags = () =>
    Object.values(db.getState().tags)
      .filter((t) => !NAMED.has(t.name))
      .sort((a, b) => a.name.localeCompare(b.name));

  return {
    db,
    tags,
    http,
    cache,
    byName,
    contacts,
    deals,
    taggedContacts,
    taggedDeals,
    report,
    plainTags,
  };
}

type World = Awaited<ReturnType<typeof world>>;

/** An unnamed seeded tag on at least one contact and one deal. */
function tagWithRecords(w: World, skip: ID[] = []): Tag {
  const tag = w
    .plainTags()
    .find(
      (t) =>
        !skip.includes(t.id) &&
        w.taggedContacts(t.id).length > 0 &&
        w.taggedDeals(t.id).length > 0,
    );
  expect(tag, "an unnamed tag with contacts and deals").toBeDefined();
  return tag!;
}

/**
 * Two unnamed seeded tags A and B where A has contacts and deals and shares
 * at least one contact with B, so a merge both moves and de-duplicates.
 */
function mergePair(w: World): { a: Tag; b: Tag } {
  for (const a of w.plainTags()) {
    if (w.taggedDeals(a.id).length === 0) continue;
    for (const b of w.plainTags()) {
      if (b.id === a.id) continue;
      const shared = w
        .taggedContacts(a.id)
        .filter((c) => c.tagIds.includes(b.id));
      const onlyA = w
        .taggedContacts(a.id)
        .filter((c) => !c.tagIds.includes(b.id));
      if (shared.length > 0 && onlyA.length > 0) return { a, b };
    }
  }
  throw new Error("no seeded pair to merge");
}

/** Runs `call` with every mutation failing and checks nothing was written. */
async function failsWithoutWriting(w: World, call: () => Promise<unknown>) {
  const before = w.db.getState();
  w.http.setTuning({ failureRate: 1 });
  await expect(settle(call())).rejects.toMatchObject({
    status: 503,
    code: "MOCK_FAILURE",
  });
  w.http.setTuning({ failureRate: 0 });
  expect(w.db.getState()).toBe(before);
}

/** Expects `call` to be refused with `match`, writing nothing. */
async function refused(
  w: World,
  call: () => Promise<unknown>,
  match: Record<string, unknown>,
): Promise<Error> {
  const before = w.db.getState();
  const error = await settle(call()).catch((e: unknown) => e);
  expect(error).toMatchObject(match);
  expect((error as Error).message).toMatch(/^[A-Z0-9].*\.$/);
  expect(w.db.getState()).toBe(before);
  return error as Error;
}

const namedSentence = (tag: string, automation: string, doing: string) =>
  `${tag} is named in the ${automation} automation. Ask your developer to change it before ${doing}.`;

describe("tagSchema", () => {
  it("trims the name and keeps a colour from the palette", () => {
    expect(tagSchema.parse({ name: "  Hot Lead  ", color: "teal" })).toEqual({
      name: "Hot Lead",
      color: "teal",
    });
    for (const color of TAG_COLORS) {
      expect(tagSchema.safeParse({ name: "X", color }).success).toBe(true);
    }
  });

  it("says what is wrong in the form's own sentences", () => {
    const issue = (value: unknown) =>
      tagSchema.safeParse(value).error?.issues[0];
    expect(issue({ name: "   ", color: "teal" })).toMatchObject({
      path: ["name"],
      message: "Enter a tag name.",
    });
    expect(
      issue({ name: "x".repeat(TAG_NAME_MAX + 1), color: "teal" }),
    ).toMatchObject({
      path: ["name"],
      message: "Keep the tag name to 40 characters or fewer.",
    });
    expect(
      tagSchema.safeParse({ name: "x".repeat(TAG_NAME_MAX), color: "teal" })
        .success,
    ).toBe(true);
    expect(issue({ name: "VIP", color: "chartreuse" })).toMatchObject({
      path: ["color"],
      message: "Choose a colour.",
    });
  });
});

describe("tagSlug", () => {
  it("comes from the name alone, as the seed's", () => {
    expect(tagSlug("Hot Lead")).toBe("hot-lead");
    expect(tagSlug("  Needs   Follow Up ")).toBe("needs-follow-up");
    expect(tagSlug("VIP")).toBe("vip");
  });
});

describe("tags.list()", () => {
  it("lists every tag by name with its contact count, and why a named tag keeps its name", async () => {
    const w = await world();
    const listed = await settle(w.tags.list());
    const names = listed.map((t) => t.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(listed).toHaveLength(Object.keys(w.db.getState().tags).length);
    for (const row of listed) {
      expect(row.contactCount).toBe(w.taggedContacts(row.id).length);
    }
    expect(listed.some((t) => t.contactCount > 0)).toBe(true);

    for (const [tag, automation] of NAMED_TAGS) {
      expect(listed.find((t) => t.name === tag)!.renameRefusal).toBe(
        namedSentence(tag, automation, `renaming ${tag}`),
      );
    }
    expect(
      listed.filter((t) => t.renameRefusal !== undefined).map((t) => t.name),
    ).toEqual(NAMED_TAGS.map(([tag]) => tag));
  });
});

describe("tags.create()", () => {
  it("saves the trimmed name and the colour only, with a slug from the name", async () => {
    const w = await world();
    const revision = w.cache.revisionOf("tags");
    const draft = {
      name: "  Trade Show 2027  ",
      color: "teal",
      // Keys the dialog never sends; the API ignores them.
      id: "tag_mine",
      slug: "made-up",
      createdAt: "2000-01-01T00:00:00.000Z",
      extra: true,
    } as unknown as { name: string; color: "teal" };

    const tag = await settle(w.tags.create(draft));

    expect(tag).toMatchObject({
      name: "Trade Show 2027",
      slug: "trade-show-2027",
      color: "teal",
    });
    expect(tag.id).not.toBe("tag_mine");
    expect(tag.createdAt).not.toBe("2000-01-01T00:00:00.000Z");
    expect(tag.updatedAt).toBe(tag.createdAt);
    expect(Object.keys(tag).sort()).toEqual(
      ["color", "createdAt", "id", "name", "slug", "updatedAt"].sort(),
    );
    expect(w.db.getState().tags[tag.id]).toEqual(tag);
    expect(w.cache.revisionOf("tags")).toBeGreaterThan(revision);
  });

  it("still takes the tag picker's call: a name and a colour", async () => {
    const w = await world();
    const tag = await settle(w.tags.create({ name: "Podcast", color: "pink" }));
    const listed = await settle(w.tags.list());
    expect(listed.find((t) => t.id === tag.id)).toMatchObject({
      name: "Podcast",
      color: "pink",
      contactCount: 0,
    });
  });

  it("refuses an empty name, a long name or an unknown colour on its field", async () => {
    const w = await world();
    await refused(w, () => w.tags.create({ name: "  ", color: "teal" }), {
      status: 422,
      code: "INVALID_TAG",
      field: "name",
      message: "Enter a tag name.",
    });
    await refused(
      w,
      () => w.tags.create({ name: "x".repeat(41), color: "teal" }),
      { status: 422, code: "INVALID_TAG", field: "name" },
    );
    await refused(
      w,
      () =>
        w.tags.create({
          name: "Podcast",
          color: "chartreuse" as unknown as "teal",
        }),
      {
        status: 422,
        code: "INVALID_TAG",
        field: "color",
        message: "Choose a colour.",
      },
    );
  });

  it("refuses another tag's name in any letter case, naming it", async () => {
    const w = await world();
    await refused(
      w,
      () => w.tags.create({ name: " hot LEAD ", color: "teal" }),
      {
        status: 409,
        code: "NAME_TAKEN",
        field: "name",
        message: "A tag named Hot Lead already exists.",
      },
    );
  });

  it("writes nothing when the simulated write fails", async () => {
    const w = await world();
    await failsWithoutWriting(w, () =>
      w.tags.create({ name: "Podcast", color: "pink" }),
    );
  });
});

describe("tags.update()", () => {
  it("renames and recolours, the slug following the name; other keys are ignored", async () => {
    const w = await world();
    const cold = w.byName("Cold");
    setDemoNow(new Date(Date.parse(cold.updatedAt) + 60_000).toISOString());
    const revision = w.cache.revisionOf("tags");
    const patch = {
      name: "  Frozen Lead ",
      color: "sky",
      id: "tag_other",
      slug: "made-up",
      createdAt: "2000-01-01T00:00:00.000Z",
      updatedAt: "2000-01-01T00:00:00.000Z",
      extra: 1,
    } as unknown as { name: string; color: "sky" };

    const saved = await settle(w.tags.update(cold.id, patch));

    expect(saved).toEqual({
      ...cold,
      name: "Frozen Lead",
      slug: "frozen-lead",
      color: "sky",
      updatedAt: saved.updatedAt,
    });
    expect(saved.updatedAt > cold.updatedAt).toBe(true);
    expect(w.db.getState().tags[cold.id]).toEqual(saved);
    expect(w.db.getState().tags["tag_other"]).toBeUndefined();
    expect(w.cache.revisionOf("tags")).toBeGreaterThan(revision);
  });

  it("keeps what the patch leaves out", async () => {
    const w = await world();
    const vip = w.byName("VIP");
    const recoloured = await settle(w.tags.update(vip.id, { color: "amber" }));
    expect(recoloured).toMatchObject({ name: "VIP", slug: "vip" });
    const renamed = await settle(w.tags.update(vip.id, { name: "VIPs" }));
    expect(renamed).toMatchObject({
      name: "VIPs",
      slug: "vips",
      color: "amber",
    });
  });

  it("lets a tag change the letter case of its own name", async () => {
    const w = await world();
    const vip = w.byName("VIP");
    const saved = await settle(w.tags.update(vip.id, { name: "vip" }));
    expect(saved.name).toBe("vip");
  });

  it("refuses an unknown tag, then a bad value, each writing nothing", async () => {
    const w = await world();
    await refused(w, () => w.tags.update("tag_nope", { name: "X" }), {
      status: 404,
      code: "NOT_FOUND",
    });
    // A bad value comes before the automation rule, even on a named tag.
    await refused(
      w,
      () => w.tags.update(w.byName("Demo Booked").id, { name: " " }),
      { status: 422, code: "INVALID_TAG", field: "name" },
    );
  });

  it.each(NAMED_TAGS)(
    "refuses to rename %s, which the %s automation names, in any way",
    async (tag, automation) => {
      const w = await world();
      const id = w.byName(tag).id;
      const message = namedSentence(tag, automation, `renaming ${tag}`);
      await refused(w, () => w.tags.update(id, { name: `${tag} 2` }), {
        status: 409,
        code: "NAMED_IN_AUTOMATION",
        message,
      });
      // Automations match the name exactly, so a letter case change counts.
      await refused(w, () => w.tags.update(id, { name: tag.toLowerCase() }), {
        code: "NAMED_IN_AUTOMATION",
      });
      // Before NAME_TAKEN: the name cannot change at all.
      await refused(w, () => w.tags.update(id, { name: "Cold" }), {
        code: "NAMED_IN_AUTOMATION",
      });
    },
  );

  it("recolours a tag an automation names, its name sent unchanged or not at all", async () => {
    const w = await world();
    const demo = w.byName("Demo Booked");
    const first = await settle(w.tags.update(demo.id, { color: "green" }));
    expect(first).toMatchObject({ name: "Demo Booked", color: "green" });
    const second = await settle(
      w.tags.update(demo.id, { name: " Demo Booked ", color: "pink" }),
    );
    expect(second).toMatchObject({ name: "Demo Booked", color: "pink" });
    expect(await w.report()).toEqual([]);
  });

  it("refuses another tag's name in any letter case", async () => {
    const w = await world();
    await refused(
      w,
      () => w.tags.update(w.byName("VIP").id, { name: "cold" }),
      {
        status: 409,
        code: "NAME_TAKEN",
        field: "name",
        message: "A tag named Cold already exists.",
      },
    );
  });

  it("writes nothing when the simulated write fails", async () => {
    const w = await world();
    await failsWithoutWriting(w, () =>
      w.tags.update(w.byName("VIP").id, { name: "VIPs" }),
    );
  });
});

describe("tags.remove()", () => {
  it("takes the tag off every contact and deal, and the preview counted exactly those", async () => {
    const w = await world();
    const tag = tagWithRecords(w);
    const contactsBefore = w.contacts();
    const dealsBefore = w.deals();
    const taggedContactIds = w.taggedContacts(tag.id).map((c) => c.id);
    const taggedDealIds = w.taggedDeals(tag.id).map((o) => o.id);
    // Not vacuous: the tag is really on contacts and deals.
    expect(taggedContactIds.length).toBeGreaterThan(0);
    expect(taggedDealIds.length).toBeGreaterThan(0);

    const preview = await settle(w.tags.removalPreview(tag.id));
    expect(preview).toEqual({
      contacts: taggedContactIds.length,
      deals: taggedDealIds.length,
    });

    const revisions = {
      tags: w.cache.revisionOf("tags"),
      contacts: w.cache.revisionOf("contacts"),
      opportunities: w.cache.revisionOf("opportunities"),
    };
    await settle(w.tags.remove(tag.id));

    expect(w.db.getState().tags[tag.id]).toBeUndefined();
    expect(w.taggedContacts(tag.id)).toEqual([]);
    expect(w.taggedDeals(tag.id)).toEqual([]);
    // Every other tag stays where it was; timestamps are kept.
    const changedContacts = contactsBefore.filter((before) => {
      const after = w.db.getState().contacts[before.id]!;
      expect(after.tagIds).toEqual(before.tagIds.filter((t) => t !== tag.id));
      expect(after.updatedAt).toBe(before.updatedAt);
      return after !== before;
    });
    const changedDeals = dealsBefore.filter((before) => {
      const after = w.db.getState().opportunities[before.id]!;
      expect(after.tagIds).toEqual(before.tagIds.filter((t) => t !== tag.id));
      expect(after.updatedAt).toBe(before.updatedAt);
      return after !== before;
    });
    // The preview's counts are what the removal changed.
    expect(changedContacts.map((c) => c.id).sort()).toEqual(
      [...taggedContactIds].sort(),
    );
    expect(changedDeals.map((o) => o.id).sort()).toEqual(
      [...taggedDealIds].sort(),
    );
    expect(w.contacts()).toHaveLength(contactsBefore.length);
    expect(w.deals()).toHaveLength(dealsBefore.length);

    expect(w.cache.revisionOf("tags")).toBeGreaterThan(revisions.tags);
    expect(w.cache.revisionOf("contacts")).toBeGreaterThan(revisions.contacts);
    expect(w.cache.revisionOf("opportunities")).toBeGreaterThan(
      revisions.opportunities,
    );
    expect(await w.report()).toEqual([]);
  });

  it("refuses an unknown tag, in the preview too", async () => {
    const w = await world();
    await refused(w, () => w.tags.remove("tag_nope"), {
      status: 404,
      code: "NOT_FOUND",
    });
    await expect(
      settle(w.tags.removalPreview("tag_nope")),
    ).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
  });

  it.each(NAMED_TAGS)(
    "refuses to remove %s, which the %s automation names, and the preview says so",
    async (tag, automation) => {
      const w = await world();
      const id = w.byName(tag).id;
      const message = namedSentence(tag, automation, `removing ${tag}`);
      await refused(w, () => w.tags.remove(id), {
        status: 409,
        code: "NAMED_IN_AUTOMATION",
        message,
      });
      const preview = await settle(w.tags.removalPreview(id));
      expect(preview.refusal).toBe(message);
      expect(preview.contacts).toBe(w.taggedContacts(id).length);
      expect(await w.report()).toEqual([]);
    },
  );

  it("writes nothing when the simulated write fails", async () => {
    const w = await world();
    await failsWithoutWriting(w, () => w.tags.remove(tagWithRecords(w).id));
  });
});

describe("tags.merge()", () => {
  it("moves the source's contacts and deals to the target and deletes the source; the preview counted it", async () => {
    const w = await world();
    const { a, b } = mergePair(w);
    const contactsBefore = w.contacts();
    const dealsBefore = w.deals();
    const aContacts = w.taggedContacts(a.id).map((c) => c.id);
    const aDeals = w.taggedDeals(a.id).map((o) => o.id);
    const union = new Set([
      ...aContacts,
      ...w.taggedContacts(b.id).map((c) => c.id),
    ]);
    // Not vacuous: A is on contacts and deals, some of them with B already.
    expect(aContacts.length).toBeGreaterThan(0);
    expect(aDeals.length).toBeGreaterThan(0);
    expect(union.size).toBeLessThan(
      aContacts.length + w.taggedContacts(b.id).length,
    );

    const preview = await settle(w.tags.mergePreview(a.id, b.id));
    expect(preview).toEqual({
      contacts: aContacts.length,
      deals: aDeals.length,
      contactsAfter: union.size,
    });
    const sourceOnly = await settle(w.tags.mergePreview(a.id));
    expect(sourceOnly).toEqual({
      contacts: aContacts.length,
      deals: aDeals.length,
    });

    const revisions = {
      tags: w.cache.revisionOf("tags"),
      contacts: w.cache.revisionOf("contacts"),
      opportunities: w.cache.revisionOf("opportunities"),
    };
    const merged = await settle(w.tags.merge(a.id, b.id));

    const stored = w.db.getState();
    expect(stored.tags[a.id]).toBeUndefined();
    expect(merged).toEqual({
      ...b,
      updatedAt: merged.updatedAt,
      contactCount: union.size,
    });
    expect(merged.updatedAt > b.updatedAt).toBe(true);
    expect(stored.tags[b.id]).toEqual({ ...b, updatedAt: merged.updatedAt });
    expect(w.taggedContacts(a.id)).toEqual([]);
    expect(w.taggedDeals(a.id)).toEqual([]);
    expect(
      w
        .taggedContacts(b.id)
        .map((c) => c.id)
        .sort(),
    ).toEqual([...union].sort());
    for (const id of aDeals) {
      expect(stored.opportunities[id]!.tagIds).toContain(b.id);
    }

    // B takes A's place, or A just goes where B already was; nothing twice.
    const expected = (tagIds: ID[]) =>
      tagIds.includes(b.id)
        ? tagIds.filter((t) => t !== a.id)
        : tagIds.map((t) => (t === a.id ? b.id : t));
    const changedContacts = contactsBefore.filter((before) => {
      const after = stored.contacts[before.id]!;
      expect(after.tagIds).toEqual(expected(before.tagIds));
      expect(after.updatedAt).toBe(before.updatedAt);
      return after !== before;
    });
    const changedDeals = dealsBefore.filter((before) => {
      const after = stored.opportunities[before.id]!;
      expect(after.tagIds).toEqual(expected(before.tagIds));
      expect(after.updatedAt).toBe(before.updatedAt);
      return after !== before;
    });
    expect(changedContacts.map((c) => c.id).sort()).toEqual(
      [...aContacts].sort(),
    );
    expect(changedDeals.map((o) => o.id).sort()).toEqual([...aDeals].sort());

    const listed = await settle(w.tags.list());
    expect(listed.find((t) => t.id === b.id)!.contactCount).toBe(union.size);
    expect(listed.find((t) => t.id === a.id)).toBeUndefined();

    expect(w.cache.revisionOf("tags")).toBeGreaterThan(revisions.tags);
    expect(w.cache.revisionOf("contacts")).toBeGreaterThan(revisions.contacts);
    expect(w.cache.revisionOf("opportunities")).toBeGreaterThan(
      revisions.opportunities,
    );
    expect(await w.report()).toEqual([]);
  });

  it("merges into a tag an automation names", async () => {
    const w = await world();
    const cold = w.byName("Cold");
    const demo = w.byName("Demo Booked");
    const preview = await settle(w.tags.mergePreview(cold.id, demo.id));
    expect(preview.refusal).toBeUndefined();
    const merged = await settle(w.tags.merge(cold.id, demo.id));
    expect(merged.name).toBe("Demo Booked");
    expect(merged.contactCount).toBe(preview.contactsAfter);
    expect(merged.renameRefusal).toBe(
      namedSentence(
        "Demo Booked",
        "Appointment Reminders",
        "renaming Demo Booked",
      ),
    );
    expect(await w.report()).toEqual([]);
  });

  it("refuses, in order: an unknown source, an unknown target, the same tag", async () => {
    const w = await world();
    const vip = w.byName("VIP").id;
    await refused(w, () => w.tags.merge("tag_nope", "tag_gone"), {
      status: 404,
      code: "NOT_FOUND",
      message: "Tag tag_nope was not found.",
    });
    const target = await refused(w, () => w.tags.merge(vip, "tag_gone"), {
      status: 404,
      code: "NOT_FOUND",
      field: "targetId",
    });
    expect(target.message).not.toContain("tag_gone");
    await refused(w, () => w.tags.merge(vip, vip), {
      status: 400,
      code: "MERGE_INTO_SELF",
      message: "Pick another tag to merge VIP into.",
    });
    // An unknown target before the automation rule, too.
    await refused(
      w,
      () => w.tags.merge(w.byName("Demo Booked").id, "tag_gone"),
      { status: 404, field: "targetId" },
    );

    for (const [source, target] of [
      ["tag_nope", vip],
      [vip, "tag_gone"],
      [vip, vip],
    ] as const) {
      await expect(
        settle(w.tags.mergePreview(source, target)),
      ).rejects.toMatchObject({
        status: source === target ? 400 : 404,
      });
    }
  });

  it.each(NAMED_TAGS)(
    "refuses to merge %s away, which the %s automation names, and both previews say so",
    async (tag, automation) => {
      const w = await world();
      const id = w.byName(tag).id;
      const vip = w.byName("VIP").id;
      const message = namedSentence(
        tag,
        automation,
        `merging ${tag} into another tag`,
      );
      await refused(w, () => w.tags.merge(id, vip), {
        status: 409,
        code: "NAMED_IN_AUTOMATION",
        message,
      });
      expect((await settle(w.tags.mergePreview(id))).refusal).toBe(message);
      const withTarget = await settle(w.tags.mergePreview(id, vip));
      expect(withTarget.refusal).toBe(message);
      expect(withTarget.contactsAfter).toBeUndefined();
      expect(await w.report()).toEqual([]);
    },
  );

  it("writes nothing when the simulated write fails", async () => {
    const w = await world();
    const { a, b } = mergePair(w);
    await failsWithoutWriting(w, () => w.tags.merge(a.id, b.id));
  });
});

/**
 * Tag writes sent side by side: six pairs, each sent in both orders. Each
 * write reads and writes in the same simulated call, so a second write never
 * starts from a copy read before the first one landed. Both calls' sleeps are
 * queued before either runs, so a read made before the sleep and a write
 * made after it would interleave here and lose one of the changes; only the
 * call sent second loses to a stale read, hence both orders. The merge and
 * removal pair proves only `merge`: the removal's 0ms sleep ends, and it
 * writes, before the merge's 400ms one does, so the removal never runs on a
 * stale copy.
 */
describe("tag writes sent at once", () => {
  const ORDERS = ["sent as listed", "sent reversed"] as const;
  const inOrder = <T>(
    order: (typeof ORDERS)[number],
    calls: [() => Promise<T>, () => Promise<T>],
  ) =>
    Promise.all(
      order === "sent as listed"
        ? [calls[0](), calls[1]()]
        : [calls[1](), calls[0]()],
    );

  it.each(ORDERS)(
    "keeps a rename and a recolour of the same tag (%s)",
    async (order) => {
      const w = await world();
      // VIP is named in no automation, so it may be renamed.
      const vip = w.byName("VIP").id;
      await settle(
        inOrder<unknown>(order, [
          () => w.tags.update(vip, { name: "VIPs" }),
          () => w.tags.update(vip, { color: "pink" }),
        ]),
      );
      expect(w.db.getState().tags[vip]).toMatchObject({
        name: "VIPs",
        slug: "vips",
        color: "pink",
      });
    },
  );

  it.each(ORDERS)(
    "creates one of two tags with the same name in another case (%s)",
    async (order) => {
      const w = await world();
      const before = Object.keys(w.db.getState().tags).length;
      const calls: [() => Promise<unknown>, () => Promise<unknown>] = [
        () => w.tags.create({ name: "Podcast", color: "pink" }),
        () => w.tags.create({ name: "podcast", color: "pink" }),
      ];
      const results = await settle(
        Promise.allSettled(
          order === "sent as listed"
            ? [calls[0](), calls[1]()]
            : [calls[1](), calls[0]()],
        ),
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const rejected = results.filter((r) => r.status === "rejected");
      expect(rejected).toHaveLength(1);
      expect(rejected[0]!.reason).toMatchObject({
        status: 409,
        code: "NAME_TAKEN",
      });
      const tags = Object.values(w.db.getState().tags);
      expect(tags).toHaveLength(before + 1);
      expect(
        tags.filter((t) => t.name.toLowerCase() === "podcast"),
      ).toHaveLength(1);
    },
  );

  it.each(ORDERS)(
    "keeps a removal and a rename of another tag (%s)",
    async (order) => {
      const w = await world();
      const c = tagWithRecords(w);
      const vip = w.byName("VIP").id;
      await settle(
        inOrder<unknown>(order, [
          () => w.tags.remove(c.id),
          () => w.tags.update(vip, { name: "VIPs" }),
        ]),
      );
      const tags = w.db.getState().tags;
      expect(tags[c.id]).toBeUndefined();
      expect(tags[vip]).toMatchObject({ name: "VIPs" });
      expect(w.taggedContacts(c.id)).toEqual([]);
      expect(w.taggedDeals(c.id)).toEqual([]);
      expect(await w.report()).toEqual([]);
    },
  );

  it.each(ORDERS)("keeps two removals made at once (%s)", async (order) => {
    const w = await world();
    const c = tagWithRecords(w);
    const d = tagWithRecords(w, [c.id]);
    await settle(
      inOrder<unknown>(order, [
        () => w.tags.remove(c.id),
        () => w.tags.remove(d.id),
      ]),
    );
    const tags = w.db.getState().tags;
    expect(tags[c.id]).toBeUndefined();
    expect(tags[d.id]).toBeUndefined();
    for (const id of [c.id, d.id]) {
      expect(w.taggedContacts(id)).toEqual([]);
      expect(w.taggedDeals(id)).toEqual([]);
    }
    expect(await w.report()).toEqual([]);
  });

  it.each(ORDERS)(
    "keeps a merge and a removal of another tag (%s)",
    async (order) => {
      const w = await world();
      const { a, b } = mergePair(w);
      const c = tagWithRecords(w, [a.id, b.id]);
      await settle(
        inOrder<unknown>(order, [
          () => w.tags.merge(a.id, b.id),
          () => w.tags.remove(c.id),
        ]),
      );
      const tags = w.db.getState().tags;
      expect(tags[a.id]).toBeUndefined();
      expect(tags[c.id]).toBeUndefined();
      expect(tags[b.id]).toBeDefined();
      expect(w.taggedContacts(a.id)).toEqual([]);
      expect(w.taggedContacts(c.id)).toEqual([]);
      expect(w.taggedDeals(a.id)).toEqual([]);
      expect(w.taggedDeals(c.id)).toEqual([]);
      expect(await w.report()).toEqual([]);
    },
  );

  it.each(ORDERS)("keeps two merges into the same tag (%s)", async (order) => {
    const w = await world();
    const { a, b } = mergePair(w);
    const c = tagWithRecords(w, [a.id, b.id]);
    const expected = new Set(
      [a.id, b.id, c.id].flatMap((id) => w.taggedContacts(id).map((x) => x.id)),
    );
    await settle(
      inOrder<unknown>(order, [
        () => w.tags.merge(a.id, b.id),
        () => w.tags.merge(c.id, b.id),
      ]),
    );
    const tags = w.db.getState().tags;
    expect(tags[a.id]).toBeUndefined();
    expect(tags[c.id]).toBeUndefined();
    expect(
      w
        .taggedContacts(b.id)
        .map((x) => x.id)
        .sort(),
    ).toEqual([...expected].sort());
    expect(w.taggedDeals(a.id)).toEqual([]);
    expect(w.taggedDeals(c.id)).toEqual([]);
    expect(await w.report()).toEqual([]);
  });
});
