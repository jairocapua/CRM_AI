import { describe, expect, it } from "vitest";

import type {
  AutomationDefinition,
  BranchStep,
  LinearStep,
  StepList,
} from "@/types";

import { AUTOMATIONS, LAYOUTS } from ".";
import {
  END_HEIGHT,
  END_WIDTH,
  GUTTER,
  NODE_HEIGHT,
  NODE_WIDTH,
  X_PITCH,
  Y_STEP,
  layout,
  type Layout,
  type LayoutNode,
} from "./layout";

const sms = (id: string): LinearStep => ({
  id,
  label: "Send SMS",
  config: { kind: "send_sms", body: "Hi {{contact.first_name}}" },
});

const fork = (id: string, ...branches: StepList[]): BranchStep => ({
  id,
  label: "Replied?",
  config: {
    kind: "if_else",
    branches: branches.map((steps, i) => ({
      id: `${id}_b${i}`,
      label: `Branch ${i + 1}`,
      filter: { id: `${id}_fg${i}`, combinator: "and", conditions: [] },
      steps,
    })),
  },
});

const definition = (steps: StepList): AutomationDefinition => ({
  id: "wf_fixture",
  name: "Fixture",
  description: "A hand-built definition for layout tests.",
  folder: "Tests",
  status: "draft",
  owner: "jordan",
  trigger: { label: "Manual trigger", config: { kind: "manual" } },
  steps,
  settings: { allowMultipleEnrollment: false, stopOnReply: true },
});

/** Builds a definition the types would reject, as a careless edit could. */
const unchecked = (steps: unknown[]) =>
  definition(steps as unknown as StepList);

const node = (l: Layout, id: string): LayoutNode => {
  const found = l.nodes.find((n) => n.id === id);
  if (!found) throw new Error(`no node "${id}"`);
  return found;
};

/** Horizontal centre: React Flow positions a node by its top-left corner. */
const cx = (n: LayoutNode) => n.position.x + n.width / 2;

const overlap = (a: LayoutNode, b: LayoutNode) =>
  a.position.x < b.position.x + b.width &&
  b.position.x < a.position.x + a.width &&
  a.position.y < b.position.y + b.height &&
  b.position.y < a.position.y + a.height;

/** Every pair of boxes that overlap, as "a|b". */
function collisions(l: Layout): string[] {
  const hits: string[] = [];
  l.nodes.forEach((a, i) =>
    l.nodes.slice(i + 1).forEach((b) => {
      if (overlap(a, b)) hits.push(`${a.id}|${b.id}`);
    }),
  );
  return hits;
}

const ends = (l: Layout) => l.nodes.filter((n) => n.kind === "end");
const outgoing = (l: Layout, id: string) =>
  l.edges.filter((e) => e.source === id);
const incoming = (l: Layout, id: string) =>
  l.edges.filter((e) => e.target === id);

describe("layout()", () => {
  it("stacks a linear chain in one column, ending in an end pill", () => {
    const l = layout(definition([sms("a"), sms("b")]));

    expect(l.nodes.map((n) => n.id)).toEqual(["trigger", "a", "b", "end:b"]);
    expect(l.nodes.map((n) => n.position.y)).toEqual([
      0,
      Y_STEP,
      2 * Y_STEP,
      3 * Y_STEP,
    ]);
    // One shared centre line; the leftmost box starts at x = 0.
    expect(new Set(l.nodes.map(cx)).size).toBe(1);
    expect(Math.min(...l.nodes.map((n) => n.position.x))).toBe(0);
    for (const id of ["trigger", "a", "b"]) {
      expect(node(l, id)).toMatchObject({
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      });
    }
    expect(l.edges).toEqual([
      { id: "trigger->a", source: "trigger", target: "a" },
      { id: "a->b", source: "a", target: "b" },
      { id: "b->end:b", source: "b", target: "end:b" },
    ]);
  });

  it("gives every node its category and the trigger its config", () => {
    const l = layout(
      definition([
        sms("a"),
        {
          id: "w",
          label: "Wait 1 day",
          config: { kind: "wait", mode: "duration", amount: 1, unit: "days" },
        },
        fork("f", [sms("b")], [sms("c")]),
      ]),
    );
    expect(
      Object.fromEntries(l.nodes.map((n) => [n.id, [n.kind, n.category]])),
    ).toEqual({
      trigger: ["manual", "trigger"],
      a: ["send_sms", "action"],
      w: ["wait", "logic"],
      f: ["if_else", "logic"],
      b: ["send_sms", "action"],
      "end:b": ["end", "logic"],
      c: ["send_sms", "action"],
      "end:c": ["end", "logic"],
    });
    expect(node(l, "trigger").label).toBe("Manual trigger");
    expect(node(l, "f").config).toEqual({
      kind: "if_else",
      branches: [
        {
          id: "f_b0",
          label: "Branch 1",
          filter: { id: "f_fg0", combinator: "and", conditions: [] },
        },
        {
          id: "f_b1",
          label: "Branch 2",
          filter: { id: "f_fg1", combinator: "and", conditions: [] },
        },
      ],
    });
  });

  it("centres a two-way fork's children on the fork, one pitch apart", () => {
    const l = layout(definition([sms("a"), fork("f", [sms("b")], [sms("c")])]));
    const [f, b, c] = [node(l, "f"), node(l, "b"), node(l, "c")];

    expect(cx(b) + cx(c)).toBe(2 * cx(f));
    expect(cx(c) - cx(b)).toBe(X_PITCH);
    // Exactly one gutter between the two cards.
    expect(c.position.x - (b.position.x + b.width)).toBe(GUTTER);
    expect(b.position.y).toBe(f.position.y + Y_STEP);
    expect(c.position.y).toBe(f.position.y + Y_STEP);
    // The chain above the fork stays on the fork's centre line.
    expect(cx(node(l, "trigger"))).toBe(cx(f));
    expect(cx(node(l, "a"))).toBe(cx(f));

    expect(outgoing(l, "f")).toEqual([
      {
        id: "f->b",
        source: "f",
        target: "b",
        sourceHandle: "f_b0",
        label: "Branch 1",
      },
      {
        id: "f->c",
        source: "f",
        target: "c",
        sourceHandle: "f_b1",
        label: "Branch 2",
      },
    ]);
    // Only a branch's first edge carries the handle.
    expect(outgoing(l, "b")).toEqual([
      { id: "b->end:b", source: "b", target: "end:b" },
    ]);
  });

  it("fans n branches out by subtree span, not by ±1 columns", () => {
    const l = layout(
      definition([fork("f", [sms("b")], [sms("c")], [sms("d")])]),
    );
    const f = cx(node(l, "f"));
    expect(["b", "c", "d"].map((id) => cx(node(l, id)) - f)).toEqual([
      -X_PITCH,
      0,
      X_PITCH,
    ]);
    expect(collisions(l)).toEqual([]);
  });

  it("widens a branch that holds its own fork so its siblings do not collide", () => {
    const l = layout(
      definition([
        fork(
          "outer",
          [sms("p"), fork("inner", [sms("x")], [sms("y")])],
          [sms("z")],
        ),
      ]),
    );
    const at = (id: string) => cx(node(l, id));

    // The inner fork's branch spans two columns, its sibling one, so x, y and
    // z land in three adjacent columns. Fixed ±1/2 offsets would put z half
    // a pitch from y, straight through y's subtree.
    expect(node(l, "x").position.y).toBe(node(l, "z").position.y + 2 * Y_STEP);
    expect(at("y") - at("x")).toBe(X_PITCH);
    expect(at("z") - at("y")).toBe(X_PITCH);
    expect(at("inner")).toBe((at("x") + at("y")) / 2);
    expect(at("p")).toBe(at("inner"));
    // Sibling spans 2 and 1 around the outer fork: centres at -1/2 and +1.
    expect(at("p") - at("outer")).toBe(-X_PITCH / 2);
    expect(at("z") - at("outer")).toBe(X_PITCH);
    // The whole subtree stays clear of z's column.
    const z = node(l, "z");
    for (const id of ["p", "inner", "x", "y", "end:x", "end:y"]) {
      const n = node(l, id);
      expect(n.position.x + n.width, id).toBeLessThanOrEqual(
        z.position.x - GUTTER,
      );
    }
    expect(collisions(l)).toEqual([]);
  });

  it("ends every path in an end pill centred under its parent", () => {
    const l = layout(
      definition([
        fork("outer", [fork("inner", [sms("x")], [sms("y")])], [sms("z")]),
      ]),
    );
    expect(
      ends(l)
        .map((n) => n.id)
        .sort(),
    ).toEqual(["end:x", "end:y", "end:z"]);
    for (const end of ends(l)) {
      const [edge] = incoming(l, end.id);
      const parent = node(l, edge!.source);
      expect(incoming(l, end.id)).toHaveLength(1);
      expect(outgoing(l, end.id)).toEqual([]);
      expect(cx(end)).toBe(cx(parent));
      expect(end.position.y).toBe(parent.position.y + Y_STEP);
      expect(end).toMatchObject({
        width: END_WIDTH,
        height: END_HEIGHT,
        label: "End",
        config: { kind: "end" },
      });
    }
    expect(END_WIDTH).toBeLessThan(NODE_WIDTH);
    expect(END_HEIGHT).toBeLessThan(NODE_HEIGHT);
  });

  it("ends a definition with no steps right after its trigger", () => {
    const l = layout(definition([]));
    expect(l.nodes.map((n) => n.id)).toEqual(["trigger", "end:trigger"]);
    expect(cx(node(l, "end:trigger"))).toBe(cx(node(l, "trigger")));
  });

  it("is deterministic", () => {
    const d = AUTOMATIONS["speed-to-lead"]!;
    expect(layout(d)).toEqual(layout(d));
  });

  describe("on every registry automation", () => {
    const entries = Object.entries(AUTOMATIONS);

    it("draws no two boxes overlapping", () => {
      for (const [slug, d] of entries) {
        expect(collisions(layout(d)), slug).toEqual([]);
      }
    });

    it("ends every leaf in an end node, and only leaves", () => {
      let total = 0;
      for (const [slug, d] of entries) {
        const l = layout(d);
        const leaves = l.nodes.filter((n) => outgoing(l, n.id).length === 0);
        expect(leaves.length, slug).toBeGreaterThan(0);
        expect(
          leaves.every((n) => n.kind === "end"),
          slug,
        ).toBe(true);
        expect(ends(l), slug).toEqual(leaves);
        total += leaves.length;
      }
      // Speed to Lead forks in two; the other seven are single chains.
      expect(ends(layout(AUTOMATIONS["speed-to-lead"]!))).toHaveLength(2);
      expect(total).toBe(entries.length + 1);
    });

    it("keeps node ids unique and every edge between real nodes", () => {
      for (const [slug, d] of entries) {
        const l = layout(d);
        const ids = l.nodes.map((n) => n.id);
        expect(new Set(ids).size, slug).toBe(ids.length);
        for (const e of l.edges) {
          expect(ids, slug).toContain(e.source);
          expect(ids, slug).toContain(e.target);
          expect(e.id).toBe(`${e.source}->${e.target}`);
        }
        // A tree: every node but the trigger has exactly one parent.
        for (const id of ids) {
          expect(incoming(l, id).length, `${slug} / ${id}`).toBe(
            id === "trigger" ? 0 : 1,
          );
        }
      }
    });

    it("is what the registry's LAYOUTS holds", () => {
      for (const [slug, d] of entries) {
        expect(LAYOUTS[slug], slug).toEqual(layout(d));
      }
      expect(Object.keys(LAYOUTS)).toEqual(Object.keys(AUTOMATIONS));
    });
  });

  describe("on a malformed definition", () => {
    it("throws on an empty branch", () => {
      expect(() => layout(definition([fork("f", [sms("a")], [])]))).toThrow(
        'Cannot lay out "Fixture": branch "Branch 2" of "f" has no steps',
      );
    });

    it("throws on an empty branch nested inside a branch", () => {
      expect(() =>
        layout(
          definition([
            fork("outer", [fork("inner", [], [sms("b")])], [sms("c")]),
          ]),
        ),
      ).toThrow('branch "Branch 1" of "inner" has no steps');
    });

    it("throws on a fork with no branches", () => {
      expect(() => layout(definition([fork("f")]))).toThrow(
        'Cannot lay out "Fixture": "f" has no branches',
      );
    });

    it("throws on a repeated node id", () => {
      expect(() => layout(definition([sms("a"), sms("a")]))).toThrow(
        'Cannot lay out "Fixture": node id "a" is used twice',
      );
      expect(() =>
        layout(definition([fork("f", [sms("x")], [sms("x")])])),
      ).toThrow('node id "x" is used twice');
      expect(() => layout(definition([sms("trigger")]))).toThrow(
        'node id "trigger" is used twice',
      );
    });

    it("throws on a branch id repeated within one fork", () => {
      // The diagram keys a fork's source handles by branch id, and each
      // branch edge's sourceHandle names one, so two alike would draw both
      // edges out of one handle.
      const f = fork("f", [sms("a")], [sms("b")], [sms("c")]);
      const [first, second, third] = f.config.branches;
      const repeated: BranchStep = {
        ...f,
        config: {
          ...f.config,
          branches: [first!, second!, { ...third!, id: first!.id }],
        },
      };
      expect(() => layout(definition([repeated]))).toThrow(
        'Cannot lay out "Fixture": branch id "f_b0" is used twice in "f"',
      );
    });

    it("allows the same branch id in two different forks", () => {
      const inner = fork("inner", [sms("a")], [sms("b")]);
      const outer = fork("outer", [inner], [sms("c")]);
      const reused: BranchStep = {
        ...outer,
        config: {
          ...outer.config,
          branches: outer.config.branches.map((b, i) => ({
            ...b,
            id: inner.config.branches[i]!.id,
          })),
        },
      };
      expect(() => layout(definition([reused]))).not.toThrow();
    });

    it("throws when an authored id collides with an emitted end node", () => {
      expect(() => layout(definition([sms("end:b"), sms("b")]))).toThrow(
        'node id "end:b" is used twice',
      );
    });

    it("throws on an unknown step kind", () => {
      expect(() =>
        layout(
          unchecked([
            sms("a"),
            { id: "x", label: "?", config: { kind: "fax" } },
          ]),
        ),
      ).toThrow('Cannot lay out "Fixture": step "x" has unknown kind "fax"');
    });

    it("throws on an authored end step", () => {
      expect(() =>
        layout(
          unchecked([{ id: "stop", label: "End", config: { kind: "end" } }]),
        ),
      ).toThrow('step "stop" has unknown kind "end"');
    });

    it("throws on an unknown trigger kind", () => {
      const d = definition([sms("a")]);
      expect(() =>
        layout({
          ...d,
          trigger: { label: "?", config: { kind: "send_sms" } },
        } as unknown as AutomationDefinition),
      ).toThrow(
        'Cannot lay out "Fixture": trigger has unknown kind "send_sms"',
      );
    });

    it("throws on a step after a branch, which would rejoin the tree", () => {
      expect(() =>
        layout(unchecked([fork("f", [sms("b")], [sms("c")]), sms("d")])),
      ).toThrow('Cannot lay out "Fixture": step "d" follows the branch "f"');
    });
  });
});
