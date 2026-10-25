import { describe, expect, it } from "vitest";

import { seededWorld, settle } from "@/lib/mock/testing";

/** Users carry a slug so automation definitions can name them (P8). */
describe("api.users.invite()", () => {
  it("gives an invited user a slug from their email, unique in the workspace", async () => {
    await seededWorld();
    const users = await import("./users");

    const casey = await settle(
      users.invite({
        firstName: "Casey",
        lastName: "Lin",
        email: "Casey.Lin@northwind.studio",
        role: "user",
      }),
    );
    expect(casey.slug).toBe("caseylin");

    // "priya" is already a seeded user's slug.
    const priya = await settle(
      users.invite({
        firstName: "Priya",
        lastName: "Shah",
        email: "priya@elsewhere.example",
        role: "user",
      }),
    );
    expect(priya.slug).toBe("priya2");

    const all = await settle(users.list());
    const slugs = all.map((u) => u.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
