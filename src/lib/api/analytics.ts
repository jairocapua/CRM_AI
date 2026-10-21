import { addDays, format } from "date-fns";

import type {
  Cents,
  Channel,
  CurrencyCode,
  ID,
  LeadSource,
  TagColor,
} from "@/types";
import { db } from "@/lib/mock/db";
import { apiNowMs, simulate, startOfDayAgo } from "./http";
import { isDeadDeal, rollupByStage } from "./opportunities";

export type Period = 7 | 30 | 90;

export interface Kpi {
  /** Value over the selected period. Always equals the sum of `series`. */
  value: number;
  /** Same-length window immediately before it, for the delta. */
  previous: number;
  /** Fractional change vs `previous`; null when there is no baseline. */
  delta: number | null;
  /** Per-day series over the period, keyed by local calendar date. */
  series: { date: string; value: number }[];
}

/** Won over closed, for deals that closed inside the period. */
export interface WinRate {
  value: number | null;
  won: number;
  closed: number;
}

export interface DashboardSummary {
  newContacts: Kpi;
  /** Cents. */
  wonRevenue: Kpi;
  /** Non-cancelled appointments whose start has passed. */
  appointments: Kpi;
  /** Messages both ways; calls and voicemail are not messages. */
  messages: Kpi;
  winRate: WinRate;
}

const NOT_MESSAGES = new Set<Channel>(["call", "voicemail"]);

/** Local calendar date — the same zone the windows are cut in. */
function dayKey(ms: number): string {
  return format(ms, "yyyy-MM-dd");
}

/**
 * The window a KPI covers: local midnight `period - 1` days ago up to *now* on
 * the demo clock. The upper bound matters — appointments run a month ahead,
 * and without it every upcoming booking counted as one already held.
 */
function windowOf(period: Period) {
  return {
    start: startOfDayAgo(period - 1),
    previousStart: startOfDayAgo(period * 2 - 1),
    end: apiNowMs(),
  };
}

/**
 * Buckets timestamps into a per-day series and the two comparison windows.
 *
 * Window bounds and bucket keys are both local, so every timestamp inside the
 * window has a bucket and the series always sums to `value`. (Keying buckets
 * by UTC date while cutting the window at local midnight dropped the last
 * hours of every day from the chart east of Greenwich.)
 */
function buildKpi(
  points: { at: string; weight?: number }[],
  period: Period,
): Kpi {
  const { start, previousStart, end } = windowOf(period);

  const buckets = new Map<string, number>();
  for (let i = 0; i < period; i++) buckets.set(dayKey(+addDays(start, i)), 0);

  let value = 0;
  let previous = 0;

  for (const { at, weight = 1 } of points) {
    const time = new Date(at).getTime();
    if (time > end || time < previousStart) continue;
    if (time < start) {
      previous += weight;
      continue;
    }
    value += weight;
    const key = dayKey(time);
    buckets.set(key, (buckets.get(key) ?? 0) + weight);
  }

  return {
    value,
    previous,
    delta: previous > 0 ? (value - previous) / previous : null,
    series: [...buckets.entries()].map(([date, v]) => ({ date, value: v })),
  };
}

/**
 * Every number here is derived from the store, never hardcoded — so the
 * dashboard always reconciles against what the other modules show.
 */
export async function summary(period: Period = 30): Promise<DashboardSummary> {
  return simulate(
    () => {
      const s = db.getState();
      const opportunities = Object.values(s.opportunities);
      const { start, end } = windowOf(period);

      const won = opportunities.filter((o) => o.status === "won" && o.closedAt);
      const closedInWindow = opportunities.filter((o) => {
        if (o.status === "open" || !o.closedAt) return false;
        const at = new Date(o.closedAt).getTime();
        return at >= start && at <= end;
      });
      const wonInWindow = closedInWindow.filter((o) => o.status === "won");

      return {
        newContacts: buildKpi(
          Object.values(s.contacts).map((c) => ({ at: c.createdAt })),
          period,
        ),
        wonRevenue: buildKpi(
          won.map((o) => ({ at: o.closedAt!, weight: o.value })),
          period,
        ),
        appointments: buildKpi(
          Object.values(s.appointments)
            .filter((a) => a.status !== "cancelled")
            .map((a) => ({ at: a.startAt })),
          period,
        ),
        messages: buildKpi(
          Object.values(s.messages)
            .filter((m) => !NOT_MESSAGES.has(m.channel))
            .map((m) => ({ at: m.sentAt })),
          period,
        ),
        winRate: {
          value:
            closedInWindow.length > 0
              ? wonInWindow.length / closedInWindow.length
              : null,
          won: wonInWindow.length,
          closed: closedInWindow.length,
        },
      };
    },
    { canFail: false, ms: 260 },
  );
}

export interface PipelineStageSummary {
  stageId: ID;
  name: string;
  color: TagColor;
  count: number;
  total: Cents;
  weighted: Cents;
}

export interface PipelineSummary {
  pipelineId: ID;
  name: string;
  currency: CurrencyCode;
  stages: PipelineStageSummary[];
  /** Live deals: open and won. Lost and abandoned never count. */
  liveCount: number;
  total: Cents;
  weighted: Cents;
}

/**
 * One pipeline's live deals by stage — the same rollup, over the same deals,
 * as the board's column headers and its summary line, so the two screens
 * cannot disagree. Pipelines are never summed together: they measure
 * different things (Client Onboarding is post-sale work, so adding it to
 * Sales would count won revenue twice).
 */
export async function pipelineSummary(
  pipelineId?: ID,
): Promise<PipelineSummary | null> {
  return simulate(
    () => {
      const s = db.getState();
      const pipeline =
        (pipelineId ? s.pipelines[pipelineId] : undefined) ??
        Object.values(s.pipelines).find((p) => p.isDefault);
      if (!pipeline) return null;

      const live = Object.values(s.opportunities).filter(
        (o) => o.pipelineId === pipeline.id && !isDeadDeal(o),
      );
      const stages = pipeline.stages
        .slice()
        .sort((a, b) => a.position - b.position);
      const rollups = rollupByStage(live, stages);

      const rows = stages.map((stage) => {
        const rollup = rollups.get(stage.id);
        return {
          stageId: stage.id,
          name: stage.name,
          color: stage.color,
          count: rollup?.count ?? 0,
          total: rollup?.total ?? 0,
          weighted: rollup?.weighted ?? 0,
        };
      });

      return {
        pipelineId: pipeline.id,
        name: pipeline.name,
        currency: pipeline.currency,
        stages: rows,
        liveCount: live.length,
        total: rows.reduce((sum, r) => sum + r.total, 0),
        weighted: rows.reduce((sum, r) => sum + r.weighted, 0),
      };
    },
    { canFail: false },
  );
}

export interface SourceSlice {
  source: LeadSource;
  count: number;
}

/**
 * Contacts created in the period, by source — the New contacts card broken
 * down, so the two always share a total.
 */
export async function leadSources(period: Period = 30): Promise<SourceSlice[]> {
  return simulate(
    () => {
      const { start, end } = windowOf(period);
      const counts = new Map<LeadSource, number>();
      for (const contact of Object.values(db.getState().contacts)) {
        const at = new Date(contact.createdAt).getTime();
        if (at < start || at > end) continue;
        counts.set(contact.source, (counts.get(contact.source) ?? 0) + 1);
      }
      return [...counts.entries()]
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source));
    },
    { canFail: false },
  );
}
