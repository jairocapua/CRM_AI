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

  it("refuses to withdraw: that is the asker's move, through withdraw()", async () => {
    const { api, request, db } = await withRequest("requested");
    await expect(
      settle(api.setStatus(request.id, "withdrawn")),
    ).rejects.toMatchObject({
      status: 422,
      code: "INVALID_AUTOMATION_REQUEST",
      field: "status",
      message: "Status: Only the teammate who asked can withdraw a request.",
    });
    expect(db.getState().automationRequests[request.id]).toEqual(request);
  });

  it.each([
    ["requested", {}],
    ["in_review", { notes: "Looking at it." }],
    ["shipped", { shippedWorkflowId: "wf_speed_to_lead" }],
    ["declined", { notes: "No." }],
  ] as const)(
    "refuses to move a withdrawn request to %s with a 409, writing nothing",
    async (status, reply) => {
      const w = await world();
      const seeded = w.requests().find((r) => r.status === "requested")!;
      const request: AutomationRequest = { ...seeded, status: "withdrawn" };
      w.db.setState((s) => ({
        automationRequests: { ...s.automationRequests, [request.id]: request },
      }));
      const before = w.cache.revisionOf("automationRequests");
      await expect(
        settle(w.api.setStatus(request.id, status, reply)),
      ).rejects.toMatchObject({
        name: "ApiError",
        status: 409,
        code: "REQUEST_WITHDRAWN",
        message: "This request was withdrawn by the teammate who asked.",
      });
      expect(w.db.getState().automationRequests[request.id]).toEqual(request);
      expect(w.cache.revisionOf("automationRequests")).toBe(before);
    },
  );
});

describe("withdraw()", () => {
  /**
   * A request in `status`, asked by `createdBy`: the current user,
   * "usr_jordan", unless another id is given, or nobody for `null`.
   */
  async function withOwnRequest(
    status: AutomationRequest["status"],
    createdBy: string | null = "usr_jordan",
  ) {
    const w = await world();
    expect(w.db.getState().currentUserId).toBe("usr_jordan");
    const seeded = w.requests().find((r) => r.status === "requested")!;
    const request: AutomationRequest = { ...seeded, status };
    if (createdBy === null) delete request.createdBy;
    else request.createdBy = createdBy;
    w.db.setState((s) => ({
      automationRequests: { ...s.automationRequests, [request.id]: request },
    }));
    return { ...w, request };
  }

  it("marks the asker's own requested request withdrawn, at the demo clock's now", async () => {
    const { api, db, cache, request } = await withOwnRequest("requested");
    const before = cache.revisionOf("automationRequests");
    setDemoNow("2026-09-12T10:00:00.000Z");

    const next = await settle(api.withdraw(request.id));

    expect(next).toEqual({
      ...request,
      status: "withdrawn",
      updatedAt: next.updatedAt,
    });
    expect(next.updatedAt >= "2026-09-12T10:00:00.000Z").toBe(true);
    expect(next.updatedAt <= "2026-09-12T10:00:01.000Z").toBe(true);
    // Kept, not deleted: history stays in the list.
    expect(db.getState().automationRequests[request.id]).toEqual(next);
    expect(cache.revisionOf("automationRequests")).toBe(before + 1);
    const row = (await settle(api.list())).rows.find(
      (r) => r.id === request.id,
    )!;
    expect(row.status).toBe("withdrawn");
    expect(row.canWithdraw).toBe(false);
  });

  it("withdraws a seeded request the current user asked for", async () => {
    const { api, requests } = await world();
    const own = requests().find(
      (r) => r.status === "requested" && r.createdBy === "usr_jordan",
    )!;
    expect(own).toBeDefined();
    expect((await settle(api.withdraw(own.id))).status).toBe("withdrawn");
  });

  it.each([
    ["another teammate", "usr_aiko"],
    ["nobody known", null],
  ] as const)(
    "refuses a request asked by %s with a 403, writing nothing",
    async (_who, createdBy) => {
      const { api, db, cache, request } = await withOwnRequest(
        "requested",
        createdBy,
      );
      const before = cache.revisionOf("automationRequests");
      await expect(settle(api.withdraw(request.id))).rejects.toMatchObject({
        name: "ApiError",
        status: 403,
        code: "NOT_YOUR_REQUEST",
      });
      expect(db.getState().automationRequests[request.id]).toEqual(request);
      expect(cache.revisionOf("automationRequests")).toBe(before);
    },
  );

  it("refuses a request with no asker even when the current user is gone", async () => {
    const { api, db, request } = await withOwnRequest("requested", null);
    db.setState({ currentUserId: "" });
    await expect(settle(api.withdraw(request.id))).rejects.toMatchObject({
      status: 403,
      code: "NOT_YOUR_REQUEST",
    });
  });

  it.each(["in_review", "shipped", "declined", "withdrawn"] as const)(
    "refuses the asker's own %s request with a 409, writing nothing",
    async (status) => {
      const { api, db, cache, request } = await withOwnRequest(status);
      const before = cache.revisionOf("automationRequests");
      await expect(settle(api.withdraw(request.id))).rejects.toMatchObject({
        name: "ApiError",
        status: 409,
        code: "REQUEST_NOT_WITHDRAWABLE",
      });
      expect(db.getState().automationRequests[request.id]).toEqual(request);
      expect(cache.revisionOf("automationRequests")).toBe(before);
    },
  );

  it("says why in a sentence", async () => {
    const other = await withOwnRequest("requested", "usr_aiko");
    await expect(
      settle(other.api.withdraw(other.request.id)),
    ).rejects.toMatchObject({
      message: "Only the teammate who asked can withdraw this request.",
    });
    const moved = await withOwnRequest("in_review");
    await expect(
      settle(moved.api.withdraw(moved.request.id)),
    ).rejects.toMatchObject({
      message:
        "This request can no longer be withdrawn: your developer has already answered it.",
    });
    const withdrawn = await withOwnRequest("withdrawn");
    await expect(
      settle(withdrawn.api.withdraw(withdrawn.request.id)),
    ).rejects.toMatchObject({
      status: 409,
      code: "REQUEST_NOT_WITHDRAWABLE",
      message: "This request is already withdrawn.",
    });
  });

  it("is a 404 for an unknown id", async () => {
    const { api, requests } = await world();
    const before = requests();
    await expect(settle(api.withdraw("req_nope"))).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    });
    expect(requests()).toEqual(before);
  });

  it("can fail like any mutation, writing nothing", async () => {
    const { api, http, cache, requests, request } =
      await withOwnRequest("requested");
    const before = requests();
    const revision = cache.revisionOf("automationRequests");
    http.setTuning({ failureRate: 1 });
    await expect(settle(api.withdraw(request.id))).rejects.toMatchObject({
      status: 503,
      code: "MOCK_FAILURE",
    });
    expect(requests()).toEqual(before);
    expect(cache.revisionOf("automationRequests")).toBe(revision);
  });

  it("takes as long as the other request mutations", async () => {
    const { api, http, request } = await withOwnRequest("requested");
    http.setTuning({ latencyMs: 0, jitter: 0 });
    const started = Date.now();
    await settle(api.withdraw(request.id));
    expect(Date.now() - started).toBeGreaterThanOrEqual(400);
  });
});

describe("canWithdraw", () => {
  it("is true only on the current user's own requests still requested", async () => {
    const { api, db, requests } = await world();
    const currentUserId = db.getState().currentUserId;
    const { rows } = await settle(api.list());
    expect(rows).toHaveLength(requests().length);
    for (const row of rows) {
      expect(row.canWithdraw, row.title).toBe(
        row.status === "requested" && row.createdBy === currentUserId,
      );
    }
    // Not vacuous: the seed has one of each kind of requested request.
    const requested = rows.filter((r) => r.status === "requested");
    expect(requested.map((r) => r.canWithdraw).sort()).toEqual([false, true]);
    // And the asker's other requests, once answered, cannot be withdrawn.
    expect(rows.some((r) => r.status !== "requested" && r.canWithdraw)).toBe(
      false,
    );
  });

  it("follows the status and the asker, and is false with no asker", async () => {
    const { api, db, requests } = await world();
    const own = requests().find(
      (r) => r.status === "requested" && r.createdBy === "usr_jordan",
    )!;
    const rowOf = async () => settle(api.get(own.id));
    expect((await rowOf()).canWithdraw).toBe(true);

    for (const status of ["in_review", "shipped", "declined", "withdrawn"]) {
      db.setState((s) => ({
        automationRequests: {
          ...s.automationRequests,
          [own.id]: { ...own, status } as AutomationRequest,
        },
      }));
      expect((await rowOf()).canWithdraw, status).toBe(false);
    }

    const noAsker: AutomationRequest = { ...own };
    delete noAsker.createdBy;
    db.setState((s) => ({
      automationRequests: { ...s.automationRequests, [own.id]: noAsker },
    }));
    expect((await rowOf()).canWithdraw).toBe(false);

    db.setState((s) => ({
      automationRequests: { ...s.automationRequests, [own.id]: own },
      currentUserId: "usr_aiko",
    }));
    expect((await rowOf()).canWithdraw).toBe(false);
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
