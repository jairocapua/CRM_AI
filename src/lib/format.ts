import { differenceInCalendarDays, format } from "date-fns";

import type { Cents, CurrencyCode, ISODate } from "@/types";

/**
 * Money is stored as integer cents and only ever divided at the render edge,
 * so no rounding error can accumulate in stored values.
 */
export function formatMoney(
  cents: Cents,
  currency: CurrencyCode = "USD",
  opts: { compact?: boolean } = {},
): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: opts.compact ? "compact" : "standard",
    maximumFractionDigits: opts.compact ? 1 : cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

export function formatNumber(n: number, compact = false): string {
  return new Intl.NumberFormat("en-US", {
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(n);
}

export function formatPercent(fraction: number, digits = 0): string {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: digits,
  }).format(fraction);
}

/** "+1 (415) 555-0142" for 10/11-digit US numbers; returned as-is otherwise. */
export function formatPhone(raw?: string): string {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return raw;
}

export function initials(first?: string, last?: string): string {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?";
}

export function fullName(c: { firstName: string; lastName: string }): string {
  return `${c.firstName} ${c.lastName}`.trim();
}

export function pluralize(n: number, one: string, many = `${one}s`): string {
  return `${formatNumber(n)} ${n === 1 ? one : many}`;
}

/** Dates are stored as ISO strings; parse only at the render edge. */
export function toDate(iso: ISODate): Date {
  return new Date(iso);
}

/*
 * There is deliberately no `nowIso()` here. Writing timestamps is the API
 * layer's job and it has its own clock (`@/lib/api` -> `nowIso`), anchored to
 * the seeded world rather than to the wall clock. A second one at the render
 * edge would silently stamp records with a different notion of "now".
 */

/**
 * The money edge, in the other direction: forms type dollars, the store holds
 * integer cents. Rounding happens exactly once, here, so no caller has to
 * remember the `* 100`.
 */
export function parseCents(input: string): Cents {
  const amount = Number(input.trim());
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

export function centsToInput(cents: Cents): string {
  if (!cents) return "";
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

/*
 * Chat timestamps. Each takes `now` rather than reading a clock, so the caller
 * passes the demo clock (`apiNow()`) and the inbox agrees with the data.
 */

/** Inbox row: "2:14 PM" today, "Yesterday", "Mon" this week, else "Sep 3". */
export function formatInboxTime(iso: ISODate, now: Date): string {
  const date = toDate(iso);
  const days = differenceInCalendarDays(now, date);
  if (days <= 0) return format(date, "h:mm a");
  if (days === 1) return "Yesterday";
  if (days < 7) return format(date, "EEE");
  if (date.getFullYear() === now.getFullYear()) return format(date, "MMM d");
  return format(date, "MMM d, yyyy");
}

/** Thread day separator: "Today", "Yesterday", "Monday, September 3". */
export function formatDayLabel(iso: ISODate, now: Date): string {
  const date = toDate(iso);
  const days = differenceInCalendarDays(now, date);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (date.getFullYear() === now.getFullYear()) {
    return format(date, "EEEE, MMMM d");
  }
  return format(date, "EEEE, MMMM d, yyyy");
}

/** "2:14 PM" — the time under a message bubble. */
export function formatClockTime(iso: ISODate): string {
  return format(toDate(iso), "h:mm a");
}

/** "12m 03s" / "45s" for call durations. */
export function formatDuration(totalSec: number): string {
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return minutes > 0
    ? `${minutes}m ${String(seconds).padStart(2, "0")}s`
    : `${seconds}s`;
}
