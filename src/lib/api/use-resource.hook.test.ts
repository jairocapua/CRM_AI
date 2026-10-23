// @vitest-environment happy-dom
/**
 * useResource as a hook: the contract every LoadError caller relies on.
 *
 * A failed refetch of the same query keeps its data on screen (no skeleton,
 * no blank frame), sets the error and settles `isRefreshing`; a new query that
 * fails has no data, so `loadErrorOf` shows its error. The pure `loadErrorOf`
 * cases live in use-resource.test.ts, on the node environment.
 *
 * The hook runs effects, so it needs a real renderer: react-dom/client under
 * happy-dom, driven with React's `act`. The fetcher is a stub that hands out
 * one deferred promise per call, so each test settles every fetch itself.
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { invalidate } from "./cache";
import { ApiError } from "./http";
import { loadErrorOf, useResource } from "./use-resource";

interface Payload {
  rows: string[];
}

type Result = ReturnType<typeof useResource<Payload>>;

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** What each render showed, so a test can prove no frame flashed. */
interface Frame {
  data: Payload | undefined;
  error: ApiError | null;
  isLoading: boolean;
  isRefreshing: boolean;
}

let root: Root | undefined;
/** One deferred per fetch, in call order. */
let calls: Deferred<Payload>[];
let frames: Frame[];
let latest: Result;

function fetcher(): Promise<Payload> {
  const call = deferred<Payload>();
  calls.push(call);
  return call.promise;
}

function onRender(result: Result) {
  latest = result;
  frames.push({
    data: result.data,
    error: result.error,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
  });
}

function Probe({
  cacheKey,
  onRender,
}: {
  cacheKey: string;
  onRender: (result: Result) => void;
}) {
  onRender(useResource<Payload>("contacts", fetcher, cacheKey));
  return null;
}

/** Renders the probe for `cacheKey`; a second call is a rerender (query change). */
async function render(cacheKey: string) {
  root ??= createRoot(document.createElement("div"));
  const mounted = root;
  await act(async () => {
    mounted.render(createElement(Probe, { cacheKey, onRender }));
  });
}

/** Settles fetch `index` inside act, so its state update is flushed. */
async function settle(
  index: number,
  outcome: { ok: Payload } | { fail: unknown },
) {
  const call = calls[index];
  if (!call) throw new Error(`fetch ${index} was never made`);
  await act(async () => {
    if ("ok" in outcome) call.resolve(outcome.ok);
    else call.reject(outcome.fail);
  });
}

beforeEach(() => {
  // React 19 warns about (and may not flush) updates outside act unless the
  // environment says it is a test; unstubGlobals removes it after each test.
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(console, "error");
  calls = [];
  frames = [];
});

afterEach(async () => {
  const mounted = root;
  root = undefined;
  if (mounted) await act(async () => mounted.unmount());
  // No "not wrapped in act(...)" or other React warning slipped through.
  expect(console.error).not.toHaveBeenCalled();
});

describe("useResource", () => {
  // Tuples, because it.each spreads an array case into arguments.
  it.each<[string, (result: Result) => void]>([
    ["refetch()", (result) => result.refetch()],
    ["invalidate('contacts')", () => invalidate("contacts")],
  ])(
    "a failed refetch from %s keeps the loaded data and sets the error",
    async (_trigger, trigger) => {
      const first: Payload = { rows: ["a"] };
      await render("page=1");
      await settle(0, { ok: first });

      expect(latest.data).toBe(first);
      expect(latest.error).toBeNull();
      expect(latest.isLoading).toBe(false);
      expect(latest.isRefreshing).toBe(false);
      const loadedAt = frames.length - 1;

      await act(async () => trigger(latest));

      expect(calls).toHaveLength(2);
      expect(latest.data).toBe(first);
      expect(latest.isLoading).toBe(false);
      expect(latest.isRefreshing).toBe(true);

      const failure = new ApiError("Server down", 503);
      await settle(1, { fail: failure });

      expect(latest.data).toBe(first);
      expect(latest.error).toBe(failure);
      expect(latest.isLoading).toBe(false);
      expect(latest.isRefreshing).toBe(false);
      expect(loadErrorOf(latest)).toBeNull();

      // No skeleton flash and no blank frame at any point after the load.
      const afterLoad = frames.slice(loadedAt);
      expect(afterLoad.length).toBeGreaterThan(2);
      for (const frame of afterLoad) {
        expect(frame.isLoading).toBe(false);
        expect(frame.data).toBe(first);
      }
    },
  );

  it("a new query that fails drops the previous query's data", async () => {
    const first: Payload = { rows: ["a"] };
    await render("page=1");
    await settle(0, { ok: first });
    expect(latest.data).toBe(first);

    await render("page=2");

    expect(calls).toHaveLength(2);
    expect(latest.isLoading).toBe(true);
    expect(latest.isRefreshing).toBe(false);

    const failure = new ApiError("Server down", 503);
    await settle(1, { fail: failure });

    expect(latest.data).toBeUndefined();
    expect(latest.error).toBe(failure);
    expect(latest.isLoading).toBe(false);
    expect(latest.isRefreshing).toBe(false);
    expect(loadErrorOf(latest)).toBe(failure);
  });
});
