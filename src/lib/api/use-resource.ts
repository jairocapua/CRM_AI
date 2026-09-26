"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { ApiError } from "./http";
import { revisionOf, subscribeCache, type ResourceKey } from "./cache";

interface Resolved<T> {
  data: T | undefined;
  error: ApiError | null;
  /** The request signature this result belongs to. */
  forRequest: string | null;
  /** The query (resource + cacheKey, no revision) this result belongs to. */
  forQuery: string | null;
}

/**
 * Reads a resource and refetches when that resource is invalidated.
 *
 * `cacheKey` is the caller's dependency signature — usually a serialised query.
 * It lets the effect keep a literal dependency array (React's lint rules
 * require one) while still refetching whenever the query changes.
 *
 * Both flags are *derived*, not stored, which avoids a synchronous setState in
 * the effect body and the extra render pass it would cause:
 *
 * - `isLoading` — there is no result yet for this query (`key` + `cacheKey`):
 *   the first load, or the caller asked for something different. Show a
 *   skeleton.
 * - `isRefreshing` — the query is unchanged but a refetch is in flight because
 *   the resource was invalidated or `refetch()` was called. The previous data
 *   stays on screen. Gating a skeleton on this instead would blank the screen
 *   after every mutation — and a conversation thread invalidates several times
 *   per message sent.
 *
 * Fetching always happens in an effect, never during render — the mock store is
 * hydrated only on the client, so reading it while rendering would produce a
 * server/client mismatch. `getServerSnapshot` returns a constant, which keeps
 * `useSyncExternalStore` SSR-safe.
 */
export function useResource<T>(
  key: ResourceKey,
  fetcher: () => Promise<T>,
  cacheKey: string | number = "",
) {
  const revision = useSyncExternalStore(
    subscribeCache,
    () => revisionOf(key),
    () => 0,
  );

  const [attempt, setAttempt] = useState(0);
  const query = `${key}|${cacheKey}`;
  const request = `${query}|${revision}|${attempt}`;

  const [resolved, setResolved] = useState<Resolved<T>>({
    data: undefined,
    error: null,
    forRequest: null,
    forQuery: null,
  });

  // Synced in an effect rather than during render, so callers may pass an
  // inline closure without triggering the refs-during-render rule.
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  useEffect(() => {
    let active = true;

    fetcherRef
      .current()
      .then((data) => {
        if (active) {
          setResolved({
            data,
            error: null,
            forRequest: request,
            forQuery: query,
          });
        }
      })
      .catch((error: unknown) => {
        if (!active) return;
        setResolved((prev) => ({
          // Keep the last good data only if it answers this same query.
          data: prev.forQuery === query ? prev.data : undefined,
          error:
            error instanceof ApiError
              ? error
              : new ApiError("Something went wrong.", 500),
          forRequest: request,
          forQuery: query,
        }));
      });

    return () => {
      active = false;
    };
  }, [request, query]);

  const refetch = useCallback(() => setAttempt((n) => n + 1), []);

  return {
    data: resolved.data,
    // Like data, the last error stands while the same query refreshes, so an
    // error screen (a 404, say) does not flash to a skeleton on every
    // unrelated invalidation. A successful refetch clears it.
    error: resolved.forQuery === query ? resolved.error : null,
    isLoading: resolved.forQuery !== query,
    isRefreshing:
      resolved.forQuery === query && resolved.forRequest !== request,
    refetch,
  } as const;
}

/** Wraps a mutation with a pending flag. Errors propagate to the caller. */
export function useAction<TArgs extends unknown[], TResult>(
  action: (...args: TArgs) => Promise<TResult>,
) {
  const [isPending, setPending] = useState(false);

  const run = useCallback(
    async (...args: TArgs): Promise<TResult> => {
      setPending(true);
      try {
        return await action(...args);
      } finally {
        setPending(false);
      }
    },
    [action],
  );

  return [run, isPending] as const;
}
