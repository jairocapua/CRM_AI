"use client"; // Error boundaries must be Client Components (Next 16 error.js).

import { RouteError } from "@/components/common/route-error";

/**
 * A render error in any app page. It wraps the pages, not `(app)/layout.tsx`,
 * so the sidebar and header stay and the user can leave by a link; Next
 * resets the boundary on navigation. `retry` re-renders the page.
 */
export default function AppError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return <RouteError error={error} retry={retry} />;
}
