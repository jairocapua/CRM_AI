"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangleIcon } from "lucide-react";

import * as api from "@/lib/api";
import { AppBootSkeleton } from "@/components/common/app-boot-skeleton";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";

/**
 * Brings the datastore up before any screen reads it.
 *
 * The mock database is persisted to localStorage, which exists only on the
 * client. If it rehydrated during module evaluation, the server would render an
 * empty store while the client rendered a seeded one, and React would throw a
 * hydration mismatch (and could silently discard the client tree). So the store
 * is created with `skipHydration` and started from here instead: the server and
 * the first client render emit exactly the same skeleton, and real content
 * appears only once the data is in place.
 *
 * The bootstrap itself lives behind the API seam, so this component knows
 * nothing about how the data is stored.
 *
 * A failed bootstrap has to be visible. Without the error branch the promise
 * rejects into nothing and the app sits on the skeleton forever — the one
 * failure mode with no console trace and no way for the user to recover.
 */
export function DbGate({ children }: Readonly<{ children: React.ReactNode }>) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    ok: boolean;
    forAttempt: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    api.settings
      .bootstrap()
      .then(() => {
        if (!cancelled) setResult({ ok: true, forAttempt: attempt });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error("Failed to start the demo workspace", error);
        setResult({ ok: false, forAttempt: attempt });
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // Derived rather than stored, matching `useResource`: a result belongs to the
  // attempt that produced it, so a retry is "still loading" without the effect
  // having to set state on its way in.
  const settled = result?.forAttempt === attempt ? result : null;

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  if (settled && !settled.ok) {
    return (
      <div className="flex min-h-svh flex-1 items-center justify-center p-6">
        <EmptyState
          icon={AlertTriangleIcon}
          title="Could not start the demo workspace"
          description="The local database failed to load. Retrying usually fixes it; if it does not, clearing this site's storage will rebuild the workspace from scratch."
          action={<Button onClick={retry}>Try again</Button>}
        />
      </div>
    );
  }

  if (!settled) return <AppBootSkeleton />;
  return <>{children}</>;
}
