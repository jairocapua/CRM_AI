// @vitest-environment happy-dom
/**
 * The route error boundary's fallback (src/app/(app)/error.tsx and
 * global-error.tsx render it): it shows an ApiError's own sentence but never
 * a render bug's text, and its "Try again" calls the boundary's `retry`.
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";
import {
  ROUTE_ERROR_FALLBACK,
  RouteError,
  routeErrorMessage,
} from "./route-error";

let root: Root | undefined;
let host: HTMLElement;

async function render(error: unknown, retry: () => void) {
  root = createRoot(host);
  const mounted = root;
  await act(async () => {
    mounted.render(createElement(RouteError, { error, retry }));
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(async () => {
  const mounted = root;
  root = undefined;
  if (mounted) await act(async () => mounted.unmount());
  host.remove();
});

describe("routeErrorMessage", () => {
  it("shows an ApiError's sentence", () => {
    expect(
      routeErrorMessage(new ApiError("Contact c_1 was not found.", 404)),
    ).toBe("Contact c_1 was not found.");
  });

  it("hides any other error's text", () => {
    expect(
      routeErrorMessage(new TypeError("Cannot read properties of null")),
    ).toBe(ROUTE_ERROR_FALLBACK);
    expect(routeErrorMessage("boom")).toBe(ROUTE_ERROR_FALLBACK);
  });
});

describe("RouteError", () => {
  it("names the problem and retries through the boundary's retry", async () => {
    const retry = vi.fn();
    await render(new TypeError("Cannot read properties of null"), retry);
    const alert = host.querySelector('[role="alert"]');
    expect(alert?.querySelector("h1")?.textContent).toBe(
      "Something went wrong",
    );
    expect(alert?.textContent).toContain(ROUTE_ERROR_FALLBACK);
    expect(alert?.textContent).not.toContain("Cannot read properties");

    const button = [...host.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Try again"),
    );
    await act(async () => {
      button?.click();
    });
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
