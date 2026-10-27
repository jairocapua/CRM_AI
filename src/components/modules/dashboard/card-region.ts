import { useId, useRef } from "react";

/**
 * A dashboard card as a named region that can take focus: the card's
 * `LoadError` passes `ref` as its `focusTarget`, so after a Retry that works
 * focus lands on the card that now shows the data (P10-T02). Spread
 * `regionProps` on the `Card`, put `titleId` on its `CardTitle`, and add
 * `REGION_FOCUS` to its classes.
 */
export function useCardRegion() {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  return {
    ref,
    titleId,
    regionProps: {
      ref,
      role: "region" as const,
      "aria-labelledby": titleId,
      tabIndex: -1,
    },
  };
}

/** The focus ring a card region shows when focus lands on it by keyboard. */
export const REGION_FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-ring/50";
