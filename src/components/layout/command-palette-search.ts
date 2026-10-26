"use client";

import { useEffect, useReducer } from "react";

import * as api from "@/lib/api";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import type { Contact, Opportunity } from "@/types";

/** How many contacts, and how many deals, one palette search shows. */
export const PALETTE_SEARCH_LIMIT = 5;
/** Typing pauses this long before the palette searches. */
const SEARCH_DEBOUNCE_MS = 150;

export interface PaletteResults {
  contacts: Contact[];
  deals: Opportunity[];
}

/** One palette search: the trimmed query it is for, and how it went. */
export type PaletteSearchState =
  | { query: ""; status: "idle" }
  | { query: string; status: "loading" }
  | { query: string; status: "done"; results: PaletteResults }
  | { query: string; status: "error"; message: string };

export type PaletteSearchAction =
  | { type: "start"; query: string }
  | { type: "resolve"; query: string; results: PaletteResults }
  | { type: "fail"; query: string; message: string };

export const IDLE_SEARCH: PaletteSearchState = { query: "", status: "idle" };

/**
 * Reconciles palette searches. `start` makes a query the current one; an
 * answer (`resolve` or `fail`) lands only when it is for the current query.
 * Searches run at random simulated latencies, so typing "an" then "ann" can
 * get the "an" answer last: it is dropped, never drawn under "ann".
 */
export function paletteSearchReducer(
  state: PaletteSearchState,
  action: PaletteSearchAction,
): PaletteSearchState {
  switch (action.type) {
    case "start":
      return action.query === ""
        ? IDLE_SEARCH
        : { query: action.query, status: "loading" };
    case "resolve":
      if (action.query !== state.query) return state;
      return { query: action.query, status: "done", results: action.results };
    case "fail":
      if (action.query !== state.query) return state;
      return { query: action.query, status: "error", message: action.message };
  }
}

/** Case-insensitive substring match on an item's title or description; an
 *  empty query matches everything. */
export function matchesQuery(
  item: { title: string; description: string },
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === "") return true;
  return (
    item.title.toLowerCase().includes(needle) ||
    item.description.toLowerCase().includes(needle)
  );
}

/**
 * Searches contacts and deals through `api.*` for what is typed in the
 * palette, after a short pause in typing. Only a non-empty (trimmed) query
 * searches.
 *
 * `results` are the current query's only: while a newer query is typed or
 * loading they are `null` and `pending` is true. `error` is the current
 * query's failure message.
 */
export function usePaletteSearch(input: string): {
  pending: boolean;
  results: PaletteResults | null;
  error: string | null;
} {
  const query = input.trim();
  const debounced = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  const [state, dispatch] = useReducer(paletteSearchReducer, IDLE_SEARCH);

  useEffect(() => {
    dispatch({ type: "start", query: debounced });
    if (debounced === "") return;
    const page = { q: debounced, page: 1, pageSize: PALETTE_SEARCH_LIMIT };
    Promise.all([api.contacts.list(page), api.opportunities.list(page)]).then(
      ([contacts, deals]) =>
        dispatch({
          type: "resolve",
          query: debounced,
          results: { contacts: contacts.rows, deals: deals.rows },
        }),
      (error: unknown) =>
        dispatch({
          type: "fail",
          query: debounced,
          message:
            error instanceof Error ? error.message : "Something went wrong.",
        }),
    );
  }, [debounced]);

  const current = state.query === query;
  return {
    pending: query !== "" && (!current || state.status === "loading"),
    results: current && state.status === "done" ? state.results : null,
    error: current && state.status === "error" ? state.message : null,
  };
}
