import { describe, expect, it, vi } from "vitest";

import type { DbState } from "../db-state";
import { freshModules, seededWorld } from "../testing";

/**
 * Seeded run history (design "Phase 8b"). Runs are generated against the real
 * registry, so every step a run logs is a node the diagram draws, and every
 * run walks a real path through its automation.
 */

const ANCHOR = "2026-09-08T09:00:00.000Z";

async function world() {
  const { db } = await seededWorld();
  const { AUTOMATIONS, LAYOUTS } = await import("@/lib/automations");
  const state = db.getState();
  const runs = Object.values(state.workflowRuns);
  const slugById = new Map(
    Object.entries(AUTOMATIONS).map(([slug, d]) => [d.id, slug]),
  );
  return { state, runs, AUTOMATIONS, LAYOUTS, slugById };
}

describe("seeded automation runs", () => {
  it("belong to a registry automation and log only nodes from its layout", async () => {
    const { runs, LAYOUTS, slugById } = await world();
    expect(runs.length).toBeGreaterThan(0);

    let steps = 0;
    for (const run of runs) {
      const slug = slugById.get(run.workflowId);
      expect(slug, run.workflowId).toBeDefined();
      const nodeIds = new Set(LAYOUTS[slug!]!.nodes.map((n) => n.id));
      for (const step of run.steps) {
        expect(nodeIds.has(step.nodeId), `${slug}: ${step.nodeId}`).toBe(true);
        steps += 1;
      }
    }
    expect(steps).toBeGreaterThan(runs.length);
  });

  it("walk a real path: from the trigger, each step one edge after the last", async () => {
    const { runs, LAYOUTS, slugById } = await world();
    for (const run of runs) {
      const { edges } = LAYOUTS[slugById.get(run.workflowId)!]!;
      expect(run.steps[0]?.nodeId).toBe("trigger");
      for (let i = 1; i < run.steps.length; i++) {
        const from = run.steps[i - 1]!.nodeId;
        const to = run.steps[i]!.nodeId;
        expect(
          edges.some((e) => e.source === from && e.target === to),
          `${run.workflowId}: ${from} -> ${to}`,
        ).toBe(true);
      }
    }
  });

  it("take both branches of a fork across the history", async () => {
    const { runs } = await world();
    const reached = new Set(
      runs
        .filter((r) => r.workflowId === "wf_speed_to_lead")
        .flatMap((r) => r.steps.map((s) => s.nodeId)),
    );
    expect(reached).toContain("assign_rep");
    expect(reached).toContain("send_audit_email");
  });

  it("end the way their status says", async () => {
    const { runs, LAYOUTS, slugById } = await world();
    for (const run of runs) {
      const layout = LAYOUTS[slugById.get(run.workflowId)!]!;
      const kindOf = (id: string) =>
        layout.nodes.find((n) => n.id === id)!.kind;
      const last = run.steps.at(-1)!;
      const before = run.steps.slice(0, -1);
      const label = `${run.workflowId} ${run.status}`;

      switch (run.status) {
        case "completed":
          expect(kindOf(last.nodeId), label).toBe("end");
          expect(
            run.steps.every((s) => s.status === "ok"),
            label,
          ).toBe(true);
          expect(run.endedAt, label).toBe(last.at);
          expect(run.error, label).toBeUndefined();
          break;
        case "failed":
          expect(last.status, label).toBe("failed");
          expect(last.detail, label).toBeTruthy();
          expect(
            before.every((s) => s.status === "ok"),
            label,
          ).toBe(true);
          expect(run.error, label).toBeTruthy();
          expect(run.endedAt, label).toBe(last.at);
          break;
        case "active":
          expect(run.endedAt, label).toBeUndefined();
          expect(kindOf(last.nodeId), label).toBe("wait");
          expect(
            run.steps.every((s) => s.status === "ok"),
            label,
          ).toBe(true);
          expect(run.error, label).toBeUndefined();
          break;
        case "dropped":
          expect(last.status, label).toBe("skipped");
          expect(last.detail, label).toMatch(/^Stopped: /);
          expect(kindOf(last.nodeId), label).not.toBe("end");
          expect(
            before.every((s) => s.status === "ok"),
            label,
          ).toBe(true);
          expect(run.endedAt, label).toBe(last.at);
          expect(run.error, label).toBeUndefined();
          break;
      }
    }
  });

  it("never say the contact replied when they stopped at a fork, which would have checked that", async () => {
    const { runs, LAYOUTS, slugById } = await world();
    let forkStops = 0;
    for (const run of runs) {
      if (run.status !== "dropped") continue;
      const layout = LAYOUTS[slugById.get(run.workflowId)!]!;
      const last = run.steps.at(-1)!;
      const node = layout.nodes.find((n) => n.id === last.nodeId)!;
      if (node.kind !== "if_else") continue;
      forkStops += 1;
      expect(last.detail, `${run.id} at ${node.id}`).not.toMatch(/replied/i);
      expect(last.detail, `${run.id} at ${node.id}`).toMatch(/^Stopped: /);
    }
    // Not vacuous: Speed to Lead's only wait sits right before its
    // "Replied?" fork, so every run it drops stops there.
    expect(forkStops).toBeGreaterThan(0);
  });

  it("are dated in order, after their contact joined and never after the anchor", async () => {
    const { runs, state } = await world();
    for (const run of runs) {
      const contact = state.contacts[run.contactId];
      expect(contact, run.id).toBeDefined();
      expect(run.startedAt >= contact!.createdAt, run.id).toBe(true);
      expect(run.steps[0]!.at).toBe(run.startedAt);
      for (let i = 1; i < run.steps.length; i++) {
        expect(run.steps[i]!.at >= run.steps[i - 1]!.at, run.id).toBe(true);
      }
      for (const at of [
        run.startedAt,
        run.endedAt,
        ...run.steps.map((s) => s.at),
      ]) {
        if (at !== undefined)
          expect(at <= ANCHOR, `${run.id} ${at}`).toBe(true);
      }
    }
  });

  it("exist for every published automation, never for a draft, and none is in flight on a paused one", async () => {
    const { runs, AUTOMATIONS } = await world();
    const definitions = Object.values(AUTOMATIONS);
    for (const d of definitions) {
      const own = runs.filter((r) => r.workflowId === d.id);
      if (d.status === "published") {
        expect(own.length, d.name).toBeGreaterThan(0);
        expect(
          own.some((r) => r.status === "completed"),
          d.name,
        ).toBe(true);
      }
      if (d.status === "draft") expect(own, d.name).toEqual([]);
      if (d.status === "paused") {
        expect(own.length, d.name).toBeGreaterThan(0);
        expect(
          own.filter((r) => r.status === "active"),
          d.name,
        ).toEqual([]);
      }
    }
    // Guards against a vacuous pass: the registry has all three statuses.
    expect(new Set(definitions.map((d) => d.status))).toEqual(
      new Set(["published", "draft", "paused"]),
    );
  });

  it("cover every run status", async () => {
    const { runs } = await world();
    expect(new Set(runs.map((r) => r.status))).toEqual(
      new Set(["completed", "failed", "active", "dropped"]),
    );
  });

  it("leave something in flight at the anchor on each published automation a team member or event starts", async () => {
    // Contact-created runs start when the contact was created, so they are
    // only in flight if a contact happened to join during the wait.
    const { runs, AUTOMATIONS } = await world();
    const live = Object.values(AUTOMATIONS).filter(
      (d) =>
        d.status === "published" && d.trigger.config.kind !== "contact_created",
    );
    expect(live.length).toBeGreaterThan(0);
    for (const d of live) {
      const active = runs.filter(
        (r) => r.workflowId === d.id && r.status === "active",
      );
      expect(active.length, d.name).toBeGreaterThanOrEqual(2);
    }
  });

  it("stop a paused automation's history at the moment it was paused", async () => {
    const { runs, AUTOMATIONS } = await world();
    const paused = Object.values(AUTOMATIONS).filter(
      (d) => d.status === "paused",
    );
    expect(paused.length).toBeGreaterThan(0);
    for (const d of paused) {
      const own = runs.filter((r) => r.workflowId === d.id);
      expect(
        own.every((r) => r.endedAt !== undefined),
        d.name,
      ).toBe(true);
      // Runs still waiting when it was paused were dropped right then.
      const pausedAt = own.flatMap((r) =>
        r.steps
          .filter((s) => s.detail === "Stopped: the automation was paused")
          .map((s) => s.at),
      );
      expect(pausedAt.length, d.name).toBeGreaterThan(0);
      expect(new Set(pausedAt).size, d.name).toBe(1);
      expect(
        own.every((r) => r.endedAt! <= pausedAt[0]!),
        d.name,
      ).toBe(true);
      expect(pausedAt[0]! < ANCHOR, d.name).toBe(true);
    }
  });

  it("enrol a contact once when the automation does not allow it twice", async () => {
    const { runs, AUTOMATIONS } = await world();
    let checked = 0;
    for (const d of Object.values(AUTOMATIONS)) {
      if (d.settings.allowMultipleEnrollment) continue;
      const contactIds = runs
        .filter((r) => r.workflowId === d.id)
        .map((r) => r.contactId);
      expect(new Set(contactIds).size, d.name).toBe(contactIds.length);
      checked += contactIds.length;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("start a contact-created automation when the contact was created", async () => {
    const { runs, state } = await world();
    const nurture = runs.filter((r) => r.workflowId === "wf_new_lead_nurture");
    expect(nurture.length).toBeGreaterThan(0);
    for (const run of nurture) {
      expect(run.startedAt).toBe(state.contacts[run.contactId]!.createdAt);
    }
  });
});

describe("buildDb() call order", () => {
  /**
   * Every table seeded before `last` (the tables in `LATER` from `last` on
   * are left out), with nanoid ids (which differ on every build) blanked out,
   * so two builds compare by content.
   */
  const ID = /^[a-z]+_[0-9a-z]{12}$/;
  /** The tables seeded at the end of `buildDb()`, in call order. */
  const LATER = ["workflowRuns", "automationRequests"] as const;
  const content = (state: DbState, last: (typeof LATER)[number]) =>
    JSON.stringify(
      Object.entries(state)
        .filter(
          ([name]) =>
            !LATER.slice(LATER.indexOf(last)).includes(
              name as (typeof LATER)[number],
            ),
        )
        .map(([name, value]) => [
          name,
          value && typeof value === "object" ? Object.values(value) : value,
        ]),
      (_, value: unknown) =>
        typeof value === "string" && ID.test(value) ? "#" : value,
    );

  it("seeds runs last, so no earlier table changes with or without them", async () => {
    await freshModules();
    const withRuns = (await import("./index")).buildDb();

    await freshModules();
    vi.doMock("./runs", () => ({ seedWorkflowRuns: () => [] }));
    try {
      const withoutRuns = (await import("./index")).buildDb();
      expect(Object.keys(withRuns.workflowRuns).length).toBeGreaterThan(0);
      expect(withoutRuns.workflowRuns).toEqual({});
      expect(content(withoutRuns, "workflowRuns")).toBe(
        content(withRuns, "workflowRuns"),
      );
    } finally {
      vi.doUnmock("./runs");
    }
  });

  it("seeds automation requests after the runs, so no earlier table changes with or without them", async () => {
    await freshModules();
    const withRequests = (await import("./index")).buildDb();

    await freshModules();
    vi.doMock("./requests", () => ({ seedAutomationRequests: () => [] }));
    try {
      const withoutRequests = (await import("./index")).buildDb();
      expect(
        Object.keys(withRequests.automationRequests).length,
      ).toBeGreaterThan(0);
      expect(withoutRequests.automationRequests).toEqual({});
      // The runs are among the earlier tables here.
      expect(Object.keys(withoutRequests.workflowRuns).length).toBe(
        Object.keys(withRequests.workflowRuns).length,
      );
      expect(content(withoutRequests, "automationRequests")).toBe(
        content(withRequests, "automationRequests"),
      );
    } finally {
      vi.doUnmock("./requests");
    }
  });
});
