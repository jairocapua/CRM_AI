import { describe, expect, it } from "vitest";

import type { FilterCondition, FilterGroup, FilterOperator } from "@/types";
import { applyQuery, type Page } from "./query-engine";
import { REF_DATE } from "./seed/rng";
import { freshModules } from "./testing";

const DAY = 86_400_000;
const daysBeforeRef = (days: number) =>
  new Date(REF_DATE.getTime() - days * DAY).toISOString();

interface Row {
  id: string;
  name: string;
  status: string;
  company: string | null;
  tagIds: string[];
  score: number | null;
  createdAt: string;
}

/** Five rows in a fixed source order; ids are fixture literals. */
const ROWS: Row[] = [
  {
    id: "a",
    name: "Item 2",
    status: "lead",
    company: "Acme Corp",
    tagIds: ["t1"],
    score: 10,
    createdAt: daysBeforeRef(3),
  },
  {
    id: "b",
    name: "Item 10",
    status: "customer",
    company: "Globex",
    tagIds: ["t2", "t3"],
    score: 30,
    createdAt: daysBeforeRef(10),
  },
  {
    id: "c",
    name: "item 1",
    status: "lead",
    company: "",
    tagIds: [],
    score: null,
    createdAt: daysBeforeRef(1),
  },
  {
    id: "d",
    name: "Widget",
    status: "prospect",
    company: null,
    tagIds: ["t3"],
    score: 30,
    createdAt: daysBeforeRef(40),
  },
  {
    id: "e",
    name: "Gadget",
    status: "customer",
    company: "acme labs",
    tagIds: ["t1", "t2"],
    score: 20,
    createdAt: daysBeforeRef(6),
  },
];

let nextId = 0;
const cond = (
  field: string,
  operator: FilterOperator,
  value?: unknown,
): FilterCondition => ({ id: `c${nextId++}`, field, operator, value });
const and = (...conditions: FilterGroup["conditions"]): FilterGroup => ({
  id: `g${nextId++}`,
  combinator: "and",
  conditions,
});
const or = (...conditions: FilterGroup["conditions"]): FilterGroup => ({
  id: `g${nextId++}`,
  combinator: "or",
  conditions,
});

const idsOf = (page: Page<{ id: string }>) => page.rows.map((r) => r.id);
const filtered = (filter: FilterGroup) => idsOf(applyQuery(ROWS, { filter }));

describe("applyQuery: filter", () => {
  it("eq compares a scalar field exactly", () => {
    expect(filtered(and(cond("status", "eq", "lead")))).toEqual(["a", "c"]);
  });

  it("eq on an array field means the array includes the value", () => {
    expect(filtered(and(cond("tagIds", "eq", "t3")))).toEqual(["b", "d"]);
  });

  it("in on an array field means the two share at least one value", () => {
    expect(filtered(and(cond("tagIds", "in", ["t1", "t3"])))).toEqual([
      "a",
      "b",
      "d",
      "e",
    ]);
  });

  it("in on a scalar field means the value is one of the list", () => {
    expect(
      filtered(and(cond("status", "in", ["prospect", "customer"]))),
    ).toEqual(["b", "d", "e"]);
  });

  it("contains is case-insensitive", () => {
    expect(filtered(and(cond("company", "contains", "ACME")))).toEqual([
      "a",
      "e",
    ]);
  });

  it("isEmpty matches null, the empty string and the empty array", () => {
    expect(filtered(and(cond("company", "isEmpty")))).toEqual(["c", "d"]);
    expect(filtered(and(cond("tagIds", "isEmpty")))).toEqual(["c"]);
    expect(filtered(and(cond("score", "isEmpty")))).toEqual(["c"]);
  });

  it("evaluates an or group nested inside an and group", () => {
    const filter = and(
      cond("status", "in", ["lead", "customer"]),
      or(cond("tagIds", "eq", "t2"), cond("name", "contains", "item 2")),
    );
    expect(filtered(filter)).toEqual(["a", "b", "e"]);
  });

  it("an empty group passes every row, at the top level or nested", () => {
    expect(filtered(and())).toEqual(["a", "b", "c", "d", "e"]);
    expect(filtered(or())).toEqual(["a", "b", "c", "d", "e"]);
    expect(filtered(and(cond("status", "eq", "lead"), or()))).toEqual([
      "a",
      "c",
    ]);
  });

  it("inLastDays measures against the demo clock, not the wall clock", async () => {
    // The wall clock sits 60 days past the seed anchor.
    await freshModules(REF_DATE.getTime() + 60 * DAY);
    const engine = await import("./query-engine");
    const { db } = await import("./db");
    const lastWeek = { filter: and(cond("createdAt", "inLastDays", 7)) };

    // Unseeded: no anchor, so "now" is the system clock and nothing is recent.
    expect(idsOf(engine.applyQuery(ROWS, lastWeek))).toEqual([]);

    // Seeded: "now" is the anchor, so rows from the anchor's week match.
    db.setState({ seededAt: REF_DATE.toISOString() });
    expect(idsOf(engine.applyQuery(ROWS, lastWeek))).toEqual(["a", "c", "e"]);
  });
});

describe("applyQuery: search", () => {
  const fields = { searchFields: ["name", "company"] };

  it("trims the term and ignores case", () => {
    expect(idsOf(applyQuery(ROWS, { q: "  ACME  " }, fields))).toEqual([
      "a",
      "e",
    ]);
  });

  it("matches any search field, including an array field", () => {
    expect(
      idsOf(applyQuery(ROWS, { q: "t3" }, { searchFields: ["tagIds"] })),
    ).toEqual(["b", "d"]);
    expect(
      idsOf(
        applyQuery(ROWS, { q: "item" }, { searchFields: ["company", "name"] }),
      ),
    ).toEqual(["a", "b", "c"]);
  });

  it("accepts a function of the row as a search field, so a derived value is searchable", () => {
    const nameAndCompany = (r: Row) => `${r.name} ${r.company ?? ""}`;
    // "item 2 acme" spans two fields, so only the derived text holds it.
    expect(
      idsOf(applyQuery(ROWS, { q: "item 2 acme" }, { searchFields: ["name"] })),
    ).toEqual([]);
    expect(
      idsOf(
        applyQuery(
          ROWS,
          { q: "item 2 acme" },
          { searchFields: [nameAndCompany] },
        ),
      ),
    ).toEqual(["a"]);
    // A path still matches alongside a function.
    expect(
      idsOf(
        applyQuery(
          ROWS,
          { q: "globex" },
          { searchFields: ["company", (r: Row) => r.status] },
        ),
      ),
    ).toEqual(["b"]);
  });

  it("is ignored when there are no search fields or the term is blank", () => {
    const everyone = ["a", "b", "c", "d", "e"];
    expect(idsOf(applyQuery(ROWS, { q: "acme" }))).toEqual(everyone);
    expect(idsOf(applyQuery(ROWS, { q: "   " }, fields))).toEqual(everyone);
  });
});

describe("applyQuery: sort", () => {
  it("sorts by several keys, using later keys only to break ties", () => {
    const page = applyQuery(ROWS, {
      sort: [
        { field: "status", desc: false },
        { field: "score", desc: true },
      ],
    });
    expect(idsOf(page)).toEqual(["b", "e", "a", "c", "d"]);
  });

  it("compares strings numerically and case-insensitively", () => {
    const page = applyQuery(ROWS, { sort: [{ field: "name", desc: false }] });
    expect(page.rows.map((r) => r.name)).toEqual([
      "Gadget",
      "item 1",
      "Item 2",
      "Item 10",
      "Widget",
    ]);
  });

  it("puts nulls first ascending and last descending", () => {
    const asc = applyQuery(ROWS, { sort: [{ field: "score", desc: false }] });
    const desc = applyQuery(ROWS, { sort: [{ field: "score", desc: true }] });
    expect(asc.rows.map((r) => r.score)).toEqual([null, 10, 20, 30, 30]);
    expect(desc.rows.map((r) => r.score)).toEqual([30, 30, 20, 10, null]);
  });

  it("falls back to defaultSort only when the query has no sort", () => {
    const defaultSort = [{ field: "createdAt", desc: true }];
    expect(idsOf(applyQuery(ROWS, {}, { defaultSort }))).toEqual([
      "c",
      "a",
      "e",
      "b",
      "d",
    ]);
    expect(
      idsOf(
        applyQuery(
          ROWS,
          { sort: [{ field: "name", desc: false }] },
          { defaultSort },
        ),
      ),
    ).toEqual(["e", "c", "a", "b", "d"]);
  });
});

describe("applyQuery: paginate", () => {
  it("slices pages and reports the totals", () => {
    const page = (n: number) => applyQuery(ROWS, { page: n, pageSize: 2 });

    expect(page(1)).toMatchObject({
      total: 5,
      page: 1,
      pageSize: 2,
      pageCount: 3,
    });
    expect(idsOf(page(1))).toEqual(["a", "b"]);
    expect(idsOf(page(2))).toEqual(["c", "d"]);
    expect(idsOf(page(3))).toEqual(["e"]);
  });

  it("clamps an out-of-range page", () => {
    const high = applyQuery(ROWS, { page: 9, pageSize: 2 });
    const low = applyQuery(ROWS, { page: 0, pageSize: 2 });
    expect(high.page).toBe(3);
    expect(idsOf(high)).toEqual(["e"]);
    expect(low.page).toBe(1);
    expect(idsOf(low)).toEqual(["a", "b"]);
  });

  it("returns every row as one page when there is no pageSize", () => {
    const page = applyQuery(ROWS, {});
    expect(page).toMatchObject({
      total: 5,
      page: 1,
      pageSize: 5,
      pageCount: 1,
    });
    expect(page.rows).toHaveLength(5);
    expect(applyQuery([], {})).toEqual({
      rows: [],
      total: 0,
      page: 1,
      pageSize: 0,
      pageCount: 1,
    });
  });

  it("counts the total after filtering, not before", () => {
    const page = applyQuery(ROWS, {
      filter: and(cond("status", "eq", "customer")),
      pageSize: 1,
    });
    expect(page).toMatchObject({ total: 2, pageCount: 2 });
    expect(idsOf(page)).toEqual(["b"]);
  });

  it("restricts to the requested ids, ignoring unknown ones", () => {
    const page = applyQuery(ROWS, { ids: ["e", "a", "missing"] });
    expect(idsOf(page)).toEqual(["a", "e"]);
    expect(page.total).toBe(2);
  });
});
