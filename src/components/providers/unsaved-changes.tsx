"use client";

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
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
 * - a link that passes `useLeaveGuard()(href)` as its Next Link `onNavigate`
 *   asks "Discard unsaved changes?" first. Keep editing (or Escape) stays
 *   put; Discard changes releases the registration and then goes to `href`.
 *   The guarded links are the sidebar's nav links, the user menu's links and
 *   the availability editor's Back to calendars;
 * - a reload or a closed tab asks through the browser's own `beforeunload`
 *   prompt. Its wording is the browser's and cannot be set, and browsers
 *   show it only after the viewer has interacted with the page.
 *
 * Not guarded: the browser's back and forward (Next has no way to cancel a
 * history traversal), a programmatic `router.push`, and a Ctrl/Cmd-click,
 * which opens a new tab and keeps this one (Next does not call `onNavigate`
 * for it). If the registration goes away while the question is open, for
 * example because the browser's Back unmounted the page, the question
 * closes.
 *
 * There is one registration at a time: a second page registering would
 * replace the first. Only the availability editor registers today.
 *
 * Follows link.md's "Blocking navigation" (node_modules/next/dist/docs/
 * 01-app/03-api-reference/02-components/link.md), with the app's
 * `ConfirmDialog` in place of `window.confirm`.
 */

/** Next Link's `onNavigate`: call `preventDefault()` to cancel the move. */
type NavigateHandler = NonNullable<ComponentProps<typeof Link>["onNavigate"]>;

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
  guardLeave: (href: string) => NavigateHandler;
}

/** Outside the provider nothing is guarded and every link just navigates. */
const UnsavedChangesContext = createContext<UnsavedChangesContextValue>({
  setSubject: () => {},
  guardLeave: () => () => {},
});

/** The open (or closing) question: whose edits, and where the link led. */
interface LeaveQuestion {
  open: boolean;
  subject: string;
  href: string;
}

/**
 * Holds the registration and asks the question. Mounted once, in the (app)
 * layout, around everything a guarded link can sit in.
 */
export function UnsavedChangesProvider({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter();
  const [subject, setSubjectState] = useState<string | null>(null);
  // Kept after the dialog closes (only `open` turns false), so its text stays
  // put through the exit animation.
  const [leave, setLeave] = useState<LeaveQuestion | null>(null);

  const setSubject = useCallback((next: string | null) => {
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
    (href: string): NavigateHandler =>
      (event) => {
        if (subject === null) return;
        event.preventDefault();
        setLeave({ open: true, subject, href });
      },
    [subject],
  );

  const value = useMemo(
    () => ({ setSubject, guardLeave }),
    [setSubject, guardLeave],
  );

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
        // No `finalFocus`: Base UI returns focus to the element focused when
        // the question opened, the link that asked it.
        onConfirm={() => {
          if (!leave) return;
          // Released first, so another guarded click while the new page
          // loads goes straight through instead of asking again.
          setSubject(null);
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
 * Discard changes releases the registration itself, before the navigation
 * it starts. The page's own `subject` is unchanged by that, so the guard
 * stays off until `subject` changes or the page mounts again: while the next
 * page loads, links, reload and tab close no longer ask. A question the page
 * asks itself (the availability editor's calendar switch) follows the page's
 * own state and still can.
 */
export function useUnsavedChanges(subject: string | null): void {
  const { setSubject } = use(UnsavedChangesContext);
  useEffect(() => {
    setSubject(subject);
    return () => setSubject(null);
  }, [subject, setSubject]);
}

/**
 * Returns `guardLeave(href)`, an `onNavigate` handler for a Next Link to
 * `href`: while a page has unsaved edits it cancels the navigation and asks
 * first, and otherwise does nothing.
 */
export function useLeaveGuard(): (href: string) => NavigateHandler {
  return use(UnsavedChangesContext).guardLeave;
}
