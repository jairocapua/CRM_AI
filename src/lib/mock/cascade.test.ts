import { describe, expect, it } from "vitest";

import type { Contact, Opportunity, Tag } from "@/types";
import {
  cascadeTagDelete,
  cascadeTagMerge,
  countContactsAfterMerge,
  countTaggedRecords,
  holdsTag,
  mergedTagIds,
} from "./cascade";
import type { DbState } from "./db-state";

/**
 * The tag cascades (P9-T06) on a hand-built store: three tags, three
 * contacts and two deals. Only the tables the cascades read are filled.
 */

const tag = (id: string): Tag => ({
  id,
  name: id,
  slug: id,
  color: "slate",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});
const contact = (id: string, tagIds: string[]) =>
  ({ id, tagIds, updatedAt: "2026-01-02T00:00:00.000Z" }) as unknown as Contact;
const deal = (id: string, tagIds: string[]) =>
  ({
    id,
    tagIds,
    updatedAt: "2026-01-02T00:00:00.000Z",
  }) as unknown as Opportunity;

function state(): DbState {
  return {
    tags: { a: tag("a"), b: tag("b"), c: tag("c") },
    contacts: {
      c1: contact("c1", ["a", "c"]),
      c2: contact("c2", ["c", "b", "a"]),
      c3: contact("c3", ["c"]),
    },
    opportunities: {
      o1: deal("o1", ["a"]),
      o2: deal("o2", ["b"]),
    },
  } as unknown as DbState;
}

describe("mergedTagIds", () => {
  it("puts the target in the source's place", () => {
    expect(mergedTagIds(["x", "a", "y"], "a", "b")).toEqual(["x", "b", "y"]);
  });

  it("drops the source when the target is already there, keeping the order", () => {
    expect(mergedTagIds(["b", "x", "a", "y"], "a", "b")).toEqual([
      "b",
      "x",
      "y",
    ]);
    expect(mergedTagIds(["a", "x", "b"], "a", "b")).toEqual(["b", "x"]);
  });

  it("leaves a list without the source as it is", () => {
    expect(mergedTagIds(["x", "b"], "a", "b")).toEqual(["x", "b"]);
  });
});

describe("tag counts", () => {
  it("counts the contacts and deals carrying a tag", () => {
    expect(countTaggedRecords(state(), "a")).toEqual({ contacts: 2, deals: 1 });
    expect(countTaggedRecords(state(), "c")).toEqual({ contacts: 3, deals: 0 });
    expect(holdsTag(contact("x", ["a"]), "a")).toBe(true);
    expect(holdsTag(contact("x", ["b"]), "a")).toBe(false);
  });

  it("counts a contact with both tags once after a merge", () => {
    expect(countContactsAfterMerge(state(), "a", "b")).toBe(2);
    expect(countContactsAfterMerge(state(), "b", "c")).toBe(3);
  });
});

describe("cascadeTagDelete", () => {
  it("deletes the tag and strips it from contacts and deals, keeping the rest", () => {
    const before = state();
    const after = cascadeTagDelete(before, "a");
    expect(Object.keys(after.tags!)).toEqual(["b", "c"]);
    expect(after.contacts!.c1!.tagIds).toEqual(["c"]);
    expect(after.contacts!.c2!.tagIds).toEqual(["c", "b"]);
    expect(after.opportunities!.o1!.tagIds).toEqual([]);
    // Untouched rows are the same objects; timestamps are kept.
    expect(after.contacts!.c3).toBe(before.contacts.c3);
    expect(after.opportunities!.o2).toBe(before.opportunities.o2);
    expect(after.contacts!.c1!.updatedAt).toBe(before.contacts.c1!.updatedAt);
    // Pure: the input is not changed.
    expect(before.contacts.c1!.tagIds).toEqual(["a", "c"]);
    expect(before.tags.a).toBeDefined();
  });
});

describe("cascadeTagMerge", () => {
  it("moves the source's records to the target, no tag twice, then deletes the source", () => {
    const before = state();
    const after = cascadeTagMerge(before, "a", "b");
    expect(Object.keys(after.tags!)).toEqual(["b", "c"]);
    expect(after.contacts!.c1!.tagIds).toEqual(["b", "c"]);
    expect(after.contacts!.c2!.tagIds).toEqual(["c", "b"]);
    expect(after.opportunities!.o1!.tagIds).toEqual(["b"]);
    expect(after.contacts!.c3).toBe(before.contacts.c3);
    expect(after.opportunities!.o2).toBe(before.opportunities.o2);
    expect(after.opportunities!.o1!.updatedAt).toBe(
      before.opportunities.o1!.updatedAt,
    );
    expect(before.contacts.c1!.tagIds).toEqual(["a", "c"]);
  });
});
