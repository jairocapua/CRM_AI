import { describe, expect, it } from "vitest";

import type { Workflow } from "@/types";
import { AUTOMATIONS, LAYOUTS } from "@/lib/automations";
import { END_HEIGHT, END_WIDTH, Y_STEP } from "@/lib/automations/layout";

import {
  CANVAS_MAX_HEIGHT,
  CANVAS_MIN_HEIGHT,
  FIT_PADDING,
  TARGET_ZOOM,
  branchHandleLeft,
  canvasHeight,
  flowElements,
} from "./automation-flow";
import type { StepNames } from "./automation-steps";

/**
 * The diagram (`automation-graph.tsx`) draws a `Workflow` with React Flow.
 * Turning the Workflow's nodes and edges into React Flow's, and sizing the
 * canvas, are pure functions in `automation-flow.ts`, pinned here.
 */

const NAMES: StepNames = {
  tagNames: new Map(),
  usersById: new Map([
    ["usr_jordan", { firstName: "Jordan", lastName: "Reyes" }],
    ["usr_priya", { firstName: "Priya", lastName: "Nair" }],
  ]),
};

type Graph = Pick<Workflow, "nodes" | "edges">;

/**
 * A registry automation's laid-out graph with its keyed fields swapped for
 * ids, roughly as `api.workflows` returns it (user `x` becomes `usr_x`, a
 * tag's id is its name). Components may not import the mock store, so this
 * stands in for a seeded world; the mapping only needs the shape.
 */
function resolved(slug: string): Graph {
  const { nodes, edges } = LAYOUTS[slug]!;
  return {
    nodes: nodes.map((n) => {
      const {
        users,
        tags,
        fromUser,
        assignee,
        ...rest
      }: Record<string, unknown> = { ...n.config };
      const userId = (s: unknown) => `usr_${String(s)}`;
      const config = {
        ...rest,
        ...(Array.isArray(users) ? { userIds: users.map(userId) } : {}),
        ...(Array.isArray(tags) ? { tagIds: [...tags] } : {}),
        ...(fromUser ? { fromUserId: userId(fromUser) } : {}),
        ...(assignee ? { assigneeId: userId(assignee) } : {}),
      } as Workflow["nodes"][number]["config"];
      return { ...n, config };
    }),
    edges: [...edges],
  };
}

const speedToLead = () => resolved("speed-to-lead");

describe("flowElements()", () => {
  it("makes one React Flow node per Workflow node, at its laid-out box", () => {
    const workflow = speedToLead();
    const { nodes } = flowElements(workflow, NAMES);

    expect(nodes).toHaveLength(9);
    expect(nodes.map((n) => n.id)).toEqual(workflow.nodes.map((n) => n.id));
    for (const [i, n] of nodes.entries()) {
      const source = workflow.nodes[i]!;
      expect(n.position).toEqual(source.position);
      // Fixed dimensions, so fitView and the first paint use the real boxes.
      expect(n.width).toBe(source.width);
      expect(n.height).toBe(source.height);
    }
  });

  it("gives end nodes the pill type and every other node the step type", () => {
    const { nodes } = flowElements(speedToLead(), NAMES);
    const types = Object.fromEntries(nodes.map((n) => [n.id, n.type]));

    expect(types["end:assign_rep"]).toBe("end");
    expect(types["end:send_audit_email"]).toBe("end");
    expect(types["trigger"]).toBe("step");
    expect(types["replied"]).toBe("step");
    expect(nodes.filter((n) => n.type === "end")).toHaveLength(2);
    const end = nodes.find((n) => n.id === "end:assign_rep")!;
    expect([end.width, end.height]).toEqual([END_WIDTH, END_HEIGHT]);
  });

  it("carries each node's kind, category, label and one-line summary", () => {
    const { nodes } = flowElements(speedToLead(), NAMES);
    const byId = new Map(nodes.map((n) => [n.id, n.data]));

    expect(byId.get("trigger")).toMatchObject({
      kind: "form_submitted",
      category: "trigger",
      label: "Form submitted",
      summary: "When a form is submitted: Free Website Audit",
    });
    expect(byId.get("notify_sales")).toMatchObject({
      kind: "internal_notification",
      category: "action",
      label: "Notify sales",
      summary: "Notifies Jordan Reyes and Priya Nair: New audit request",
    });
    expect(byId.get("wait_30_minutes")?.summary).toBe("Waits 30 minutes");
  });

  it("lists a fork's branches, in authored order, as its source handles", () => {
    const { nodes } = flowElements(speedToLead(), NAMES);
    const byId = new Map(nodes.map((n) => [n.id, n.data]));

    expect(byId.get("replied")?.branches).toEqual([
      { id: "b_replied", label: "Replied" },
      { id: "b_silent", label: "No reply" },
    ]);
    expect(byId.get("send_sms")?.branches).toEqual([]);
    expect(byId.get("end:assign_rep")?.branches).toEqual([]);
  });

  it("keeps every edge, with the branch edges' handles and labels", () => {
    const workflow = speedToLead();
    const { edges } = flowElements(workflow, NAMES);

    expect(edges.map((e) => [e.id, e.source, e.target])).toEqual(
      workflow.edges.map((e) => [e.id, e.source, e.target]),
    );
    const replied = edges.find((e) => e.target === "assign_rep")!;
    expect(replied).toMatchObject({
      source: "replied",
      sourceHandle: "b_replied",
      label: "Replied",
    });
    const silent = edges.find((e) => e.target === "send_audit_email")!;
    expect(silent).toMatchObject({
      sourceHandle: "b_silent",
      label: "No reply",
    });
    // A plain edge leaves the node's single, unnamed source handle.
    const plain = edges.find((e) => e.target === "send_sms")!;
    expect(plain.sourceHandle).toBeUndefined();
    expect(plain.label).toBeUndefined();
  });

  it("never animates an edge, even one that asks to be", () => {
    const workflow = speedToLead();
    workflow.edges = workflow.edges.map((e) => ({ ...e, animated: true }));
    const { edges } = flowElements(workflow, NAMES);
    expect(edges.every((e) => e.animated === false)).toBe(true);
  });

  it("names each edge by the steps it joins, not by node ids", () => {
    const { edges } = flowElements(speedToLead(), NAMES);
    const byTarget = new Map(edges.map((e) => [e.target, e.ariaLabel]));

    expect(byTarget.get("send_sms")).toBe("From Notify sales to Send SMS");
    expect(byTarget.get("assign_rep")).toBe(
      "From Replied? to Assign rep, if Replied",
    );
    expect(byTarget.get("end:assign_rep")).toBe("From Assign rep to End");
  });

  it("maps every registry automation without losing a node or edge", () => {
    for (const slug of Object.keys(AUTOMATIONS)) {
      const { nodes, edges } = LAYOUTS[slug]!;
      const flow = flowElements(resolved(slug), NAMES);
      expect(flow.nodes, slug).toHaveLength(nodes.length);
      expect(flow.edges, slug).toHaveLength(edges.length);
      // Every branch edge names a handle its source node draws.
      const handles = new Map(
        flow.nodes.map((n) => [n.id, n.data.branches.map((b) => b.id)]),
      );
      for (const e of flow.edges) {
        if (e.sourceHandle) {
          expect(handles.get(e.source), `${slug} ${e.id}`).toContain(
            e.sourceHandle,
          );
        }
      }
    }
  });
});

describe("branchHandleLeft()", () => {
  it("spreads n handles evenly along the bottom, in order", () => {
    expect(branchHandleLeft(0, 1)).toBe("50%");
    expect(branchHandleLeft(0, 2)).toBe("25%");
    expect(branchHandleLeft(1, 2)).toBe("75%");
    const thirds = [0, 1, 2].map((i) => parseFloat(branchHandleLeft(i, 3)));
    expect(thirds[0]).toBeCloseTo(100 / 6);
    expect(thirds[1]).toBeCloseTo(50);
    expect(thirds[2]).toBeCloseTo(500 / 6);
  });
});

describe("canvasHeight()", () => {
  const box = (y: number, height: number) => ({
    position: { x: 0, y },
    height,
  });

  it("sizes the canvas to show the graph near the target zoom", () => {
    // Four rows: the last box is a 40px end pill on row 3.
    const nodes = [box(0, 78), box(Y_STEP, 78), box(2 * Y_STEP, 78)];
    nodes.push(box(3 * Y_STEP, 40));
    const graph = 3 * Y_STEP + 40;
    expect(canvasHeight(nodes)).toBe(
      Math.round(graph * (1 + FIT_PADDING) * TARGET_ZOOM),
    );
  });

  it("measures from the topmost box, wherever the graph starts", () => {
    expect(canvasHeight([box(500, 78), box(500 + 3 * Y_STEP, 78)])).toBe(
      canvasHeight([box(0, 78), box(3 * Y_STEP, 78)]),
    );
  });

  it("never collapses below the minimum or grows past the maximum", () => {
    expect(canvasHeight([])).toBe(CANVAS_MIN_HEIGHT);
    expect(canvasHeight([box(0, 78)])).toBe(CANVAS_MIN_HEIGHT);
    expect(canvasHeight([box(0, 78), box(40 * Y_STEP, 40)])).toBe(
      CANVAS_MAX_HEIGHT,
    );
  });

  it("gives Speed to Lead a canvas between the bounds", () => {
    const h = canvasHeight(LAYOUTS["speed-to-lead"]!.nodes);
    expect(h).toBeGreaterThanOrEqual(CANVAS_MIN_HEIGHT);
    expect(h).toBeLessThanOrEqual(CANVAS_MAX_HEIGHT);
  });
});
