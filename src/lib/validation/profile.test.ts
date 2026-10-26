import { describe, expect, it } from "vitest";

import type { User } from "@/types";
import { isWebAddress } from "./details";
import { profileSchema, toProfileForm, toProfilePatch } from "./profile";

const FILLED = {
  firstName: "Jordan",
  lastName: "Reyes",
  email: "jordan@northwind.studio",
  phone: "",
  jobTitle: "",
  timezone: "America/Los_Angeles",
};

/** Each failing field's first message, by path. */
function messages(input: unknown): Record<string, string> {
  const result = profileSchema.safeParse(input);
  if (result.success) return {};
  const out: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const path = issue.path.join(".");
    out[path] ??= issue.message;
  }
  return out;
}

describe("profileSchema", () => {
  it("gives each required field its own message when the form is empty", () => {
    expect(
      messages({
        firstName: "  ",
        lastName: "",
        email: " ",
        phone: "",
        jobTitle: "",
        timezone: "",
      }),
    ).toEqual({
      firstName: "Enter a first name.",
      lastName: "Enter a last name.",
      email: "Enter an email address.",
      timezone: "Choose a time zone.",
    });
  });

  it("reports one message per field, not one per rule", () => {
    const result = profileSchema.safeParse({
      ...FILLED,
      email: "",
      timezone: "",
    });
    expect(result.success).toBe(false);
    expect(result.error!.issues.map((i) => i.path.join("."))).toEqual([
      "email",
      "timezone",
    ]);
  });

  it("refuses a malformed email and an unknown time zone", () => {
    expect(
      messages({ ...FILLED, email: "jordan@", timezone: "Mars/Olympus" }),
    ).toEqual({
      email: "Enter a valid email address, like name@example.com.",
      timezone: "Choose a time zone from the list.",
    });
  });

  it("trims every text field and accepts empty optional ones", () => {
    expect(
      profileSchema.parse({
        firstName: " Taylor ",
        lastName: " Reyes",
        email: " taylor@northwind.studio ",
        phone: "  ",
        jobTitle: " Founder ",
        timezone: "Asia/Singapore",
      }),
    ).toEqual({
      firstName: "Taylor",
      lastName: "Reyes",
      email: "taylor@northwind.studio",
      phone: "",
      jobTitle: "Founder",
      timezone: "Asia/Singapore",
    });
  });
});

describe("toProfileForm() and toProfilePatch()", () => {
  const user: User = {
    id: "usr_jordan",
    slug: "jordan",
    firstName: "Jordan",
    lastName: "Reyes",
    email: "jordan@northwind.studio",
    role: "agency_owner",
    timezone: "America/Los_Angeles",
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  it("loads absent optional values as empty", () => {
    expect(toProfileForm(user)).toEqual({ ...FILLED });
    expect(
      toProfileForm({ ...user, phone: "+1 555 0100", jobTitle: "Founder" }),
    ).toMatchObject({ phone: "+1 555 0100", jobTitle: "Founder" });
  });

  it("sends only the profile keys, never id, slug or role", () => {
    const values = { ...FILLED, id: "usr_x", slug: "x", role: "admin" };
    expect(Object.keys(toProfilePatch(values)).sort()).toEqual([
      "email",
      "firstName",
      "jobTitle",
      "lastName",
      "phone",
      "timezone",
    ]);
  });
});

describe("isWebAddress()", () => {
  it("takes an http(s) address with a dotted host and nothing else", () => {
    expect(isWebAddress("https://northwind.studio")).toBe(true);
    expect(isWebAddress("http://northwind.studio/about")).toBe(true);
    expect(isWebAddress("northwind.studio")).toBe(false);
    expect(isWebAddress("https://localhost")).toBe(false);
    expect(isWebAddress("ftp://northwind.studio")).toBe(false);
    expect(isWebAddress("https://northwind.")).toBe(false);
  });
});
