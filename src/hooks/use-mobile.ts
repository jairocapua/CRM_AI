import * as React from "react";

const MOBILE_BREAKPOINT = 768;
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

/**
 * Rewritten from the shadcn default, which called setState inside an effect and
 * trips `react-hooks/set-state-in-effect` under Next 16. useSyncExternalStore
 * is also the SSR-correct shape: the server snapshot is a stable `false`, so
 * the first client render matches the server and never mismatches on hydration.
 */
export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
