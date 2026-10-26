"use client";

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { ConfirmDialog } from "@/components/common/confirm-dialog";

/**
 * The app's guard against dropping unsaved edits by leaving the page.
 *
 * A page with unsaved edits registers the name of what it is editing with
 * `useUnsavedChanges(subject)`. While it is registered:
 *
 * - a link that passes `useLeaveGuard()(href, options)` as its Next Link
 *   `onNavigate` asks "Discard unsaved changes?" first. Keep editing (or
 *   Escape) stays put; Discard changes releases the registration and goes to
 *   `href`. The guarded links are the sidebar's nav links, the user menu's
 *   links, the settings section nav and the availability editor's Back to
 *   calendars;
 * - a reload or a closed tab asks through the browser's own `beforeunload`
 *   prompt. Its wording is the browser's and cannot be set, and browsers
 *   show it only after the viewer has interacted with the page.
 *
 * A guarded link can close what it sits in as it leaves (the sidebar's phone
 * Sheet) through `onLeave`, which runs only when the link really goes ahead.
 * A link that is unmounted by the time the question closes (a menu item)
 * names where focus goes back with `returnFocus` (the menu's trigger).
 *
 * `guardLeave` keeps one identity for the provider's lifetime: it reads the
 * registration when a link is clicked, not when it renders, so registering
 * and releasing never re-render the links that use it.
 *
 * A control that is not a link (the command palette) navigates through
 * `useGuardedNavigate()`, which asks the same question.
 *
 * Not guarded: the browser's back and forward (Next has no way to cancel a
 * history traversal), a bare `router.push`, and a Ctrl/Cmd-click,
 * which opens a new tab and keeps this one (Next does not call `onNavigate`
 * for it).
 *
 * If the registration goes away while the question is open, the question
 * closes and the clicked link is dropped: `onLeave` does not run and nothing
 * navigates. That happens when the browser's Back unmounted the page, and
 * when a save in flight finished while the viewer was being asked; nothing
 * is left to lose then, and the viewer clicks the link again.
 *
 * There is one registration at a time: a second page registering would
 * replace the first. The availability editor and the profile and business
 * settings forms register.
 *
 * Follows link.md's "Blocking navigation" (node_modules/next/dist/docs/
 * 01-app/03-api-reference/02-components/link.md), with the app's
 * `ConfirmDialog` in place of `window.confirm`.
 */

/** Next Link's `onNavigate`: call `preventDefault()` to cancel the move. */
type NavigateHandler = NonNullable<ComponentProps<typeof Link>["onNavigate"]>;

/** What a guarded link adds to `guardLeave(href, options)`. */
export interface LeaveOptions {
  /**
   * Runs when the link goes ahead: at once when nothing is registered, or on
   * Discard changes. Never on Keep editing, Escape, or a registration
   * released while the question is open.
   */
  onLeave?: () => void;
  /**
   * Where focus goes when the question closes without leaving. For a link
   * that is unmounted as it asks (a menu item); without it, Base UI returns
   * focus to the link that asked.
   */
  returnFocus?: HTMLElement | null;
}

/** The wording every "drop unsaved edits?" question shares. Spread it into a
 *  `ConfirmDialog` and add the description. */
export const DISCARD_QUESTION = {
  title: "Discard unsaved changes?",
  cancelLabel: "Keep editing",
  confirmLabel: "Discard changes",
  confirmVariant: "destructive",
} as const;

interface UnsavedChangesContextValue {
  /** Registers what has unsaved edits, or releases with `null`. */
  setSubject: (subject: string | null) => void;
  /** An `onNavigate` for a link to `href` that asks first while registered. */
  guardLeave: (href: string, options?: LeaveOptions) => NavigateHandler;
}

/** Outside the provider nothing is guarded: every link goes ahead. */
const UnsavedChangesContext = createContext<UnsavedChangesContextValue>({
  setSubject: () => {},
  guardLeave: (_href, options) => () => options?.onLeave?.(),
});

/** The open (or closing) question: whose edits, where the link led, and what
 *  the link asked for. */
interface LeaveQuestion {
  open: boolean;
  subject: string;
  href: string;
  onLeave: (() => void) | undefined;
  returnFocus: HTMLElement | null;
}

/**
 * Holds the registration and asks the question. Mounted once, in the (app)
 * layout, around everything a guarded link can sit in.
 */
export function UnsavedChangesProvider({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter();
  // Read by guardLeave's handlers at click time, so guardLeave never changes.
  const subjectRef = useRef<string | null>(null);
  // Only for the beforeunload effect, which must follow the registration.
  const [subject, setSubjectState] = useState<string | null>(null);
  // Kept after the dialog closes (only `open` turns false), so its text stays
  // put through the exit animation.
  const [leave, setLeave] = useState<LeaveQuestion | null>(null);

  const setSubject = useCallback((next: string | null) => {
    subjectRef.current = next;
    setSubjectState(next);
    // Nothing left to lose: a question still open has no reason to stay.
    if (next === null) {
      setLeave((prev) => (prev?.open ? { ...prev, open: false } : prev));
    }
  }, []);

  useEffect(() => {
    if (subject === null) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      // Included for legacy support (MDN): older browsers prompt only when
      // `returnValue` is set.
      event.returnValue = true;
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [subject]);

  const guardLeave = useCallback(
    (href: string, options: LeaveOptions = {}): NavigateHandler =>
      (event) => {
        const current = subjectRef.current;
        if (current === null) {
          options.onLeave?.();
          return;
        }
        event.preventDefault();
        setLeave({
          open: true,
          subject: current,
          href,
          onLeave: options.onLeave,
          returnFocus: options.returnFocus ?? null,
        });
      },
    [],
  );

  const value = useMemo(
    () => ({ setSubject, guardLeave }),
    [setSubject, guardLeave],
  );

  const returnFocus = leave?.returnFocus;

  return (
    <UnsavedChangesContext value={value}>
      {children}
      <ConfirmDialog
        {...DISCARD_QUESTION}
        open={leave?.open ?? false}
        onOpenChange={(open) =>
          setLeave((prev) => (prev ? { ...prev, open } : prev))
        }
        description={
          leave
            ? `Your changes to ${leave.subject} have not been saved. Leaving this page will discard them.`
            : null
        }
        // Without `returnFocus`, Base UI returns focus to the element focused
        // when the question opened: the link that asked it. A menu item is
        // unmounted by then, so the user menu passes its trigger.
        finalFocus={returnFocus ? () => returnFocus : undefined}
        onConfirm={() => {
          if (!leave) return;
          // Released in the same handler that starts the push, so another
          // guarded click while the next page loads goes straight through
          // instead of asking again. The order of these calls does not
          // matter; releasing here does.
          setSubject(null);
          leave.onLeave?.();
          router.push(leave.href);
        }}
      />
    </UnsavedChangesContext>
  );
}

/**
 * Registers `subject`, the name of what the calling page is editing, while
 * it has unsaved edits; pass `null` when it has none. Released on unmount.
 *
 * Discard changes releases the registration itself, in the same handler
 * that starts the navigation. The page's own `subject` is unchanged by that,
 * so the guard stays off until `subject` changes or the page mounts again:
 * while the next page loads, links, reload and tab close no longer ask. A
 * question the page asks itself (the availability editor's calendar switch)
 * follows the page's own state and still can.
 */
export function useUnsavedChanges(subject: string | null): void {
  const { setSubject } = use(UnsavedChangesContext);
  useEffect(() => {
    setSubject(subject);
    return () => setSubject(null);
  }, [subject, setSubject]);
}

/**
 * Returns `guardLeave(href, options)`, an `onNavigate` handler for a Next
 * Link to `href`: while a page has unsaved edits it cancels the navigation
 * and asks first; otherwise it lets the link go ahead and runs
 * `options.onLeave`. It keeps one identity across renders.
 */
export function useLeaveGuard(): (
  href: string,
  options?: LeaveOptions,
) => NavigateHandler {
  return use(UnsavedChangesContext).guardLeave;
}

/**
 * Returns `navigate(href, options)`, the same guard for a control that is
 * not a link (a command palette pick): with nothing registered it runs
 * `options.onLeave` and `router.push(href)`; while a page has unsaved edits
 * it asks first, exactly as a guarded link does, and Discard changes pushes.
 * Pass `returnFocus` when the control is gone by the time the question
 * closes.
 */
export function useGuardedNavigate(): (
  href: string,
  options?: LeaveOptions,
) => void {
  const guardLeave = useLeaveGuard();
  const router = useRouter();
  return useCallback(
    (href: string, options?: LeaveOptions) => {
      let cancelled = false;
      // The handler only calls `preventDefault`, so a stand-in event will do.
      const event = {
        preventDefault: () => {
          cancelled = true;
        },
      } as Parameters<NavigateHandler>[0];
      guardLeave(href, options)(event);
      if (!cancelled) router.push(href);
    },
    [guardLeave, router],
  );
}
