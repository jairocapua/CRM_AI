import type { ISODate } from "@/types";
import { db } from "./db";

/**
 * The demo world's present moment.
 *
 * Fixtures are anchored to a fixed reference date so the workspace is
 * reproducible (see `seed/rng.ts`). Read paths must share that anchor. If they
 * measured "the last 7 days" from the real clock instead, every dashboard
 * window would slide off the seeded data as real time passed: a month from now
 * the KPIs would read zero against 240 contacts, the calendar would show no
 * upcoming appointments, and nothing would look broken enough to debug.
 *
 * So "now" is the seed's reference date, advanced by however long the app has
 * been open. Windows stay pinned to the data, and timestamps written during a
 * session still move forward, so records created later sort after earlier ones
 * instead of piling up on one identical instant.
 *
 * The clock must also never run backwards, or a message sent after a refresh
 * would be stamped earlier than one sent before it and sort above it. Session
 * time alone restarts at the reference date on every page load, so the last
 * timestamp issued is persisted and the next session resumes from there. Time
 * therefore advances only while the app is open: a workspace left alone for a
 * month does not drift off its data.
 *
 * An unseeded store (cleared workspace) has no anchor, so it falls back to the
 * real clock. Against a real backend this whole file collapses to
 * `new Date()` — the server's clock and the data's clock are the same thing.
 */
const CLOCK_KEY = "nimbus-crm-clock";
const sessionStart = Date.now();

/** Where this session's clock starts, per seeded world. Read once. */
let resumed: { seededAt: ISODate; base: number } | null = null;
let lastIssued = 0;

function readHighWater(): { seededAt: ISODate; at: number } | null {
  try {
    const raw = window.localStorage.getItem(CLOCK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { seededAt?: unknown; at?: unknown };
    return typeof parsed.seededAt === "string" && typeof parsed.at === "number"
      ? { seededAt: parsed.seededAt, at: parsed.at }
      : null;
  } catch {
    return null;
  }
}

function writeHighWater(seededAt: ISODate, at: number) {
  try {
    window.localStorage.setItem(CLOCK_KEY, JSON.stringify({ seededAt, at }));
  } catch {
    /* Quota or privacy mode: the clock still works for this session. */
  }
}

function baseFor(seededAt: ISODate): number {
  if (resumed?.seededAt === seededAt) return resumed.base;
  const anchor = new Date(seededAt).getTime();
  const saved = readHighWater();
  const base =
    saved?.seededAt === seededAt ? Math.max(anchor, saved.at) : anchor;
  resumed = { seededAt, base };
  return base;
}

export function apiNow(): Date {
  const { seededAt } = db.getState();
  if (!seededAt) return new Date();
  const ms = baseFor(seededAt) + (Date.now() - sessionStart);
  return new Date(Math.max(ms, lastIssued));
}

/** Milliseconds since the epoch, on the demo clock. */
export function apiNowMs(): number {
  return apiNow().getTime();
}

/**
 * The single writer of timestamps. Every `createdAt`/`updatedAt` comes here.
 * Strictly increasing, so two writes in the same millisecond still order.
 */
export function nowIso(): ISODate {
  const { seededAt } = db.getState();
  // A cleared workspace runs on the real clock; that must not leak into the
  // demo clock once the workspace is reseeded.
  if (!seededAt) return new Date().toISOString();
  let ms = apiNowMs();
  if (ms <= lastIssued) ms = lastIssued + 1;
  lastIssued = ms;
  writeHighWater(seededAt, ms);
  return new Date(ms).toISOString();
}

/** Local midnight `daysAgo` days back, on the demo clock. */
export function startOfDayAgo(daysAgo: number): number {
  const d = apiNow();
  d.setHours(0, 0, 0, 0);
  return d.getTime() - daysAgo * 86_400_000;
}

/** The last instant of the demo world's "today", as an ISO string. */
export function endOfTodayIso(): ISODate {
  const d = apiNow();
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}
