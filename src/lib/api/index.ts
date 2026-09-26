/**
 * The API seam.
 *
 * Components call `api.contacts.list()` and never touch the store directly.
 * Behind these modules sits a mock database in `@/lib/mock`; in front of them
 * is code that already looks exactly like it is talking to a real backend.
 * Swapping in that backend means rewriting the bodies in this folder — the
 * signatures, the `Page`/`ListQuery` contract and every call site stay put.
 *
 * ESLint enforces the boundary: nothing outside `src/lib/api/**` may import
 * `@/lib/mock/*`.
 */
export * as activities from "./activities";
export * as analytics from "./analytics";
export * as calendars from "./calendars";
export * as contacts from "./contacts";
export * as conversations from "./conversations";
export * as customFields from "./custom-fields";
export * as opportunities from "./opportunities";
export * as pipelines from "./pipelines";
export * as settings from "./settings";
export * as smartLists from "./smart-lists";
export * as tags from "./tags";
export * as tasks from "./tasks";
export * as templates from "./templates";
export * as users from "./users";
export * as workflows from "./workflows";

export type { StageRollup } from "./opportunities";
export type {
  ChannelOption,
  ComposableChannel,
  ConversationRow,
} from "./conversations";
export { ApiError } from "./http";
export type { ListQuery, Page, Tuning } from "./http";
/**
 * The app's clock. Components that need "now" — a relative timestamp, a
 * default due date — must take it from here, not from `new Date()`, or they
 * will disagree with the seeded world. See `@/lib/mock/clock`.
 */
export { apiNow, nowIso } from "./http";
export { invalidate, invalidateAll } from "./cache";
export type { ResourceKey } from "./cache";
export { useAction, useResource } from "./use-resource";
