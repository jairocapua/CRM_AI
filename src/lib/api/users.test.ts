import { describe, expect, it } from "vitest";

import { seededWorld, settle } from "@/lib/mock/testing";
import type { InviteDraft, UserPatch } from "./users";

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

/**
 * Removing a teammate reassigns what they hold (P9-T01). Every seeded user is
 * named by an automation, which blocks their removal, so the happy path
 * invites Casey and hands her a slice of the seeded records first.
 */
async function withCasey() {
  const { db } = await seededWorld();
  const users = await import("./users");
  const settings = await import("./settings");
  const cache = await import("./cache");
  const casey = await settle(
    users.invite({
      firstName: "Casey",
      lastName: "Lin",
      email: "casey@northwind.studio",
      role: "user",
    }),
  );
  const c = casey.id;

  const s = db.getState();
  const first = <T extends { id: string }>(
    table: Record<string, T>,
    n: number,
  ) => Object.values(table).slice(0, n);
  const set = <T extends { id: string }>(
    table: Record<string, T>,
    rows: T[],
    patch: (row: T) => Partial<T>,
  ) => ({
    ...table,
    ...Object.fromEntries(rows.map((r) => [r.id, { ...r, ...patch(r) }])),
  });

  const [owned1, owned2, owned3, followed1, followed2] = first(s.contacts, 5);
  const discovery = Object.values(s.calendars).find(
    (cal) => cal.name === "Discovery Call",
  )!;
  const withJordan = Object.values(s.calendars).find((cal) =>
    cal.teamMemberIds.includes("usr_jordan"),
  )!;
  const ids = {
    contacts: [owned1!.id, owned2!.id, owned3!.id],
    followed: [followed1!.id, followed2!.id],
    opportunities: first(s.opportunities, 2).map((o) => o.id),
    tasks: first(s.tasks, 2).map((t) => t.id),
    conversations: first(s.conversations, 2).map((x) => x.id),
    appointments: first(s.appointments, 2).map((a) => a.id),
    note: first(s.notes, 1)[0]!.id,
    activity: first(s.activities, 1)[0]!.id,
    discovery: discovery.id,
    withJordan: withJordan.id,
    privateList: "sl_casey",
    sharedList: first(s.smartLists, 1)[0]!.id,
  };
  db.setState({
    contacts: set(
      set(s.contacts, [owned1!, owned2!, owned3!], () => ({ ownerId: c })),
      [followed1!, followed2!],
      (r) => ({
        followers: r === followed1 ? [c] : ["usr_priya", c],
      }),
    ),
    opportunities: set(s.opportunities, first(s.opportunities, 2), () => ({
      ownerId: c,
    })),
    tasks: set(s.tasks, first(s.tasks, 2), () => ({ assigneeId: c })),
    conversations: set(s.conversations, first(s.conversations, 2), () => ({
      assigneeId: c,
    })),
    appointments: set(s.appointments, first(s.appointments, 2), () => ({
      assignedUserId: c,
    })),
    calendars: set(s.calendars, [discovery, withJordan], (cal) => ({
      teamMemberIds:
        cal === discovery
          ? ["usr_priya", c, "usr_marcus", "usr_lena"]
          : [...cal.teamMemberIds, c],
    })),
    smartLists: {
      ...s.smartLists,
      [ids.privateList]: {
        ...s.smartLists[ids.sharedList]!,
        id: ids.privateList,
        name: "Casey's leads",
        ownerId: c,
      },
    },
    notes: set(s.notes, first(s.notes, 1), () => ({ authorId: c })),
    activities: set(s.activities, first(s.activities, 1), () => ({
      actorId: c,
    })),
  });
  // Before removal the workspace is consistent: Casey exists.
  expect(await settle(settings.integrityReport())).toEqual([]);

  return { db, users, settings, cache, casey, ids };
}

/** Fails the test when a call expected to be refused goes ahead. */
function noRefusal(): never {
  throw new Error("expected the call to be refused");
}

/** `users.remove()`'s arguments. */
type RemoveArgs = [id: string, options?: { reassignTo?: string }];

const KEYS = [
  "users",
  "contacts",
  "opportunities",
  "tasks",
  "conversations",
  "appointments",
  "calendars",
  "smartLists",
] as const;

describe("api.users.remove()", () => {
  it("hands everything the teammate holds to the current user by default", async () => {
    const { db, users, settings, cache, casey, ids } = await withCasey();
    const before = Object.fromEntries(
      KEYS.map((k) => [k, cache.revisionOf(k)]),
    );

    await settle(users.remove(casey.id));

    const s = db.getState();
    expect(s.currentUserId).toBe("usr_jordan");
    expect(s.users[casey.id]).toBeUndefined();
    for (const id of ids.contacts) {
      expect(s.contacts[id]!.ownerId).toBe("usr_jordan");
    }
    // Followers lose Casey and gain nobody.
    expect(ids.followed.map((id) => s.contacts[id]!.followers)).toEqual([
      [],
      ["usr_priya"],
    ]);
    for (const id of ids.opportunities) {
      expect(s.opportunities[id]!.ownerId).toBe("usr_jordan");
    }
    for (const id of ids.tasks) {
      expect(s.tasks[id]!.assigneeId).toBe("usr_jordan");
    }
    for (const id of ids.conversations) {
      expect(s.conversations[id]!.assigneeId).toBe("usr_jordan");
    }
    for (const id of ids.appointments) {
      expect(s.appointments[id]!.assignedUserId).toBe("usr_jordan");
    }
    // Replaced in place; no one listed twice.
    expect(s.calendars[ids.discovery]!.teamMemberIds).toEqual([
      "usr_priya",
      "usr_jordan",
      "usr_marcus",
      "usr_lena",
    ]);
    const withJordan = s.calendars[ids.withJordan]!.teamMemberIds;
    expect(withJordan).not.toContain(casey.id);
    expect(withJordan.filter((id) => id === "usr_jordan")).toHaveLength(1);
    // A private list moves; a shared one stays shared.
    expect(s.smartLists[ids.privateList]!.ownerId).toBe("usr_jordan");
    expect(s.smartLists[ids.sharedList]!.ownerId).toBeUndefined();
    // History keeps its author.
    expect(s.notes[ids.note]!.authorId).toBe(casey.id);
    expect(s.activities[ids.activity]!.actorId).toBe(casey.id);

    // Nothing anywhere still points at Casey but the history.
    const leftovers = JSON.stringify({
      ...s,
      notes: {},
      activities: {},
    });
    expect(leftovers).not.toContain(casey.id);

    for (const key of KEYS) {
      expect(cache.revisionOf(key), key).toBeGreaterThan(before[key]!);
    }
    expect(await settle(settings.integrityReport())).toEqual([]);
  });

  it("hands everything to the teammate named in reassignTo", async () => {
    const { db, users, settings, casey, ids } = await withCasey();

    await settle(users.remove(casey.id, { reassignTo: "usr_priya" }));

    const s = db.getState();
    expect(ids.contacts.map((id) => s.contacts[id]!.ownerId)).toEqual([
      "usr_priya",
      "usr_priya",
      "usr_priya",
    ]);
    expect(s.tasks[ids.tasks[0]!]!.assigneeId).toBe("usr_priya");
    // Priya was already on the calendar, so she is not listed twice.
    expect(s.calendars[ids.discovery]!.teamMemberIds).toEqual([
      "usr_priya",
      "usr_marcus",
      "usr_lena",
    ]);
    // Following stays personal: Priya follows once, Casey's follow is dropped.
    expect(s.contacts[ids.followed[0]!]!.followers).toEqual([]);
    expect(s.contacts[ids.followed[1]!]!.followers).toEqual(["usr_priya"]);
    expect(s.smartLists[ids.privateList]!.ownerId).toBe("usr_priya");
    expect(await settle(settings.integrityReport())).toEqual([]);
  });

  it.each([
    {
      name: "an unknown teammate",
      call: (): RemoveArgs => ["usr_nope"],
      status: 404,
      code: "NOT_FOUND",
    },
    {
      name: "an unknown teammate to reassign to",
      call: (id: string): RemoveArgs => [id, { reassignTo: "usr_nope" }],
      status: 404,
      code: "REASSIGN_TARGET_NOT_FOUND",
    },
    {
      name: "reassigning to the teammate being removed",
      call: (id: string): RemoveArgs => [id, { reassignTo: id }],
      status: 400,
      code: "REASSIGN_TO_SELF",
    },
    {
      name: "removing yourself",
      call: (): RemoveArgs => ["usr_jordan", { reassignTo: "usr_priya" }],
      status: 409,
      code: "CANNOT_REMOVE_YOURSELF",
    },
  ])("refuses $name and writes nothing", async ({ call, status, code }) => {
    const { db, users, casey } = await withCasey();
    const before = db.getState();

    const error = await settle(users.remove(...call(casey.id))).catch(
      (e: unknown) => e,
    );

    expect(error).toMatchObject({ status, code });
    expect((error as Error).message).toMatch(/^[A-Z].*\.$/);
    expect(db.getState()).toBe(before);
  });

  it("refuses a teammate an automation names, and says which", async () => {
    const { db } = await seededWorld();
    const users = await import("./users");
    const lena = db.getState().users["usr_lena"]!;
    // Not vacuous: Lena really holds records the reassignment would move.
    expect(
      Object.values(db.getState().contacts).filter((c) => c.ownerId === lena.id)
        .length,
    ).toBeGreaterThan(0);
    const before = db.getState();

    const error = await settle(users.remove(lena.id)).catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 409, code: "NAMED_IN_AUTOMATION" });
    const message = (error as Error).message;
    expect(message).toContain("Lena Okafor");
    expect(message).toContain("New Lead Nurture");
    expect(message).toContain("Speed to Lead");
    expect(message).not.toContain("Review Request");
    expect(db.getState()).toBe(before);
  });

  it("refuses every seeded teammate but you as named by an automation", async () => {
    const { db } = await seededWorld();
    const users = await import("./users");
    const others = Object.keys(db.getState().users).filter(
      (id) => id !== "usr_jordan",
    );
    expect(others).toHaveLength(5);

    for (const id of others) {
      await expect(settle(users.remove(id)), id).rejects.toMatchObject({
        status: 409,
        code: "NAMED_IN_AUTOMATION",
      });
    }
  });
});

/**
 * The profile page saves through `users.update` (P9-T02). It checks the
 * profile keys with the form's own rules, so the API is never looser than
 * the form; anything outside the profile and the role is ignored (P9-T03).
 */
describe("api.users.update() on the profile keys", () => {
  it.each([
    ["firstName", { firstName: "  " }, "Enter a first name."],
    ["lastName", { lastName: "" }, "Enter a last name."],
    [
      "email",
      { email: "jordan@" },
      "Enter a valid email address, like name@example.com.",
    ],
    ["email", { email: "" }, "Enter an email address."],
    [
      "timezone",
      { timezone: "Mars/Olympus" },
      "Choose a time zone from the list.",
    ],
  ] as const)(
    "refuses a bad %s with a 422 naming it, and writes nothing",
    async (field, patch, message) => {
      const { db } = await seededWorld();
      const users = await import("./users");
      const before = db.getState();
      await expect(
        settle(users.update("usr_jordan", patch)),
      ).rejects.toMatchObject({
        status: 422,
        code: "INVALID_PROFILE",
        field,
        message,
      });
      expect(db.getState()).toBe(before);
    },
  );

  it("saves the profile trimmed and removes emptied optional values", async () => {
    const { db } = await seededWorld();
    const users = await import("./users");
    expect(db.getState().users.usr_jordan!.phone).toBeTruthy();

    const saved = await settle(
      users.update("usr_jordan", {
        firstName: " Taylor ",
        lastName: "Reyes",
        email: " taylor@northwind.studio ",
        phone: "  ",
        jobTitle: "",
        timezone: "Asia/Singapore",
      }),
    );
    expect(saved).toMatchObject({
      id: "usr_jordan",
      slug: "jordan",
      role: "agency_owner",
      firstName: "Taylor",
      email: "taylor@northwind.studio",
      timezone: "Asia/Singapore",
    });
    expect(saved).not.toHaveProperty("phone");
    expect(saved).not.toHaveProperty("jobTitle");
    expect(db.getState().users.usr_jordan).toEqual(saved);
    expect((await settle(users.me())).firstName).toBe("Taylor");
  });

  it("ignores an undefined value instead of storing it", async () => {
    const { db } = await seededWorld();
    const users = await import("./users");
    const saved = await settle(
      users.update("usr_jordan", { firstName: undefined, role: undefined }),
    );
    expect(saved.firstName).toBe("Jordan");
    expect(saved.role).toBe("agency_owner");
    expect(db.getState().users.usr_jordan!.firstName).toBe("Jordan");
  });

  it("refuses an email another teammate has, whatever its case", async () => {
    const { db } = await seededWorld();
    const users = await import("./users");
    const before = db.getState();
    await expect(
      settle(users.update("usr_jordan", { email: " PRIYA@northwind.studio " })),
    ).rejects.toMatchObject({
      status: 409,
      code: "EMAIL_TAKEN",
      field: "email",
      message: "That email address already belongs to Priya Nair.",
    });
    expect(db.getState()).toBe(before);
    // Your own address, in another case, is still yours.
    const saved = await settle(
      users.update("usr_jordan", { email: "Jordan@northwind.studio" }),
    );
    expect(saved.email).toBe("Jordan@northwind.studio");
  });
});

/**
 * `users.update` is an allow-list (P9-T03): the profile keys and `role`.
 * Everything else a caller sends is ignored.
 */
describe("api.users.update() allow-list", () => {
  it("changes a teammate's role", async () => {
    const { db } = await seededWorld();
    const users = await import("./users");
    const saved = await settle(users.update("usr_priya", { role: "user" }));
    expect(saved.role).toBe("user");
    expect(db.getState().users.usr_priya!.role).toBe("user");
  });

  it("ignores id, slug, createdAt, isActive, lastSeenAt and unknown keys", async () => {
    const { db } = await seededWorld();
    const users = await import("./users");
    const before = db.getState().users.usr_priya!;
    const patch = {
      id: "usr_other",
      slug: "someone",
      createdAt: "2020-01-01T00:00:00.000Z",
      isActive: false,
      lastSeenAt: "2020-01-01T00:00:00.000Z",
      avatarUrl: "https://example.com/a.png",
      favouriteColour: "teal",
      jobTitle: "VP Sales",
    } as unknown as UserPatch;

    const saved = await settle(users.update("usr_priya", patch));

    const { updatedAt, ...rest } = saved;
    const { updatedAt: beforeUpdatedAt, ...beforeRest } = before;
    expect(rest).toEqual({ ...beforeRest, jobTitle: "VP Sales" });
    expect(updatedAt >= beforeUpdatedAt).toBe(true);
    expect(db.getState().users.usr_other).toBeUndefined();
    expect(db.getState().users.usr_priya).toEqual(saved);
  });

  it("refuses a role outside the list with a 422, and writes nothing", async () => {
    const { db } = await seededWorld();
    const users = await import("./users");
    const before = db.getState();
    await expect(
      settle(
        users.update("usr_priya", { role: "owner" } as unknown as UserPatch),
      ),
    ).rejects.toMatchObject({
      status: 422,
      code: "INVALID_ROLE",
      field: "role",
      message: "Choose a role from the list.",
    });
    expect(db.getState()).toBe(before);
  });

  it("refuses changing your own role, and writes nothing", async () => {
    const { db } = await seededWorld();
    const users = await import("./users");
    const before = db.getState();
    await expect(
      settle(users.update("usr_jordan", { role: "user" })),
    ).rejects.toMatchObject({
      status: 409,
      code: "CANNOT_CHANGE_OWN_ROLE",
      message: "You can't change your own role.",
    });
    expect(db.getState()).toBe(before);
    // Sending your own role unchanged is not a change.
    const saved = await settle(
      users.update("usr_jordan", { role: "agency_owner", jobTitle: "CEO" }),
    );
    expect(saved).toMatchObject({ role: "agency_owner", jobTitle: "CEO" });
  });

  it("404s an unknown teammate", async () => {
    await seededWorld();
    const users = await import("./users");
    await expect(
      settle(users.update("usr_nope", { role: "user" })),
    ).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
  });
});

describe("api.users.invite() rules", () => {
  const CASEY = {
    firstName: " Casey ",
    lastName: "Lin ",
    email: " casey@northwind.studio ",
    role: "user",
  } as const;

  it("saves the invite trimmed, Pending (no lastSeenAt), in the active location's time zone", async () => {
    const { db } = await seededWorld();
    const users = await import("./users");
    const cache = await import("./cache");
    const location = db.getState().locations[db.getState().locationId]!;
    const before = cache.revisionOf("users");

    const casey = await settle(users.invite({ ...CASEY, jobTitle: "  " }));

    expect(casey).toMatchObject({
      firstName: "Casey",
      lastName: "Lin",
      email: "casey@northwind.studio",
      role: "user",
      isActive: true,
      timezone: location.timezone,
    });
    expect(casey).not.toHaveProperty("lastSeenAt");
    expect(casey).not.toHaveProperty("jobTitle");
    expect(db.getState().users[casey.id]).toEqual(casey);
    expect(cache.revisionOf("users")).toBeGreaterThan(before);
  });

  it("takes the time zone of whichever location is active", async () => {
    const { db } = await seededWorld();
    const users = await import("./users");
    const other = Object.values(db.getState().locations).find(
      (l) => l.timezone !== "America/Los_Angeles",
    )!;
    db.setState({ locationId: other.id });

    const casey = await settle(users.invite(CASEY));

    expect(casey.timezone).toBe(other.timezone);
    expect(casey.timezone).not.toBe("America/Los_Angeles");
  });

  it.each([
    ["firstName", { firstName: " " }, "Enter a first name."],
    ["lastName", { lastName: "" }, "Enter a last name."],
    ["email", { email: "" }, "Enter an email address."],
    [
      "email",
      { email: "casey@" },
      "Enter a valid email address, like name@example.com.",
    ],
    ["role", { role: "owner" }, "Choose a role from the list."],
  ] as const)(
    "refuses a bad %s with a 422 naming it, and stores nothing",
    async (field, patch, message) => {
      const { db } = await seededWorld();
      const users = await import("./users");
      const before = db.getState();
      await expect(
        settle(users.invite({ ...CASEY, ...patch } as InviteDraft)),
      ).rejects.toMatchObject({
        status: 422,
        code: "INVALID_INVITE",
        field,
        message,
      });
      expect(db.getState()).toBe(before);
    },
  );

  it("refuses an email already on the team, whatever its case", async () => {
    const { db } = await seededWorld();
    const users = await import("./users");
    const before = db.getState();
    await expect(
      settle(users.invite({ ...CASEY, email: " Priya@Northwind.Studio" })),
    ).rejects.toMatchObject({
      status: 409,
      code: "EMAIL_TAKEN",
      field: "email",
      message: "That email address already belongs to Priya Nair.",
    });
    expect(db.getState()).toBe(before);
  });
});

describe("api.users.team()", () => {
  it("lists everyone by first name, marks you, and calls the never-signed-in Pending", async () => {
    await seededWorld();
    const users = await import("./users");
    const casey = await settle(
      users.invite({
        firstName: "Casey",
        lastName: "Lin",
        email: "casey@northwind.studio",
        role: "user",
      }),
    );

    const team = await settle(users.team());

    expect(team.map((m) => m.firstName)).toEqual([
      "Aiko",
      "Casey",
      "Jordan",
      "Lena",
      "Marcus",
      "Priya",
      "Sam",
    ]);
    expect(team.filter((m) => m.isYou).map((m) => m.id)).toEqual([
      "usr_jordan",
    ]);
    expect(
      Object.fromEntries(team.map((m) => [m.firstName, m.status])),
    ).toMatchObject({ Casey: "pending", Jordan: "active", Priya: "active" });
    expect(team.find((m) => m.id === casey.id)!.status).toBe("pending");
    expect(team.filter((m) => m.status === "pending")).toHaveLength(1);
  });
});

describe("api.users.removalPreview()", () => {
  it("counts exactly what remove() then moves", async () => {
    const { db, users, casey } = await withCasey();

    const preview = await settle(users.removalPreview(casey.id));
    expect(preview.refusal).toBeUndefined();
    expect(preview.counts).toEqual({
      contacts: 3,
      opportunities: 2,
      tasks: 2,
      conversations: 2,
      appointments: 2,
      calendars: 2,
      smartLists: 1,
      follows: 2,
    });

    const before = db.getState();
    await settle(users.remove(casey.id));
    const after = db.getState();

    // What really changed hands, table by table.
    const moved = <T extends { id: string }>(
      table: (s: typeof before) => Record<string, T>,
      held: (row: T) => boolean,
      now: (row: T) => boolean,
    ) =>
      Object.values(table(before)).filter(
        (row) => held(row) && now(table(after)[row.id]!),
      ).length;
    const c = casey.id;
    const j = "usr_jordan";
    expect({
      contacts: moved(
        (s) => s.contacts,
        (r) => r.ownerId === c,
        (r) => r.ownerId === j,
      ),
      opportunities: moved(
        (s) => s.opportunities,
        (r) => r.ownerId === c,
        (r) => r.ownerId === j,
      ),
      tasks: moved(
        (s) => s.tasks,
        (r) => r.assigneeId === c,
        (r) => r.assigneeId === j,
      ),
      conversations: moved(
        (s) => s.conversations,
        (r) => r.assigneeId === c,
        (r) => r.assigneeId === j,
      ),
      appointments: moved(
        (s) => s.appointments,
        (r) => r.assignedUserId === c,
        (r) => r.assignedUserId === j,
      ),
      calendars: moved(
        (s) => s.calendars,
        (r) => r.teamMemberIds.includes(c),
        (r) => r.teamMemberIds.includes(j) && !r.teamMemberIds.includes(c),
      ),
      smartLists: moved(
        (s) => s.smartLists,
        (r) => r.ownerId === c,
        (r) => r.ownerId === j,
      ),
      follows: moved(
        (s) => s.contacts,
        (r) => r.followers.includes(c),
        (r) => !r.followers.includes(c),
      ),
    }).toEqual(preview.counts);
  });

  it("counts a seeded teammate's records, and says why remove() refuses", async () => {
    const { db } = await seededWorld();
    const users = await import("./users");
    const s = db.getState();
    const owned = Object.values(s.contacts).filter(
      (x) => x.ownerId === "usr_lena",
    ).length;
    expect(owned).toBeGreaterThan(0);

    const preview = await settle(users.removalPreview("usr_lena"));
    const error = await settle(users.remove("usr_lena")).then(
      noRefusal,
      (e: unknown) => e as Error,
    );

    expect(preview.counts.contacts).toBe(owned);
    expect(error).toMatchObject({ code: "NAMED_IN_AUTOMATION" });
    expect(preview.refusal).toBe(error.message);
    expect(db.getState()).toBe(s);
  });

  it.each([
    {
      name: "removing yourself",
      args: (): RemoveArgs => ["usr_jordan"],
      code: "CANNOT_REMOVE_YOURSELF",
    },
    {
      name: "reassigning to the teammate being removed",
      args: (id: string): RemoveArgs => [id, { reassignTo: id }],
      code: "REASSIGN_TO_SELF",
    },
    {
      name: "an unknown teammate to reassign to",
      args: (id: string): RemoveArgs => [id, { reassignTo: "usr_nope" }],
      code: "REASSIGN_TARGET_NOT_FOUND",
    },
    {
      name: "a teammate an automation names",
      args: (): RemoveArgs => ["usr_priya"],
      code: "NAMED_IN_AUTOMATION",
    },
  ])("gives $name the sentence remove() throws", async ({ args, code }) => {
    const { users, casey } = await withCasey();
    const [id, options] = args(casey.id);

    const preview = await settle(users.removalPreview(id, options));
    const error = await settle(users.remove(id, options)).then(
      noRefusal,
      (e: unknown) => e as Error,
    );

    expect(error).toMatchObject({ code });
    expect(preview.refusal).toBe(error.message);
  });

  it("404s an unknown teammate, as remove() does", async () => {
    await seededWorld();
    const users = await import("./users");
    await expect(
      settle(users.removalPreview("usr_nope")),
    ).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
  });

  it("names no raw id when the teammate to reassign to is gone", async () => {
    const { users, casey } = await withCasey();
    const error = await settle(
      users.remove(casey.id, { reassignTo: "usr_nope" }),
    ).then(noRefusal, (e: unknown) => e as Error);
    expect(error.message).not.toContain("usr_nope");
    expect(error.message).toContain("Casey Lin");
  });
});
