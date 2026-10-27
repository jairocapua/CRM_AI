"use client"; // Error boundaries must be Client Components (Next 16 error.js).

import { RouteError } from "@/components/common/route-error";
import "./globals.css";

/**
 * A render error in the root layout itself (its providers), which
 * `(app)/error.tsx` cannot catch. It replaces the root layout, so it brings
 * its own `<html>`, `<body>` and styles; the theme class is not applied, so
 * it follows the light theme.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-svh antialiased">
        <title>Something went wrong</title>
        <RouteError error={error} retry={retry} />
      </body>
    </html>
  );
}
