// @vitest-environment happy-dom
/**
 * UnsavedChangesProvider as React runs it: what `useLeaveGuard()` hands a
 * link, what a click does with and without a registration, and what the
 * provider passes its question (`ConfirmDialog`, stubbed here so its props
 * can be read straight off the mock).
 *
 * The tree is the provider around two children rendered once: a Registrar,
 * a page that registers through `useUnsavedChanges` from its own state, and
 * a Probe, a link-holder that reads `useLeaveGuard()` and reports each
 * render. React skips the Probe unless the context value changes, so its
 * render count is the identity check.
 *
 * react-dom/client under happy-dom, driven with React's `act`; no JSX, since
 * the include glob is `*.test.ts`.
 */
import { act, createElement, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import {
  UnsavedChangesProvider,
  useLeaveGuard,
  useUnsavedChanges,
} from "./unsaved-changes";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/components/common/confirm-dialog", () => ({
  ConfirmDialog: vi.fn(() => null),
}));

type GuardLeave = ReturnType<typeof useLeaveGuard>;
type NavigateEvent = Parameters<ReturnType<GuardLeave>>[0];

const SUBJECT = "Discovery Call";

let root: Root | undefined;
/** The `guardLeave` each Probe render got, in order. */
let guards: GuardLeave[];
/** The Registrar's own setter: what its form's dirty state would call. */
let register: (subject: string | null) => void;

function Registrar({
  onRender,
}: {
  onRender: (set: (subject: string | null) => void) => void;
}) {
  const [subject, setSubject] = useState<string | null>(null);
  useUnsavedChanges(subject);
  onRender(setSubject);
  return null;
}

function Probe({ onRender }: { onRender: (guard: GuardLeave) => void }) {
  onRender(useLeaveGuard());
  return null;
}

async function mount() {
  const mounted = createRoot(document.createElement("div"));
  root = mounted;
  const children: ReactNode[] = [
    createElement(Registrar, {
      key: "registrar",
      onRender: (set) => {
        register = set;
      },
    }),
    createElement(Probe, {
      key: "probe",
      onRender: (guard) => {
        guards.push(guard);
      },
    }),
  ];
  await act(async () => {
    mounted.render(createElement(UnsavedChangesProvider, null, children));
  });
}

async function setRegistration(subject: string | null) {
  await act(async () => register(subject));
}

/** A click on a link whose `onNavigate` is `guardLeave(href, options)`. */
async function click(...args: Parameters<GuardLeave>) {
  const event = { preventDefault: vi.fn() };
  const guard = guards.at(-1);
  if (!guard) throw new Error("Probe never rendered");
  await act(async () => guard(...args)(event as unknown as NavigateEvent));
  return event;
}

/** The props of the provider's latest question render. */
function question() {
  const props = vi.mocked(ConfirmDialog).mock.lastCall?.[0];
  if (!props) throw new Error("ConfirmDialog never rendered");
  return props;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(console, "error");
  // restoreMocks (Vitest 4) restores spies only: these keep their stub
  // implementations but not their calls.
  vi.mocked(ConfirmDialog).mockClear();
  push.mockClear();
  guards = [];
});

afterEach(async () => {
  const mounted = root;
  root = undefined;
  if (mounted) await act(async () => mounted.unmount());
  expect(console.error).not.toHaveBeenCalled();
});

describe("UnsavedChangesProvider", () => {
  it("guardLeave and the context keep one identity while the registration changes", async () => {
    await mount();
    expect(guards).toHaveLength(1);

    await setRegistration(SUBJECT);
    await setRegistration(null);
    await setRegistration(SUBJECT);

    // The link-holder was never asked to render again.
    expect(guards).toHaveLength(1);
    // And a handler made before the registration still asks: it reads the
    // registration at click time.
    const event = await click("/contacts");
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(question().open).toBe(true);
  });

  it("a clean link goes ahead and runs onLeave; a registered one is cancelled and asks; Discard runs onLeave and pushes", async () => {
    await mount();
    const onLeave = vi.fn();

    // Clean: nothing to lose, the link goes ahead.
    const clean = await click("/contacts", { onLeave });
    expect(clean.preventDefault).not.toHaveBeenCalled();
    expect(onLeave).toHaveBeenCalledOnce();
    expect(question().open).toBe(false);
    onLeave.mockClear();

    // Registered: cancelled, and the question names what has edits.
    await setRegistration(SUBJECT);
    const asked = await click("/contacts", { onLeave });
    expect(asked.preventDefault).toHaveBeenCalledOnce();
    expect(onLeave).not.toHaveBeenCalled();
    expect(question().open).toBe(true);
    expect(String(question().description)).toContain(SUBJECT);

    // Keep editing or Escape: the dialog reports open=false. Nothing leaves.
    await act(async () => question().onOpenChange(false));
    expect(question().open).toBe(false);
    expect(onLeave).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();

    // Asked again, then Discard changes.
    await click("/contacts", { onLeave });
    expect(question().open).toBe(true);
    await act(async () => question().onConfirm());
    expect(onLeave).toHaveBeenCalledOnce();
    expect(push).toHaveBeenCalledExactlyOnceWith("/contacts");
    expect(question().open).toBe(false);

    // Released: the next click goes straight through.
    const after = await click("/contacts", { onLeave });
    expect(after.preventDefault).not.toHaveBeenCalled();
    expect(onLeave).toHaveBeenCalledTimes(2);
  });

  it("returnFocus becomes the question's finalFocus", async () => {
    await mount();
    await setRegistration(SUBJECT);
    const trigger = document.createElement("button");

    await click("/settings", { returnFocus: trigger });
    expect(question().open).toBe(true);
    const finalFocus = question().finalFocus;
    expect(finalFocus).toBeTypeOf("function");
    expect((finalFocus as () => HTMLElement)()).toBe(trigger);

    await act(async () => question().onOpenChange(false));

    // Without one, Base UI's own default applies (the link that asked).
    await click("/contacts");
    expect(question().open).toBe(true);
    expect(question().finalFocus).toBeUndefined();
  });

  it("a registration released while asking (a save finished) closes the question and drops the link", async () => {
    await mount();
    await setRegistration(SUBJECT);
    const onLeave = vi.fn();

    await click("/contacts", { onLeave });
    expect(question().open).toBe(true);

    await setRegistration(null);
    expect(question().open).toBe(false);
    expect(push).not.toHaveBeenCalled();
    expect(onLeave).not.toHaveBeenCalled();
  });
});
