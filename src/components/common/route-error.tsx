"use client";

import { RotateCwIcon, TriangleAlertIcon } from "lucide-react";

import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";

/** What the error screen says when the error's own text is not for users. */
export const ROUTE_ERROR_FALLBACK =
  "This page hit a problem it could not recover from. Try again, or open another page.";

/**
 * The sentence the error screen shows: an `ApiError`'s own message (written
 * for users), else `ROUTE_ERROR_FALLBACK`. A render bug's text ("Cannot read
 * properties of null") never reaches the screen.
 */
export function routeErrorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : ROUTE_ERROR_FALLBACK;
}

/**
 * The fallback a route error boundary shows (`app/(app)/error.tsx`, inside
 * the app shell, and `app/global-error.tsx`). `retry` is the boundary's own
 * prop (Next 16: re-fetches and re-renders the segment), passed straight
 * through.
 */
export function RouteError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div
        role="alert"
        className="flex max-w-md flex-col items-center gap-3 text-center"
      >
        <TriangleAlertIcon className="size-6 text-destructive" aria-hidden />
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="text-sm text-muted-foreground">
          {routeErrorMessage(error)}
        </p>
        <Button variant="outline" onClick={() => retry()}>
          <RotateCwIcon data-icon="inline-start" />
          Try again
        </Button>
      </div>
    </div>
  );
}
