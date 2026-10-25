// @vitest-environment happy-dom
/**
 * useHeldValue as a hook: which contact the ContactPicker hands its combobox
 * as the value, across renders. The pure rule for one render is `pickerValue`
 * (contact-picker-value.test.ts, on the node environment); this file proves
 * what the hook holds between renders.
 *
 * Base UI compares the value by reference, and with `inputValue` uncontrolled
 * it writes the label into the input whenever the value is a new object. So
 * every expectation is a specific object (`toBe`), and a refetch of the same
 * contact, a new equal object, must never become the value.
 *
 * The hook keeps state, so it needs a real renderer: react-dom/client under
 * happy-dom, driven with React's `act`. Plain literals stand in for contacts.
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useHeldValue } from "./contact-picker-value";

interface Item {
  id: string;
  name: string;
}

const A: Item = { id: "a", name: "Ada Lovelace" };
/** A as a later refetch returns it: equal, but a new object. */
const A2: Item = { id: "a", name: "Ada Lovelace" };
const A3: Item = { id: "a", name: "Ada Lovelace" };
/** The contact picked from the list, and its own fetches. */
const P: Item = { id: "p", name: "Grace Hopper" };
const P2: Item = { id: "p", name: "Grace Hopper" };
const P3: Item = { id: "p", name: "Grace Hopper" };
const B: Item = { id: "b", name: "Barbara Liskov" };
const B2: Item = { id: "b", name: "Barbara Liskov" };
/** Another contact, the one useResource held before. */
const Z: Item = { id: "z", name: "Zora Neale" };

let root: Root | undefined;
/** The value each render produced, in order. */
let frames: (Item | null)[];
/** The latest render's setter, what ContactPicker calls on a pick. */
let hold: (next: Item | null) => void;

type Held = ReturnType<typeof useHeldValue<Item>>;

function onRender([current, setHeld]: Held) {
  frames.push(current);
  hold = setHeld;
}

function Probe({
  value,
  fetched,
  onRender,
}: {
  value: string;
  fetched: Item | undefined;
  onRender: (held: Held) => void;
}) {
  onRender(useHeldValue(value, fetched));
  return null;
}

/** Renders the probe; a later call is a rerender with new props. */
async function render(value: string, fetched: Item | undefined) {
  root ??= createRoot(document.createElement("div"));
  const mounted = root;
  await act(async () => {
    mounted.render(createElement(Probe, { value, fetched, onRender }));
  });
}

/** The value the last render produced. */
const latest = () => frames.at(-1);

beforeEach(() => {
  // React 19 warns about (and may not flush) updates outside act unless the
  // environment says it is a test; unstubGlobals removes it after each test.
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(console, "error");
  frames = [];
});

afterEach(async () => {
  const mounted = root;
  root = undefined;
  if (mounted) await act(async () => mounted.unmount());
  // No "not wrapped in act(...)" or setState-in-render warning slipped through.
  expect(console.error).not.toHaveBeenCalled();
});

describe("useHeldValue", () => {
  it("keeps the first fetched copy of a value set from outside across refetches", async () => {
    // Editing a deal: the value is set, its fetch is in flight.
    await render("a", undefined);
    expect(latest()).toBeNull();

    await render("a", A);
    expect(latest()).toBe(A);
    const firstShown = frames.indexOf(A);

    // Each invalidation refetches; after the fetch() swap every response is
    // a new object. Handing one over would rewrite whatever was typed.
    await render("a", A2);
    expect(latest()).toBe(A);
    await render("a", A3);
    expect(latest()).toBe(A);

    for (const frame of frames.slice(firstShown)) expect(frame).toBe(A);
  });

  it("a pick is the value at once and outlives its own refetches", async () => {
    await render("", undefined);
    expect(latest()).toBeNull();

    // The pick and onChange(id) happen in the same handler.
    await act(async () => hold(P));
    await render("p", undefined);
    expect(latest()).toBe(P);
    // useResource still holds the previous id's contact while p loads.
    await render("p", Z);
    expect(latest()).toBe(P);

    await render("p", P2);
    expect(latest()).toBe(P);
    await render("p", P3);
    expect(latest()).toBe(P);
  });

  it("moving to another id ignores the held contact until that id's copy lands, then holds that one", async () => {
    await render("a", A);
    expect(latest()).toBe(A);

    // The value moved to b; useResource still holds a until b lands.
    await render("b", A);
    expect(latest()).toBeNull();

    await render("b", B);
    expect(latest()).toBe(B);
    await render("b", B2);
    expect(latest()).toBe(B);
  });

  it("cleared shows nothing", async () => {
    await render("a", A);
    expect(latest()).toBe(A);

    await render("", A);
    expect(latest()).toBeNull();
  });
});
