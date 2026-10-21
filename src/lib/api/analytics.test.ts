import { describe, expect, it, vi } from "vitest";

import type { Contact } from "@/types";
import { seededWorld, settle } from "@/lib/mock/testing";
import type { DashboardSummary, Kpi, Period } from "./analytics";

/**
 * The Phase 6 reconcile contract: every KPI's per-day series sums to its
 * headline value, with one bucket per local calendar day of the window, and
 * the lead-source bars total the New contacts card.
 *
 * Phase 6 fixed a bug where windows were cut at local midnight but buckets
 * were keyed by UTC date. East of Greenwich the last hours of every local day
 * landed in a bucket the chart did not have, so today's bar read zero while the
 * headline counted it. The zones below straddle the date line at the seed
 * anchor (09:00 UTC): in Singapore it is already 17:00 on the 8th, in Honolulu
 * still 23:00 on the 7th. Reverting the fix fails these cases on the series
 * length, the series dates and the per-day counts.
 */

const DAY = 86_400_000;
const KPIS = ["newContacts", "wonRevenue", "appointments", "messages"] as const;
const PERIODS: Period[] = [7, 30, 90];

interface Zone {
  zone: string;
  /** `getTimezoneOffset()` at the anchor: proves the TZ override took. */
  offset: number;
  /** The local calendar date at the anchor; the last bucket of every series. */
  today: string;
  /** The first bucket's date, per period. */
  first: Record<Period, string>;
}

const ZONES: Zone[] = [
  {
    zone: "Asia/Singapore",
    offset: -480,
    today: "2026-09-08",
    first: { 7: "2026-09-02", 30: "2026-08-10", 90: "2026-06-11" },
  },
  {
    zone: "UTC",
    offset: 0,
    today: "2026-09-08",
    first: { 7: "2026-09-02", 30: "2026-08-10", 90: "2026-06-11" },
  },
  {
    zone: "America/Los_Angeles",
    offset: 420,
    today: "2026-09-08",
    first: { 7: "2026-09-02", 30: "2026-08-10", 90: "2026-06-11" },
  },
  {
    zone: "Pacific/Honolulu",
    offset: 600,
    today: "2026-09-07",
    first: { 7: "2026-09-01", 30: "2026-08-09", 90: "2026-06-10" },
  },
];

/** `count` consecutive dates ending on `last`, by UTC date arithmetic only. */
function datesEnding(last: string, count: number): string[] {
  const end = Date.parse(`${last}T00:00:00.000Z`);
  return Array.from({ length: count }, (_, i) =>
    new Date(end - (count - 1 - i) * DAY).toISOString().slice(0, 10),
  );
}

/** The calendar date of an instant in `zone`: an oracle independent of TZ. */
function localDate(zone: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return (iso: string) => {
    const parts = Object.fromEntries(
      fmt.formatToParts(new Date(iso)).map((p) => [p.type, p.value]),
    );
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
}

const sum = (kpi: Kpi) => kpi.series.reduce((total, d) => total + d.value, 0);

async function loadWorld(zone: Zone, period: Period) {
  vi.stubEnv("TZ", zone.zone);
  // A TZ override that silently failed would run every case in UTC.
  expect(new Date("2026-09-08T09:00:00.000Z").getTimezoneOffset()).toBe(
    zone.offset,
  );

  await seededWorld();
  const analytics = await import("./analytics");
  const contacts = await import("./contacts");

  const summary: DashboardSummary = await settle(analytics.summary(period));
  const sources = await settle(analytics.leadSources(period));
  const everyone: Contact[] = (await settle(contacts.list())).rows;
  return { summary, sources, everyone };
}

describe.each(ZONES)("dashboard reconcile in $zone", (zone) => {
  it.each(PERIODS)(
    "%i days: every KPI's series sums to its value",
    async (period) => {
      const { summary } = await loadWorld(zone, period);
      const expectedDates = datesEnding(zone.today, period);

      // Soft, so a regression reports every broken property of every KPI.
      for (const key of KPIS) {
        const kpi = summary[key];
        const dates = kpi.series.map((d) => d.date);

        expect.soft(kpi.series, `${key} length`).toHaveLength(period);
        expect.soft(dates, `${key} dates`).toEqual(expectedDates);
        expect.soft(dates[0], `${key} first date`).toBe(zone.first[period]);
        expect.soft(dates.at(-1), `${key} last date`).toBe(zone.today);
        expect.soft(sum(kpi), `${key} sum(series)`).toBe(kpi.value);
      }
    },
  );

  it.each(PERIODS)(
    "%i days: each New contacts bar counts that local day",
    async (period) => {
      const { summary, everyone } = await loadWorld(zone, period);
      const dayOf = localDate(zone.zone);

      const counted = new Map<string, number>();
      for (const contact of everyone) {
        const day = dayOf(contact.createdAt);
        counted.set(day, (counted.get(day) ?? 0) + 1);
      }

      for (const { date, value } of summary.newContacts.series) {
        expect(value, date).toBe(counted.get(date) ?? 0);
      }
    },
  );

  it.each(PERIODS)(
    "%i days: lead sources total the New contacts card",
    async (period) => {
      const { summary, sources } = await loadWorld(zone, period);
      const total = sources.reduce((n, s) => n + s.count, 0);
      expect(total).toBe(summary.newContacts.value);
    },
  );
});

describe("the reconcile cases are not vacuous", () => {
  const singapore = ZONES[0]!;

  it("every KPI has data over 90 days", async () => {
    const { summary } = await loadWorld(singapore, 90);
    for (const key of KPIS) expect(summary[key].value, key).toBeGreaterThan(0);
  });

  it("Singapore's 7-day messages chart has a non-zero bar for today", async () => {
    // The exact Phase 6 symptom: today's bar read zero east of Greenwich.
    const { summary } = await loadWorld(singapore, 7);
    const today = summary.messages.series.at(-1);
    expect(today?.date).toBe(singapore.today);
    expect(today?.value).toBeGreaterThan(0);
  });
});
