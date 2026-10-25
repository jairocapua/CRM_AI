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
