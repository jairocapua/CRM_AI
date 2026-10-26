// @vitest-environment happy-dom
/**
 * LoadError after its Retry (P10-T02): a Retry that works moves focus to the
 * region that now shows the data (the focused button unmounts, which would
 * drop focus to <body>); a Retry that fails again says so in an sr-only
 * status line, since the alert's own text does not change.
 *
 * A harness stands in for a caller: `show` swaps the alert for the loaded
 * region, as a caller does when `loadErrorOf` turns null, and `retrying`
 * plays the resource's `isRefreshing`.
 */
import { act, createElement, useEffect, useState, type RefObject } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LoadError, stillFailingText } from "./load-error";

interface HarnessState {
  failed: boolean;
  retrying: boolean;
  /** After the alert: a skeleton stands in before the region (a second read). */
  skeleton?: boolean;
}

let root: Root | undefined;
let host: HTMLElement;
/** Set by the harness's effect; the loaded region the alert gives way to. */
const harness: {
  update: ((next: HarnessState) => void) | null;
  region: RefObject<HTMLDivElement | null>;
} = { update: null, region: { current: null } };
let onRetry: ReturnType<typeof vi.fn<() => void>>;

function Harness({
  withTarget,
  inDialog,
}: {
  withTarget: boolean;
  inDialog: boolean;
}) {
  const [state, setState] = useState<HarnessState>({
    failed: true,
    retrying: false,
  });
  useEffect(() => {
    harness.update = setState;
  }, []);
  const region = harness.region;
  const body = state.failed
    ? createElement(LoadError, {
        title: "Could not load things",
        message: "Something went wrong.",
        onRetry,
        retrying: state.retrying,
        focusTarget: withTarget ? region : undefined,
      })
    : state.skeleton
      ? createElement("div", { id: "skeleton" }, "Loading")
      : createElement(
          "div",
          { ref: region, tabIndex: -1, id: "region" },
          "Loaded",
        );
  const content = inDialog
    ? createElement(
        "div",
        { role: "dialog", id: "dialog" },
        createElement("h2", { id: "dialog-title" }, "Remove tag"),
        body,
      )
    : body;
  return createElement(
    "main",
    null,
    createElement("h1", { id: "page-title" }, "Things"),
    content,
  );
}

async function render({ withTarget = true, inDialog = false } = {}) {
  root = createRoot(host);
  const mounted = root;
  await act(async () => {
    mounted.render(createElement(Harness, { withTarget, inDialog }));
  });
}

async function set(next: HarnessState) {
  await act(async () => {
    harness.update?.(next);
  });
  // LoadError moves focus in a microtask after the commit.
  await act(async () => {
    await Promise.resolve();
  });
}

const retryButton = () => {
  const button = [...host.querySelectorAll("button")].find((b) =>
    b.textContent?.includes("Retry"),
  );
  if (!button) throw new Error("no Retry button");
  return button;
};

const statusText = () =>
  host.querySelector('[role="status"]')?.textContent ?? null;

async function clickRetry() {
  const button = retryButton();
  button.focus();
  await act(async () => {
    button.click();
  });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(console, "error");
  onRetry = vi.fn<() => void>();
  // Fresh per test: a focus wait left by an earlier test holds the old one.
  harness.region = { current: null };
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(async () => {
  const mounted = root;
  root = undefined;
  if (mounted) await act(async () => mounted.unmount());
  host.remove();
  expect(console.error).not.toHaveBeenCalled();
});

describe("LoadError", () => {
  it("calls onRetry and keeps the status line empty until a retry fails", async () => {
    await render();
    expect(statusText()).toBe("");
    await clickRetry();
    expect(onRetry).toHaveBeenCalledTimes(1);
    await set({ failed: true, retrying: true });
    expect(statusText()).toBe("");
  });

  it("announces each Retry that fails again, with a new count", async () => {
    await render();
    await clickRetry();
    await set({ failed: true, retrying: true });
    await set({ failed: true, retrying: false });
    expect(statusText()).toBe(stillFailingText(2));
    expect(stillFailingText(2)).toBe("Still could not load after 2 tries.");

    await clickRetry();
    await set({ failed: true, retrying: true });
    await set({ failed: true, retrying: false });
    expect(statusText()).toBe("Still could not load after 3 tries.");
  });

  it("says nothing when a re-read it did not start fails", async () => {
    await render();
    await set({ failed: true, retrying: true });
    await set({ failed: true, retrying: false });
    expect(statusText()).toBe("");
  });

  it("does not count a background re-read that fails after a failed Retry", async () => {
    await render();
    await clickRetry();
    await set({ failed: true, retrying: true });
    await set({ failed: true, retrying: false });
    expect(statusText()).toBe(stillFailingText(2));
    // A refetch the user did not start (an invalidation) fails too.
    await set({ failed: true, retrying: true });
    await set({ failed: true, retrying: false });
    expect(statusText()).toBe(stillFailingText(2));
  });

  it("stops waiting for a late focusTarget once the user clicks elsewhere", async () => {
    await render();
    await clickRetry();
    await set({ failed: false, retrying: false, skeleton: true });
    expect(document.activeElement).toBe(document.body);
    // A click on nothing focusable leaves focus on <body>.
    await act(async () => {
      document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    await set({ failed: false, retrying: false, skeleton: false });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 120));
    });
    expect(document.getElementById("region")).not.toBeNull();
    expect(document.activeElement).toBe(document.body);
  });

  it("stops waiting for a late focusTarget once focus moves elsewhere", async () => {
    const outside = document.createElement("button");
    document.body.append(outside);
    try {
      await render();
      await clickRetry();
      await set({ failed: false, retrying: false, skeleton: true });
      outside.focus();
      outside.blur();
      expect(document.activeElement).toBe(document.body);
      await set({ failed: false, retrying: false, skeleton: false });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 120));
      });
      expect(document.activeElement).toBe(document.body);
    } finally {
      outside.remove();
    }
  });

  it("keeps the status line outside the atomic alert", async () => {
    await render();
    const status = host.querySelector('[role="status"]');
    expect(status?.closest('[role="alert"]')).toBeNull();
    expect(status?.getAttribute("aria-live")).toBe("polite");
  });

  it("moves focus to focusTarget after a Retry that worked", async () => {
    await render();
    await clickRetry();
    expect(document.activeElement).toBe(retryButton());
    await set({ failed: true, retrying: true });
    await set({ failed: false, retrying: false });
    expect(document.activeElement?.id).toBe("region");
  });

  it("waits for a focusTarget that mounts after a skeleton", async () => {
    await render();
    await clickRetry();
    await set({ failed: false, retrying: false, skeleton: true });
    expect(document.activeElement).toBe(document.body);
    await set({ failed: false, retrying: false, skeleton: false });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 120));
    });
    expect(document.activeElement?.id).toBe("region");
  });

  it("falls back to the page heading without a focusTarget", async () => {
    await render({ withTarget: false });
    await clickRetry();
    await set({ failed: false, retrying: false });
    const heading = document.getElementById("page-title");
    expect(document.activeElement).toBe(heading);
    expect(heading?.getAttribute("tabindex")).toBe("-1");
  });

  it("falls back to the dialog's heading inside a dialog", async () => {
    await render({ withTarget: false, inDialog: true });
    await clickRetry();
    await set({ failed: false, retrying: false });
    expect(document.activeElement?.id).toBe("dialog-title");
  });

  it("leaves focus alone when the data came without its Retry", async () => {
    await render();
    retryButton().focus();
    await set({ failed: false, retrying: false });
    expect(document.activeElement?.id).not.toBe("region");
  });
});
