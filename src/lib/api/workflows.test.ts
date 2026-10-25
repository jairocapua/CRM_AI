import { describe, expect, it } from "vitest";

import type { Workflow, WorkflowNode, WorkflowNodeConfig } from "@/types";
import { seededWorld, settle } from "@/lib/mock/testing";

/**
 * Automations are code (`src/lib/automations/`), but tags are seeded rows
 * whose ids are nanoids that change on every reseed, and users get nanoid ids
 * once a real backend (or `api.users.invite()`) creates them. Definitions name
 * both by stable key (tag name, user slug) and `api.workflows` resolves those
 * keys to ids at read time. These tests pin that resolution.
 */

/** Every tag id and user id a resolved workflow points at. */
function references(workflow: Workflow) {
  const tagIds: string[] = [];
  const userIds: string[] = [];
  if (workflow.ownerId) userIds.push(workflow.ownerId);
  for (const node of workflow.nodes) {
    const c: WorkflowNodeConfig = node.config;
    if (c.kind === "tag_added" || c.kind === "add_tag")
      tagIds.push(...c.tagIds);
    if (c.kind === "remove_tag") tagIds.push(...c.tagIds);
    if (c.kind === "assign_user" || c.kind === "internal_notification")
      userIds.push(...c.userIds);
    if (c.kind === "send_email" && c.fromUserId) userIds.push(c.fromUserId);
    if (c.kind === "create_task" && c.assigneeId) userIds.push(c.assigneeId);
  }
  return { tagIds, userIds };
}

const sorted = (values: (string | undefined)[]) =>
  [...values].sort((a, b) => (a ?? "").localeCompare(b ?? ""));

/** Every stable key a definition names, sorted. */
async function keysOf(slugKey: string) {
  const { AUTOMATIONS } = await import("@/lib/automations");
  const { referencedKeys } = await import("@/lib/automations/keys");
  const { tags, users } = referencedKeys(AUTOMATIONS[slugKey]!);
  return { tags: sorted(tags), users: sorted(users) };
}

/** A freshly seeded world, read back through api.workflows.list(). */
async function reseededWorld() {
  const { db } = await seededWorld();
  const workflows = await import("./workflows");
  const listed = await settle(workflows.list());
  return { state: db.getState(), listed };
}

describe("api.workflows", () => {
  it("exports reads only", async () => {
    const workflows = await import("./workflows");
    expect(Object.keys(workflows).sort()).toEqual(["get", "list", "listRuns"]);
  });

  it("lists every registry automation, by folder then name", async () => {
    const { listed } = await reseededWorld();
    const { AUTOMATIONS } = await import("@/lib/automations");

    expect(listed).toHaveLength(Object.keys(AUTOMATIONS).length);
    expect(listed.map((w) => w.id).sort()).toEqual(
      Object.values(AUTOMATIONS)
        .map((d) => d.id)
        .sort(),
    );
    const byFolderThenName = [...listed].sort(
      (a, b) =>
        (a.folder ?? "").localeCompare(b.folder ?? "") ||
        a.name.localeCompare(b.name),
    );
    expect(listed.map((w) => w.id)).toEqual(byFolderThenName.map((w) => w.id));
  });

  it("gets one automation by its wf_* id and 404s an unknown one", async () => {
    await seededWorld();
    const workflows = await import("./workflows");

    const speed = await settle(workflows.get("wf_speed_to_lead"));
    expect(speed.name).toBe("Speed to Lead");
    expect(speed.nodes.map((n) => n.id)).toContain("trigger");

    await expect(settle(workflows.get("wf_nope"))).rejects.toMatchObject({
      name: "ApiError",
      status: 404,
    });
  });

  it("carries each automation's registry key as its slug, for the source path", async () => {
    const { listed } = await reseededWorld();
    const { AUTOMATIONS } = await import("@/lib/automations");
    for (const [slugKey, definition] of Object.entries(AUTOMATIONS)) {
      expect(listed.find((w) => w.id === definition.id)?.slug).toBe(slugKey);
    }
    const workflows = await import("./workflows");
    const speed = await settle(workflows.get("wf_speed_to_lead"));
    expect(speed.slug).toBe("speed-to-lead");
  });

  it("resolves every tag and user reference after two reseeds with different ids", async () => {
    const first = await reseededWorld();
    const second = await reseededWorld();

    // The two worlds really do have different tag ids, so a definition that
    // stored ids would break on the second.
    const firstTagIds = Object.keys(first.state.tags);
    const secondTagIds = Object.keys(second.state.tags);
    expect(firstTagIds.length).toBeGreaterThan(0);
    expect(firstTagIds).toHaveLength(secondTagIds.length);
    expect(firstTagIds.filter((id) => secondTagIds.includes(id))).toEqual([]);

    const { AUTOMATIONS } = await import("@/lib/automations");
    let tagRefs = 0;
    let userRefs = 0;
    for (const { state, listed } of [first, second]) {
      for (const [slugKey, definition] of Object.entries(AUTOMATIONS)) {
        const workflow = listed.find((w) => w.id === definition.id)!;
        const keys = await keysOf(slugKey);
        const { tagIds, userIds } = references(workflow);

        // Nothing dropped or invented: one resolved id per key.
        expect(sorted(tagIds.map((id) => state.tags[id]?.name))).toEqual(
          keys.tags,
        );
        expect(sorted(userIds.map((id) => state.users[id]?.slug))).toEqual(
          keys.users,
        );
        tagRefs += tagIds.length;
        userRefs += userIds.length;
      }
    }
    // Guards against a vacuous pass: the registry does use both kinds of key.
    expect(tagRefs).toBeGreaterThan(0);
    expect(userRefs).toBeGreaterThan(0);
  });

  it("resolves users by slug, not by id", async () => {
    // Seeded user ids happen to be stable (usr_jordan); invited users' and a
    // real backend's are not. Re-key every user: references must still land.
    const { db } = await seededWorld();
    db.setState((s) => ({
      users: Object.fromEntries(
        Object.values(s.users).map((u) => {
          const id = `usr_rekeyed_${u.slug}`;
          return [id, { ...u, id }];
        }),
      ),
    }));
    const workflows = await import("./workflows");
    const listed = await settle(workflows.list());
    const state = db.getState();

    const { AUTOMATIONS } = await import("@/lib/automations");
    let userRefs = 0;
    for (const [slugKey, definition] of Object.entries(AUTOMATIONS)) {
      const workflow = listed.find((w) => w.id === definition.id)!;
      const { userIds } = references(workflow);
      const keys = await keysOf(slugKey);
      expect(userIds.every((id) => id.startsWith("usr_rekeyed_"))).toBe(true);
      expect(sorted(userIds.map((id) => state.users[id]?.slug))).toEqual(
        keys.users,
      );
      userRefs += userIds.length;
    }
    expect(userRefs).toBeGreaterThan(0);
  });

  it("serves the registry's layout: positions, sizes, edges and end nodes", async () => {
    const { listed } = await reseededWorld();
    const { AUTOMATIONS } = await import("@/lib/automations");
    const { layout } = await import("@/lib/automations/layout");

    const geometry = (n: Omit<WorkflowNode, "config">) => [
      n.id,
      n.kind,
      n.category,
      n.label,
      n.position,
      n.width,
      n.height,
    ];
    for (const definition of Object.values(AUTOMATIONS)) {
      const workflow = listed.find((w) => w.id === definition.id)!;
      const laidOut = layout(definition);
      expect(workflow.nodes.map(geometry), definition.name).toEqual(
        laidOut.nodes.map(geometry),
      );
      expect(workflow.edges, definition.name).toEqual(laidOut.edges);
      expect(
        workflow.nodes.filter((n) => n.kind === "end").length,
        definition.name,
      ).toBeGreaterThan(0);
    }

    // Speed to Lead's fork puts its two branches side by side.
    const speed = listed.find((w) => w.id === "wf_speed_to_lead")!;
    const at = (id: string) => speed.nodes.find((n) => n.id === id)!.position;
    expect(at("assign_rep").y).toBe(at("send_audit_email").y);
    expect(at("assign_rep").x).toBeLessThan(at("send_audit_email").x);
    expect(speed.edges.find((e) => e.target === "assign_rep")).toMatchObject({
      source: "replied",
      sourceHandle: "b_replied",
      label: "Replied",
    });
  });

  it("returns copies the caller may change, never the frozen registry", async () => {
    await seededWorld();
    const workflows = await import("./workflows");
    const first = await settle(workflows.get("wf_speed_to_lead"));
    const node = first.nodes[0]!;
    expect(Object.isFrozen(node)).toBe(false);
    expect(Object.isFrozen(node.position)).toBe(false);
    expect(Object.isFrozen(node.config)).toBe(false);
    expect(Object.isFrozen(first.edges[0])).toBe(false);
    node.position.x += 500;

    const second = await settle(workflows.get("wf_speed_to_lead"));
    expect(second.nodes[0]!.position.x).toBe(node.position.x - 500);
  });

  it("drops a reference whose tag no longer exists instead of inventing an id", async () => {
    const { db } = await seededWorld();
    const newsletter = Object.values(db.getState().tags).find(
      (t) => t.name === "Newsletter",
    )!;
    db.setState((s) => {
      const tags = { ...s.tags };
      delete tags[newsletter.id];
      return { tags };
    });
    const workflows = await import("./workflows");
    const nurture = await settle(workflows.get("wf_new_lead_nurture"));
    const addTag = nurture.nodes.find((n) => n.config.kind === "add_tag")!;
    expect(addTag.config).toMatchObject({ kind: "add_tag", tagIds: [] });
  });

  it("carries no run counters: run history is the only source of counts", async () => {
    const { listed } = await reseededWorld();
    for (const workflow of listed) {
      expect(workflow, workflow.name).not.toHaveProperty("stats");
      for (const node of workflow.nodes) {
        expect(node, `${workflow.name} ${node.id}`).not.toHaveProperty("stats");
      }
    }
  });
});

describe("api.workflows.listRuns()", () => {
  async function runsWorld() {
    const { db } = await seededWorld();
    const workflows = await import("./workflows");
    return { state: db.getState(), workflows };
  }

  it("returns only the given automation's runs, newest first", async () => {
    const { state, workflows } = await runsWorld();
    const all = Object.values(state.workflowRuns);
    const own = all.filter((r) => r.workflowId === "wf_speed_to_lead");
    // Not vacuous: other automations have runs too.
    expect(own.length).toBeGreaterThan(1);
    expect(all.length).toBeGreaterThan(own.length);

    const page = await settle(workflows.listRuns("wf_speed_to_lead"));

    expect(page.total).toBe(own.length);
    expect(page.pageCount).toBe(1);
    expect(page.rows.every((r) => r.workflowId === "wf_speed_to_lead")).toBe(
      true,
    );
    expect(page.rows.map((r) => r.id).sort()).toEqual(
      own.map((r) => r.id).sort(),
    );
    const starts = page.rows.map((r) => r.startedAt);
    expect(starts).toEqual([...starts].sort().reverse());
  });

  it("pages through the runs", async () => {
    const { workflows } = await runsWorld();
    const everything = await settle(workflows.listRuns("wf_speed_to_lead"));
    const second = await settle(
      workflows.listRuns("wf_speed_to_lead", { page: 2, pageSize: 5 }),
    );

    expect(everything.total).toBeGreaterThan(5);
    expect(second.total).toBe(everything.total);
    expect(second.page).toBe(2);
    expect(second.pageSize).toBe(5);
    expect(second.pageCount).toBe(Math.ceil(everything.total / 5));
    expect(second.rows.map((r) => r.id)).toEqual(
      everything.rows.slice(5, 10).map((r) => r.id),
    );
  });

  it("filters within the automation's runs", async () => {
    const { workflows } = await runsWorld();
    const failed = await settle(
      workflows.listRuns("wf_speed_to_lead", {
        filter: {
          id: "fg",
          combinator: "and",
          conditions: [
            { id: "fc", field: "status", operator: "eq", value: "failed" },
          ],
        },
      }),
    );
    expect(failed.rows.every((r) => r.status === "failed")).toBe(true);
    expect(failed.rows.every((r) => r.workflowId === "wf_speed_to_lead")).toBe(
      true,
    );
  });

  it("names each run's contact at read time, never on the stored run", async () => {
    const { db } = await seededWorld();
    const workflows = await import("./workflows");
    const page = await settle(workflows.listRuns("wf_speed_to_lead"));
    expect(page.rows.length).toBeGreaterThan(1);

    const { contacts, workflowRuns } = db.getState();
    for (const row of page.rows) {
      const contact = contacts[row.contactId]!;
      expect(row.contactName, row.id).toBe(
        `${contact.firstName} ${contact.lastName}`,
      );
      // Joined on the way out: the store keeps only the id.
      expect(workflowRuns[row.id], row.id).not.toHaveProperty("contactName");
    }

    // A renamed contact reads with the new name on the next read.
    const first = page.rows[0]!;
    db.setState((s) => ({
      contacts: {
        ...s.contacts,
        [first.contactId]: {
          ...s.contacts[first.contactId]!,
          firstName: "Renamed",
          lastName: "Person",
        },
      },
    }));
    const again = await settle(workflows.listRuns("wf_speed_to_lead"));
    expect(again.rows.find((r) => r.id === first.id)?.contactName).toBe(
      "Renamed Person",
    );
  });

  it("leaves the contact name out when the contact is gone, never an id", async () => {
    const { db } = await seededWorld();
    const workflows = await import("./workflows");
    const before = await settle(workflows.listRuns("wf_speed_to_lead"));
    const orphan = before.rows[0]!;
    db.setState((s) => {
      const contacts = { ...s.contacts };
      delete contacts[orphan.contactId];
      return { contacts };
    });

    const after = await settle(workflows.listRuns("wf_speed_to_lead"));
    const row = after.rows.find((r) => r.id === orphan.id)!;
    expect(row.contactId).toBe(orphan.contactId);
    expect(row.contactName).toBeUndefined();
    expect(after.rows.filter((r) => r.contactName !== undefined).length).toBe(
      after.rows.length - 1,
    );
  });

  it("gives a draft automation an empty history and 404s an unknown id", async () => {
    const { workflows } = await runsWorld();
    const draft = await settle(workflows.listRuns("wf_birthday_greeting"));
    expect(draft).toMatchObject({ rows: [], total: 0 });

    await expect(settle(workflows.listRuns("wf_nope"))).rejects.toMatchObject({
      name: "ApiError",
      status: 404,
      message: "Workflow wf_nope was not found.",
    });
  });
});
