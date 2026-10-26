"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Runs `onOpen` once when the URL carries `?<name>=1`, then removes that
 * param from the URL with `history.replaceState` (Next 16 syncs it into
 * `useSearchParams`), so a reload, Back to the page or closing what opened
 * does not open it again. The command palette's quick actions link here
 * (`/contacts?new=1`, `/calendars?book=1`); arriving at the same page with
 * the param again runs it again.
 *
 * Reads `useSearchParams`, so on a prerendered route the caller sits inside
 * a `<Suspense>` boundary (see `src/app/(app)/calendars/page.tsx`).
 */
export function useOpenFromSearchParam(name: string, onOpen: () => void) {
  const searchParams = useSearchParams();
  const requested = searchParams.get(name) === "1";
  // The latest callback, read when the param shows up rather than on every
  // render, so an inline arrow does not re-run the effect.
  const onOpenRef = useRef(onOpen);
  useEffect(() => {
    onOpenRef.current = onOpen;
  });

  useEffect(() => {
    if (!requested) return;
    onOpenRef.current();
    const url = new URL(window.location.href);
    url.searchParams.delete(name);
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }, [requested, name]);
}

/** `useOpenFromSearchParam` as a component that renders nothing, for a page
 *  that keeps the rest of its tree outside the `<Suspense>` boundary. */
export function OpenFromSearchParam({
  name,
  onOpen,
}: {
  name: string;
  onOpen: () => void;
}) {
  useOpenFromSearchParam(name, onOpen);
  return null;
}
