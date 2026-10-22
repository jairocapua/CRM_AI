import { describe, expect, it } from "vitest";

import type { Contact } from "@/types";
import { freshModules, settle } from "@/lib/mock/testing";

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
