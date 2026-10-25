import { describe, expect, it } from "vitest";

import type { Contact } from "@/types";
import { freshModules, seededWorld, settle } from "@/lib/mock/testing";

/**
 * Contact search, as the contact picker, the contacts table and the CSV
 * export run it. Three fixture contacts, so every expected list is written
 * out by hand: two Garcias by name, and a Ross who works at "Garcia Group".
 */

const AT = "2026-09-01T09:00:00.000Z";

function contact(
  overrides: Partial<Contact> & Pick<Contact, "id" | "firstName" | "lastName">,
): Contact {
  return {
    tagIds: [],
    customFields: {},
    followers: [],
    status: "lead",
    source: "manual",
    score: 0,
    timezone: "America/Los_Angeles",
    dnd: { all: false, email: false, sms: false, call: false },
    createdAt: AT,
    updatedAt: AT,
    ...overrides,
  };
}

const FIXTURE: Contact[] = [
  contact({
    id: "con_ana",
    firstName: "Ana",
    lastName: "Garcia",
    email: "ana.garcia@acme.com",
    phone: "+12005550001",
    companyName: "Acme Corp",
    jobTitle: "Buyer",
  }),
  contact({
    id: "con_diana",
    firstName: "Diana",
    lastName: "Garcia",
    email: "diana@globex.com",
    phone: "+12005550002",
    companyName: "Globex",
    jobTitle: "Founder",
  }),
  contact({
    id: "con_mark",
    firstName: "Mark",
    lastName: "Ross",
    email: "mark.ross@example.com",
    phone: "+12005550003",
    companyName: "Garcia Group",
    jobTitle: "Director",
  }),
];

/** A fresh store holding only the fixture contacts. */
async function world() {
  await freshModules();
  const { db } = await import("@/lib/mock/db");
  const contacts = await import("./contacts");
  db.setState({
    contacts: Object.fromEntries(FIXTURE.map((c) => [c.id, c])),
  });
  return contacts;
}

/** The names `list({ q })` returns, sorted so order does not matter. */
async function search(q: string): Promise<string[]> {
  const contacts = await world();
  const page = await settle(contacts.list({ q }));
  return page.rows.map((c) => `${c.firstName} ${c.lastName}`).sort();
}

describe("contacts.list({ q })", () => {
  it("matches the full name, ignoring case and outer spaces", async () => {
    // A substring of "First Last", so "Ana Garcia" also finds "Diana Garcia".
    expect(await search("  ana GARCIA ")).toEqual([
      "Ana Garcia",
      "Diana Garcia",
    ]);
  });

  it("finds a full name as it is typed", async () => {
    expect(await search("ana gar")).toEqual(["Ana Garcia", "Diana Garcia"]);
  });

  it("still matches one field alone", async () => {
    // Two by last name, one by company.
    expect(await search("garcia")).toEqual([
      "Ana Garcia",
      "Diana Garcia",
      "Mark Ross",
    ]);
    expect(await search("Mark")).toEqual(["Mark Ross"]);
    expect(await search("ross")).toEqual(["Mark Ross"]);
    expect(await search("ana.garcia@acme.com")).toEqual(["Ana Garcia"]);
    expect(await search("+12005550001")).toEqual(["Ana Garcia"]);
    expect(await search("acme corp")).toEqual(["Ana Garcia"]);
    expect(await search("buyer")).toEqual(["Ana Garcia"]);
  });
});

describe("contacts.exportCsv({ q })", () => {
  it("exportCsv uses the same search as list", async () => {
    const contacts = await world();
    const blob = await settle(contacts.exportCsv({ q: "Ana Garcia" }));
    const [header, ...rows] = (await blob.text()).split("\n");

    expect(header).toBe(
      "First Name,Last Name,Email,Phone,Company,Status,Source,Score,Created",
    );
    expect(
      rows.map((line) => line.split(",").slice(0, 2).join(" ")).sort(),
    ).toEqual(["Ana Garcia", "Diana Garcia"]);
  });
});

describe("contacts.remove() and automation runs", () => {
  /** A seeded world, plus the contacts with run history, most runs first. */
  async function runsWorld() {
    const { db } = await seededWorld();
    const contacts = await import("./contacts");
    const settings = await import("./settings");
    const cache = await import("./cache");
    const runCount = new Map<string, number>();
    for (const run of Object.values(db.getState().workflowRuns)) {
      runCount.set(run.contactId, (runCount.get(run.contactId) ?? 0) + 1);
    }
    const withRuns = [...runCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id);
    const runsOf = (ids: string[]) =>
      Object.values(db.getState().workflowRuns).filter((r) =>
        ids.includes(r.contactId),
      );
    return { db, contacts, settings, cache, withRuns, runsOf };
  }

  it("deleting one contact deletes their runs and keeps the report clean", async () => {
    const w = await runsWorld();
    const id = w.withRuns[0]!;
    const theirs = w.runsOf([id]).length;
    expect(theirs).toBeGreaterThanOrEqual(1);
    const before = Object.keys(w.db.getState().workflowRuns).length;
    const revision = w.cache.revisionOf("workflowRuns");

    await settle(w.contacts.remove([id]));

    expect(w.runsOf([id])).toEqual([]);
    // Only theirs: everyone else's history survives.
    expect(Object.keys(w.db.getState().workflowRuns)).toHaveLength(
      before - theirs,
    );
    expect(w.cache.revisionOf("workflowRuns")).toBe(revision + 1);
    expect(await settle(w.settings.integrityReport())).toEqual([]);
  });

  it("bulk-deleting contacts deletes all their runs and keeps the report clean", async () => {
    const w = await runsWorld();
    const ids = w.withRuns.slice(0, 3);
    expect(ids).toHaveLength(3);
    const theirs = w.runsOf(ids).length;
    expect(theirs).toBeGreaterThanOrEqual(3);
    const before = Object.keys(w.db.getState().workflowRuns).length;

    expect(await settle(w.contacts.remove(ids))).toEqual({ deleted: 3 });

    expect(w.runsOf(ids)).toEqual([]);
    expect(Object.keys(w.db.getState().workflowRuns)).toHaveLength(
      before - theirs,
    );
    expect(await settle(w.settings.integrityReport())).toEqual([]);
  });
});
