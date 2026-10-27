"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { RotateCwIcon, TriangleAlertIcon } from "lucide-react";

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/**
 * The sr-only line a Retry that failed again announces. The count makes each
 * repeat a new text, so a screen reader reads it again: the alert's own text
 * does not change when a retry fails.
 */
export function stillFailingText(tries: number): string {
  return `Still could not load after ${tries} tries.`;
}

/** How long LoadError waits for a `focusTarget` to mount: 200 × 50 ms. */
const RETRY_FOCUS_TRIES = 200;
const RETRY_FOCUS_INTERVAL_MS = 50;

/**
 * Where focus goes after a Retry that worked, when the caller passes no
 * `focusTarget`: the heading of the dialog the alert sat in, else the page's
 * `<h1>`. Headings are not focusable, so it gets `tabindex="-1"`.
 */
function fallbackTarget(dialog: HTMLElement | null): HTMLElement | null {
  const heading = dialog
    ? dialog.querySelector<HTMLElement>("h2")
    : document.querySelector<HTMLElement>("main h1");
  if (heading && !heading.hasAttribute("tabindex")) heading.tabIndex = -1;
  return heading ?? dialog;
}

/**
 * Moves focus after a Retry that worked, while focus is still nowhere
 * (`<body>`): to `focusTarget`, else to `fallbackTarget`. A region that waits
 * on a second read (a thread on its contact) mounts a moment later, after a
 * skeleton, so a `focusTarget` not mounted yet is looked for again, up to
 * `RETRY_FOCUS_TRIES` times. The first `pointerdown` or `focusin` anywhere
 * in the document ends that wait: a user who clicked or tabbed elsewhere
 * meanwhile keeps their place, even when the click landed on nothing
 * focusable and left focus on `<body>`.
 */
function focusAfterRetry(
  focusTarget: RefObject<HTMLElement | null> | undefined,
  dialog: HTMLElement | null,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  function stop() {
    clearTimeout(timer);
    document.removeEventListener("pointerdown", stop, true);
    document.removeEventListener("focusin", stop, true);
  }
  function attempt(tries: number) {
    const active = document.activeElement;
    if (active && active !== document.body) {
      stop();
      return;
    }
    const target = focusTarget ? focusTarget.current : fallbackTarget(dialog);
    if (target?.isConnected) {
      // Listeners off first: this focus is ours, not the user's.
      stop();
      target.focus();
    } else if (focusTarget && tries < RETRY_FOCUS_TRIES) {
      timer = setTimeout(() => attempt(tries + 1), RETRY_FOCUS_INTERVAL_MS);
    } else {
      stop();
    }
  }
  document.addEventListener("pointerdown", stop, true);
  document.addEventListener("focusin", stop, true);
  attempt(0);
}

/**
 * A read that failed, with a Retry button.
 *
 * Render this only when a read failed and there is nothing to draw: while
 * data is on screen, a failed refetch keeps it there (`useResource` holds the
 * last good result for the same query), so the error is not shown over it.
 * Pass the resource's `isRefreshing` as `retrying`. While a retry is in
 * flight the alert stays, its button busy; it never turns into a skeleton.
 *
 * The button stays focusable while busy (`focusableWhenDisabled`): a natively
 * disabled button would drop focus to `<body>`. The spinner is hidden from
 * assistive tech because `Spinner` carries `aria-label="Loading"`, which
 * would otherwise rename the button "Loading Retry"; the busy state is
 * announced by `aria-disabled` on the button and `aria-busy` on the alert.
 *
 * After Retry (P10-T02):
 * - It worked: the alert unmounts with focus on its button, which would drop
 *   focus to `<body>`. Focus moves to `focusTarget` (the region that now
 *   shows the data; give it `tabIndex={-1}`), or without one to the
 *   enclosing dialog's heading, else the page's `<h1>`. A `focusTarget`
 *   that mounts a moment later (its region waits on a second read) is
 *   waited for, up to ~10s, until the user clicks or moves focus. Only after
 *   this alert's own Retry, and only while focus is still on `<body>`.
 * - It failed again (`retrying` went back to false with the alert still up):
 *   an sr-only polite status line says `stillFailingText(tries)`. Only a
 *   re-read its Retry started counts: each settled retry clears the click.
 */
export function LoadError({
  title,
  message,
  onRetry,
  retrying = false,
  focusTarget,
}: {
  title: string;
  message: string;
  onRetry: () => void;
  retrying?: boolean;
  focusTarget?: RefObject<HTMLElement | null>;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const retried = useRef(false);
  const [clicked, setClicked] = useState(false);
  const [failedRetries, setFailedRetries] = useState(0);
  // A retry that ends with this alert still mounted failed. Tracked during
  // render (React's "previous props" pattern), not in an effect. A settled
  // retry clears `clicked`, so a later re-read the user did not start (a
  // background refetch) is not announced as their Retry failing again.
  const [wasRetrying, setWasRetrying] = useState(retrying);
  if (wasRetrying !== retrying) {
    setWasRetrying(retrying);
    if (wasRetrying && clicked) {
      setFailedRetries((n) => n + 1);
      setClicked(false);
    }
  }

  // A layout cleanup runs while the alert is still in the document, so it
  // can tell whether its button held focus; the data that replaces the alert
  // is committed by the time the microtask runs.
  useLayoutEffect(() => {
    const button = buttonRef.current;
    return () => {
      if (!retried.current || !button || document.activeElement !== button) {
        return;
      }
      const dialog = button.closest<HTMLElement>(
        '[role="dialog"], [role="alertdialog"]',
      );
      queueMicrotask(() => focusAfterRetry(focusTarget, dialog));
    };
  }, [focusTarget]);

  return (
    <>
      <Alert
        variant="destructive"
        aria-busy={retrying || undefined}
        // The Retry button, icon and all, is wider than the 4.5rem (pr-18) the
        // alert keeps clear for its action: a long message would wrap under it.
        className="has-data-[slot=alert-action]:pr-22"
      >
        <TriangleAlertIcon />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{message}</AlertDescription>
        <AlertAction>
          <Button
            ref={buttonRef}
            size="sm"
            variant="outline"
            onClick={() => {
              retried.current = true;
              setClicked(true);
              onRetry();
            }}
            disabled={retrying}
            focusableWhenDisabled
            className="data-disabled:opacity-50"
          >
            {retrying ? (
              <Spinner aria-hidden data-icon="inline-start" />
            ) : (
              <RotateCwIcon data-icon="inline-start" />
            )}
            Retry
          </Button>
        </AlertAction>
      </Alert>
      {/* Outside the alert: role="alert" is atomic, so a line inside it would
          re-read the whole alert. Always mounted, so the text change is what
          gets announced. */}
      <p role="status" aria-live="polite" className="sr-only">
        {failedRetries > 0 ? stillFailingText(failedRetries + 1) : ""}
      </p>
    </>
  );
}
