/**
 * A revision bus — React Query in about thirty lines.
 *
 * Mutations bump a counter per resource; `useResource` subscribes and refetches
 * when its key changes. When a real backend lands this maps directly onto
 * `queryClient.invalidateQueries({ queryKey: [key] })`.
 */
export type ResourceKey =
  | "contacts"
  | "conversations"
  | "opportunities"
  | "pipelines"
  | "appointments"
  | "calendars"
  | "workflows"
  | "tasks"
  | "notes"
  | "activities"
  | "tags"
  | "customFields"
  | "users"
  | "smartLists"
  | "templates"
  | "settings"
  | "analytics";

const revisions = new Map<ResourceKey, number>();
const listeners = new Set<() => void>();

export function revisionOf(key: ResourceKey): number {
  return revisions.get(key) ?? 0;
}

export function invalidate(...keys: ResourceKey[]) {
  for (const key of keys) revisions.set(key, revisionOf(key) + 1);
  for (const listener of listeners) listener();
}

export function subscribeCache(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** Everything changed — used after a reseed. */
export function invalidateAll() {
  for (const key of revisions.keys()) revisions.set(key, revisionOf(key) + 1);
  // Keys never yet read still need to notify subscribers mounted since.
  invalidate(
    "contacts",
    "conversations",
    "opportunities",
    "pipelines",
    "appointments",
    "calendars",
    "workflows",
    "tasks",
    "notes",
    "activities",
    "tags",
    "customFields",
    "users",
    "smartLists",
    "templates",
    "settings",
    "analytics",
  );
}
