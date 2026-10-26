import { describe, expect, it } from "vitest";

import type { Location } from "@/types";
import { businessSchema, toBusinessForm, toBusinessPatch } from "./business";

const FILLED = {
  name: "Northwind Studio",
  email: "",
  phone: "",
  website: "",
  industry: "",
  timezone: "America/Los_Angeles",
};

/** Each failing field's first message, by path. */
function messages(input: unknown): Record<string, string> {
  const result = businessSchema.safeParse(input);
  if (result.success) return {};
  const out: Record<string, string> = {};
  for (const issue of result.error.issues) {
    out[issue.path.join(".")] ??= issue.message;
  }
  return out;
}

describe("businessSchema", () => {
  it("needs a name and a time zone, and nothing else", () => {
    expect(messages({ ...FILLED, name: "  ", timezone: "" })).toEqual({
      name: "Enter the business name.",
      timezone: "Choose a time zone.",
    });
    expect(businessSchema.safeParse(FILLED).success).toBe(true);
  });

  it("refuses a malformed email or website and an unknown time zone", () => {
    expect(
      messages({
        ...FILLED,
        email: "hello@",
        website: "northwind.studio",
        timezone: "Mars/Olympus",
      }),
    ).toEqual({
      email: "Enter a valid email address, like name@example.com.",
      website: "Enter a web address that starts with https://.",
      timezone: "Choose a time zone from the list.",
    });
  });

  it("trims every text field", () => {
    expect(
      businessSchema.parse({
        name: " Northwind ",
        email: " hello@northwind.studio ",
        phone: " +1 555 0142 ",
        website: " https://northwind.studio ",
        industry: " Agency ",
        timezone: "Asia/Singapore",
      }),
    ).toEqual({
      name: "Northwind",
      email: "hello@northwind.studio",
      phone: "+1 555 0142",
      website: "https://northwind.studio",
      industry: "Agency",
      timezone: "Asia/Singapore",
    });
  });
});

describe("toBusinessForm() and toBusinessPatch()", () => {
  const location: Location = {
    id: "loc_harbor",
    name: "Harbor Dental",
    timezone: "America/New_York",
    currency: "USD",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  it("loads absent optional values as empty", () => {
    expect(toBusinessForm(location)).toEqual({
      ...FILLED,
      name: "Harbor Dental",
      timezone: "America/New_York",
    });
  });

  it("sends only the business keys, never currency or the address", () => {
    const values = { ...FILLED, currency: "EUR", address: { city: "Oslo" } };
    expect(Object.keys(toBusinessPatch(values)).sort()).toEqual([
      "email",
      "industry",
      "name",
      "phone",
      "timezone",
      "website",
    ]);
  });
});
