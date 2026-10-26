import { describe, expect, it } from "vitest";

import type { Contact, Opportunity } from "@/types";
import { NAV_ITEMS } from "@/lib/nav";
import {
  IDLE_SEARCH,
  matchesQuery,
  paletteSearchReducer,
  type PaletteSearchAction,
  type PaletteSearchState,
} from "./command-palette-search";

/** Only the ids matter here; the reducer never looks inside a row. */
const contact = (id: string) => ({ id }) as Contact;
const deal = (id: string) => ({ id }) as Opportunity;

function run(actions: PaletteSearchAction[]): PaletteSearchState {
  return actions.reduce(paletteSearchReducer, IDLE_SEARCH);
}

describe("paletteSearchReducer", () => {
  it("a search starts loading and its answer lands", () => {
    const state = run([
      { type: "start", query: "ann" },
      {
        type: "resolve",
        query: "ann",
        results: { contacts: [contact("c1")], deals: [deal("d1")] },
      },
    ]);
    expect(state).toEqual({
      query: "ann",
      status: "done",
      results: { contacts: [contact("c1")], deals: [deal("d1")] },
    });
  });

  it("an older query's answer arriving after a newer query is ignored", () => {
    const state = run([
      { type: "start", query: "an" },
      { type: "start", query: "ann" },
      {
        type: "resolve",
        query: "ann",
        results: { contacts: [contact("ann")], deals: [] },
      },
      // "an" was slower and lands last: it must not replace "ann".
      {
        type: "resolve",
        query: "an",
        results: { contacts: [contact("an")], deals: [] },
      },
    ]);
    expect(state).toEqual({
      query: "ann",
      status: "done",
      results: { contacts: [contact("ann")], deals: [] },
    });
  });

  it("an older query's answer is ignored while the newer one is still loading", () => {
    const state = run([
      { type: "start", query: "an" },
      { type: "start", query: "ann" },
      {
        type: "resolve",
        query: "an",
        results: { contacts: [contact("an")], deals: [] },
      },
    ]);
    expect(state).toEqual({ query: "ann", status: "loading" });
  });

  it("an older query's failure does not replace a newer query's results", () => {
    const state = run([
      { type: "start", query: "an" },
      { type: "start", query: "ann" },
      {
        type: "resolve",
        query: "ann",
        results: { contacts: [contact("ann")], deals: [] },
      },
      { type: "fail", query: "an", message: "Boom" },
    ]);
    expect(state.status).toBe("done");
  });

  it("a failure of the current query is kept with its message", () => {
    const state = run([
      { type: "start", query: "ann" },
      { type: "fail", query: "ann", message: "Boom" },
    ]);
    expect(state).toEqual({ query: "ann", status: "error", message: "Boom" });
  });

  it("an empty query is idle, and an answer arriving after it is ignored", () => {
    const state = run([
      { type: "start", query: "ann" },
      { type: "start", query: "" },
      {
        type: "resolve",
        query: "ann",
        results: { contacts: [contact("ann")], deals: [] },
      },
    ]);
    expect(state).toBe(IDLE_SEARCH);
  });
});

describe("matchesQuery", () => {
  const calendars = NAV_ITEMS.find((item) => item.url === "/calendars");
  if (!calendars) throw new Error("no Calendars nav item");

  it("matches the title or the description, ignoring case and outer spaces", () => {
    expect(matchesQuery(calendars, "")).toBe(true);
    expect(matchesQuery(calendars, "  CALEN ")).toBe(true);
    expect(matchesQuery(calendars, "availability")).toBe(true);
    expect(matchesQuery(calendars, "pipelines")).toBe(false);
  });
});
