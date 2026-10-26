import { describe, expect, it } from "vitest";

import {
  EMPTY_INVITE,
  inviteSchema,
  roleSchema,
  toInviteDraft,
  USER_ROLES,
} from "./team";

/** Each failing field's first message, by path. */
function messages(input: unknown): Record<string, string> {
  const result = inviteSchema.safeParse(input);
  if (result.success) return {};
  const out: Record<string, string> = {};
  for (const issue of result.error.issues) {
    out[issue.path.join(".")] ??= issue.message;
  }
  return out;
}

const FILLED = {
  firstName: "Casey",
  lastName: "Lin",
  email: "casey@northwind.studio",
  role: "user",
  jobTitle: "",
} as const;

describe("inviteSchema", () => {
  it("gives each required field its own message when the form is empty", () => {
    expect(messages(EMPTY_INVITE)).toEqual({
      firstName: "Enter a first name.",
      lastName: "Enter a last name.",
      email: "Enter an email address.",
    });
    expect(
      messages({ ...EMPTY_INVITE, firstName: "  ", lastName: " " }),
    ).toEqual({
      firstName: "Enter a first name.",
      lastName: "Enter a last name.",
      email: "Enter an email address.",
    });
  });

  it("refuses a malformed email and a role outside the list", () => {
    expect(messages({ ...FILLED, email: "casey@", role: "owner" })).toEqual({
      email: "Enter a valid email address, like name@example.com.",
      role: "Choose a role from the list.",
    });
  });

  it("trims every text field, and takes no job title or an empty one", () => {
    expect(
      inviteSchema.parse({
        firstName: " Casey ",
        lastName: " Lin",
        email: " casey@northwind.studio ",
        role: "admin",
        jobTitle: " Designer ",
      }),
    ).toEqual({
      firstName: "Casey",
      lastName: "Lin",
      email: "casey@northwind.studio",
      role: "admin",
      jobTitle: "Designer",
    });
    const { jobTitle, ...withoutTitle } = FILLED;
    expect(jobTitle).toBe("");
    expect(inviteSchema.parse(withoutTitle)).toEqual(withoutTitle);
    expect(inviteSchema.parse({ ...FILLED, jobTitle: "  " }).jobTitle).toBe("");
  });

  it("drops keys outside the form", () => {
    expect(
      inviteSchema.parse({ ...FILLED, id: "usr_x", lastSeenAt: "2026-01-01" }),
    ).toEqual(FILLED);
  });
});

describe("roleSchema", () => {
  it("takes the three roles and nothing else", () => {
    expect(USER_ROLES).toEqual(["agency_owner", "admin", "user"]);
    for (const role of USER_ROLES) expect(roleSchema.parse(role)).toBe(role);
    expect(roleSchema.safeParse("owner").success).toBe(false);
    expect(roleSchema.safeParse("").success).toBe(false);
  });
});

describe("toInviteDraft()", () => {
  it("sends only the invite keys", () => {
    const values = { ...FILLED, id: "usr_x", slug: "x" };
    expect(Object.keys(toInviteDraft(values)).sort()).toEqual([
      "email",
      "firstName",
      "jobTitle",
      "lastName",
      "role",
    ]);
  });
});
