import { describe, expect, it } from "vitest";

import type { AutomationRequest } from "@/types";
import { seededWorld, setDemoNow, settle } from "@/lib/mock/testing";

/**
 * `api.automationRequests` (design "Phase 8b — API and UI"): staff ask the
 * developer for an automation, and the developer answers by moving its
 * status. Shaped like `smart-lists.ts`; mutations may fail and invalidate.
 */

const ANCHOR = "2026-09-08T09:00:00.000Z";

async function world() {
  const { db } = await seededWorld();
  const api = await import("./automation-requests");
  const cache = await import("./cache");
  const http = await import("./http");
  const requests = () => Object.values(db.getState().automationRequests);
  return { db, api, cache, http, requests };
}

const DRAFT = {
  title: "Thank new customers",
  problem: "We forget to say thanks after the first payment.",
  trigger: "A deal is marked won.",
  outcome: "Send a thank-you email from the account owner.",
  priority: "normal",
} as const;

describe("list()", () => {
  it("returns every request, newest first", async () => {
    const { api, requests } = await world();
    const page = await settle(api.list());
    expect(page.total).toBe(requests().length);
    expect(page.rows.length).toBe(requests().length);
    const times = page.rows.map((r) => r.createdAt);
    expect(times).toEqual([...times].sort().reverse());
    // Not vacuous: the seed's creation times all differ.
    expect(new Set(times).size).toBe(times.length);
  });

  it("pages and takes another sort", async () => {
    const { api } = await world();
    const all = (await settle(api.list())).rows.map((r) => r.id);

    const second = await settle(api.list({ page: 2, pageSize: 2 }));
    expect(second.rows.map((r) => r.id)).toEqual(all.slice(2, 4));
    expect(second.total).toBe(all.length);
    expect(second.pageCount).toBe(Math.ceil(all.length / 2));

    const oldest = await settle(
      api.list({ sort: [{ field: "createdAt", desc: false }] }),
    );
    expect(oldest.rows.map((r) => r.id)).toEqual([...all].reverse());
  });

  it("names a shipped request's automation, read from the registry", async () => {
    const { api } = await world();
    const { AUTOMATIONS } = await import("@/lib/automations");
    const nameById = new Map(
      Object.values(AUTOMATIONS).map((d) => [d.id, d.name]),
    );
    const { rows } = await settle(api.list());
    const shipped = rows.filter((r) => r.status === "shipped");
    expect(shipped.length).toBeGreaterThan(0);
    for (const row of shipped) {
      expect(row.shippedWorkflowName).toBe(
        nameById.get(row.shippedWorkflowId!),
      );
    }
    for (const row of rows.filter((r) => r.status !== "shipped")) {
      expect(row.shippedWorkflowName).toBeUndefined();
    }
  });

  it("leaves the name unset when the shipped automation is gone", async () => {
    const { api, db, requests } = await world();
    const shipped = requests().find((r) => r.status === "shipped")!;
    db.setState((s) => ({
      automationRequests: {
        ...s.automationRequests,
        [shipped.id]: { ...shipped, shippedWorkflowId: "wf_gone" },
      },
    }));
    const row = (await settle(api.list())).rows.find(
      (r) => r.id === shipped.id,
    )!;
    expect(row.shippedWorkflowId).toBe("wf_gone");
    expect(row.shippedWorkflowName).toBeUndefined();
  });
});

describe("get()", () => {
  it("returns one request", async () => {
    const { api, requests } = await world();
    const first = requests()[0]!;
    expect(await settle(api.get(first.id))).toMatchObject(first);
  });

  it("is a 404 for an unknown id", async () => {
    const { api } = await world();
    await expect(settle(api.get("req_nope"))).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    });
  });
});

describe("create()", () => {
  it("files a request as the current user, at the demo clock's now", async () => {
    const { api, db, requests } = await world();
    const before = requests().length;
    setDemoNow("2026-09-10T12:00:00.000Z");

    const created = await settle(
      api.create({
        ...DRAFT,
        title: "  Thank new customers  ",
        priority: "high",
      }),
    );

    expect(created).toMatchObject({
      title: "Thank new customers",
      problem: DRAFT.problem,
      trigger: DRAFT.trigger,
      outcome: DRAFT.outcome,
      priority: "high",
      status: "requested",
      createdBy: db.getState().currentUserId,
    });
    // Stamped by the demo clock when the write lands, after the latency.
    expect(created.createdAt >= "2026-09-10T12:00:00.000Z").toBe(true);
    expect(created.createdAt <= "2026-09-10T12:00:01.000Z").toBe(true);
    expect(created.updatedAt).toBe(created.createdAt);
    expect(created.createdBy).toBe("usr_jordan");
    expect(created.id).toMatch(/^req_/);
    expect(requests()).toHaveLength(before + 1);
    expect(db.getState().automationRequests[created.id]).toEqual(created);
    // It lists first: newest first.
    expect((await settle(api.list())).rows[0]!.id).toBe(created.id);
  });

  it("ignores a status, reply or shipped automation in the draft", async () => {
    const { api } = await world();
    const created = await settle(
      api.create({
        ...DRAFT,
        status: "shipped",
        notes: "Done!",
        shippedWorkflowId: "wf_speed_to_lead",
      } as Parameters<typeof api.create>[0]),
    );
    expect(created.status).toBe("requested");
    expect(created.notes).toBeUndefined();
    expect(created.shippedWorkflowId).toBeUndefined();
  });

  it("leaves createdBy unset when the current user is gone", async () => {
    const { api, db } = await world();
    db.setState({ currentUserId: "usr_gone" });
    const created = await settle(api.create(DRAFT));
    expect(created.createdBy).toBeUndefined();
  });

  it.each(["title", "problem", "trigger", "outcome"] as const)(
    "rejects a blank %s with a 422 naming the field, and writes nothing",
    async (field) => {
      const { api, requests } = await world();
      const before = requests();
      await expect(
        settle(api.create({ ...DRAFT, [field]: "  \n " })),
      ).rejects.toMatchObject({
        status: 422,
        code: "INVALID_AUTOMATION_REQUEST",
        field,
      });
      await expect(
        settle(
          api.create({ ...DRAFT, [field]: undefined } as unknown as Parameters<
            typeof api.create
          >[0]),
        ),
      ).rejects.toMatchObject({ status: 422, field });
      expect(requests()).toEqual(before);
    },
  );

  it("rejects an unknown priority with a 422", async () => {
    const { api, requests } = await world();
    const before = requests();
    await expect(
      settle(
        api.create({ ...DRAFT, priority: "urgent" } as unknown as Parameters<
          typeof api.create
        >[0]),
      ),
    ).rejects.toMatchObject({ status: 422, field: "priority" });
    expect(requests()).toEqual(before);
  });

  it("says what is wrong in a sentence", async () => {
    const { api } = await world();
    await expect(
      settle(api.create({ ...DRAFT, title: "" })),
    ).rejects.toMatchObject({ message: "Title: Give the request a title." });
  });

  it("invalidates the requests", async () => {
    const { api, cache } = await world();
    const before = cache.revisionOf("automationRequests");
    await settle(api.create(DRAFT));
    expect(cache.revisionOf("automationRequests")).toBe(before + 1);
  });

  it("can fail like any mutation, writing nothing", async () => {
    const { api, http, requests } = await world();
    const before = requests();
    http.setTuning({ failureRate: 1 });
    await expect(settle(api.create(DRAFT))).rejects.toMatchObject({
      status: 503,
      code: "MOCK_FAILURE",
    });
    expect(requests()).toEqual(before);
  });
});

describe("setStatus()", () => {
  async function withRequest(status: AutomationRequest["status"]) {
    const w = await world();
    const request = w.requests().find((r) => r.status === status)!;
    expect(request, status).toBeDefined();
    return { ...w, request };
  }

  it("moves a request on with the developer's reply", async () => {
    const { api, request } = await withRequest("requested");
    setDemoNow("2026-09-11T08:00:00.000Z");
    const next = await settle(
      api.setStatus(request.id, "in_review", { notes: "  Looking at it.  " }),
    );
    expect(next).toMatchObject({
      id: request.id,
      title: request.title,
      createdAt: request.createdAt,
      createdBy: request.createdBy,
      status: "in_review",
      notes: "Looking at it.",
    });
    expect(next.updatedAt >= "2026-09-11T08:00:00.000Z").toBe(true);
    expect(next.updatedAt <= "2026-09-11T08:00:01.000Z").toBe(true);
  });

  it("keeps the reply when none is given, and drops a blank one", async () => {
    const { api, request } = await withRequest("declined");
    expect(request.notes).toBeTruthy();
    const kept = await settle(api.setStatus(request.id, "in_review"));
    expect(kept.notes).toBe(request.notes);
    const dropped = await settle(
      api.setStatus(request.id, "in_review", { notes: "  " }),
    );
    expect(dropped.notes).toBeUndefined();
  });

  it("ships a request with a real automation", async () => {
    const { api, request, db } = await withRequest("in_review");
    const next = await settle(
      api.setStatus(request.id, "shipped", {
        shippedWorkflowId: "wf_speed_to_lead",
        notes: "Shipped as Speed to Lead.",
      }),
    );
    expect(next.status).toBe("shipped");
    expect(next.shippedWorkflowId).toBe("wf_speed_to_lead");
    expect(db.getState().automationRequests[request.id]).toEqual(next);
  });

  it("refuses to ship without an automation, or with one that does not exist", async () => {
    const { api, request, db } = await withRequest("in_review");
    for (const shippedWorkflowId of [undefined, "", "wf_gone"]) {
      await expect(
        settle(api.setStatus(request.id, "shipped", { shippedWorkflowId })),
        String(shippedWorkflowId),
      ).rejects.toMatchObject({ status: 422, field: "shippedWorkflowId" });
    }
    // Each says which: none named, or one that does not exist.
    await expect(
      settle(api.setStatus(request.id, "shipped")),
    ).rejects.toMatchObject({
      message: "Shipped automation: Name the automation that shipped.",
    });
    await expect(
      settle(
        api.setStatus(request.id, "shipped", { shippedWorkflowId: "wf_gone" }),
      ),
    ).rejects.toMatchObject({
      message: "Shipped automation: No automation has this id.",
    });
    expect(db.getState().automationRequests[request.id]).toEqual(request);
  });

  it("refuses an automation on a request that is not shipped", async () => {
    const { api, request } = await withRequest("requested");
    await expect(
      settle(
        api.setStatus(request.id, "declined", {
          shippedWorkflowId: "wf_speed_to_lead",
        }),
      ),
    ).rejects.toMatchObject({ status: 422, field: "shippedWorkflowId" });
  });

  it("drops the automation when a shipped request moves back", async () => {
    const { api, request } = await withRequest("shipped");
    expect(request.shippedWorkflowId).toBeTruthy();
    const next = await settle(api.setStatus(request.id, "in_review"));
    expect(next.status).toBe("in_review");
    expect(next.shippedWorkflowId).toBeUndefined();
  });

  it("rejects an unknown status with a 422 and an unknown request with a 404", async () => {
    const { api, request } = await withRequest("requested");
    await expect(
      settle(
        api.setStatus(
          request.id,
          "building" as unknown as AutomationRequest["status"],
        ),
      ),
    ).rejects.toMatchObject({ status: 422, field: "status" });
    await expect(
      settle(api.setStatus("req_nope", "in_review")),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("invalidates the requests", async () => {
    const { api, cache, request } = await withRequest("requested");
    const before = cache.revisionOf("automationRequests");
    await settle(api.setStatus(request.id, "declined", { notes: "No." }));
    expect(cache.revisionOf("automationRequests")).toBe(before + 1);
  });
});

describe("remove()", () => {
  it("deletes a request and invalidates the requests", async () => {
    const { api, cache, requests } = await world();
    const [first, ...rest] = requests();
    const before = cache.revisionOf("automationRequests");
    await settle(api.remove(first!.id));
    expect(requests()).toEqual(rest);
    expect(cache.revisionOf("automationRequests")).toBe(before + 1);
    await expect(settle(api.get(first!.id))).rejects.toMatchObject({
      status: 404,
    });
  });

  it("is a 404 for an unknown id", async () => {
    const { api, requests } = await world();
    const before = requests();
    await expect(settle(api.remove("req_nope"))).rejects.toMatchObject({
      status: 404,
    });
    expect(requests()).toEqual(before);
  });
});

describe("seeded requests", () => {
  it("cover every status, from real users, dated no later than the anchor", async () => {
    const { requests, db } = await world();
    const rows = requests();
    expect(rows.length).toBeGreaterThanOrEqual(5);
    expect(rows.length).toBeLessThanOrEqual(7);
    expect(new Set(rows.map((r) => r.status))).toEqual(
      new Set(["requested", "in_review", "shipped", "declined"]),
    );
    const users = db.getState().users;
    for (const r of rows) {
      expect(users[r.createdBy!], r.title).toBeDefined();
      expect(r.createdAt <= r.updatedAt, r.title).toBe(true);
      expect(r.updatedAt <= ANCHOR, r.title).toBe(true);
      for (const text of [r.title, r.problem, r.trigger, r.outcome]) {
        expect(text.trim(), r.title).not.toBe("");
      }
    }
  });

  it("answer every shipped and declined request, and ship only to real automations", async () => {
    const { requests } = await world();
    const { AUTOMATIONS } = await import("@/lib/automations");
    const ids = new Set(Object.values(AUTOMATIONS).map((d) => d.id));
    for (const r of requests()) {
      if (r.status === "shipped") {
        expect(ids.has(r.shippedWorkflowId!), r.title).toBe(true);
      } else {
        expect(r.shippedWorkflowId, r.title).toBeUndefined();
      }
      if (r.status === "shipped" || r.status === "declined") {
        expect(r.notes?.trim(), r.title).toBeTruthy();
      }
      if (r.status === "requested") expect(r.notes, r.title).toBeUndefined();
    }
  });
});
