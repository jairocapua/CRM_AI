export { applyQuery } from "@/lib/mock/query-engine";
export type { ListQuery, Page } from "@/lib/mock/query-engine";

/**
 * The app's clock. Every timestamp written by this layer comes from `nowIso()`
 * and every "last N days" window from `startOfDayAgo()`, so the read paths and
 * the fixtures share one anchor. See `@/lib/mock/clock` for why that matters.
 */
export {
  apiNow,
  apiNowMs,
  endOfTodayIso,
  nowIso,
  startOfDayAgo,
} from "@/lib/mock/clock";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code = "ERROR",
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface Tuning {
  /** Base round-trip latency in milliseconds. */
  latencyMs: number;
  /** 0–1. Spread applied around the base latency. */
  jitter: number;
  /** 0–1. Share of mutating calls that fail, for exercising error states. */
  failureRate: number;
}

const DEFAULT_TUNING: Tuning = { latencyMs: 220, jitter: 0.5, failureRate: 0 };

let tuning: Tuning = { ...DEFAULT_TUNING };

/** Read at call time, so the Settings → Demo Data sliders take effect live. */
export function getTuning(): Tuning {
  return tuning;
}

export function setTuning(next: Partial<Tuning>) {
  tuning = { ...tuning, ...next };
}

export function resetTuning() {
  tuning = { ...DEFAULT_TUNING };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * The only place latency and failure are simulated.
 *
 * Every resource function funnels through here, so replacing this file's body
 * with `fetch()` is the entire backend migration — call sites already `await`
 * an API-shaped promise and already handle ApiError.
 */
export async function simulate<T>(
  work: () => T,
  opts: { ms?: number; canFail?: boolean } = {},
): Promise<T> {
  const { latencyMs, jitter, failureRate } = tuning;
  const base = opts.ms ?? latencyMs;
  await sleep(base * (1 - jitter / 2 + Math.random() * jitter));

  if (
    opts.canFail !== false &&
    failureRate > 0 &&
    Math.random() < failureRate
  ) {
    throw new ApiError(
      "Network request failed. Please try again.",
      503,
      "MOCK_FAILURE",
    );
  }

  return work();
}

export function notFound(what: string, id: string): never {
  throw new ApiError(`${what} ${id} was not found.`, 404, "NOT_FOUND");
}
