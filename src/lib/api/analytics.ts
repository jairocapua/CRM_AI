import type { Cents, LeadSource } from "@/types";
import { db } from "@/lib/mock/db";
import { simulate, startOfDayAgo } from "./http";

export type Period = 7 | 30 | 90;

export interface Kpi {
  /** Value over the selected period. */
  value: number;
  /** Same-length window immediately before it, for the delta. */
  previous: number;
  /** Fractional change vs `previous`; null when there is no baseline. */
  delta: number | null;
  /** Per-day series over the period, for the sparkline. */
  series: { date: string; value: number }[];
}

export interface DashboardSummary {
  newContacts: Kpi;
  wonRevenue: Kpi;
  appointments: Kpi;
  messages: Kpi;
  openPipelineValue: Cents;
  weightedForecast: Cents;
  winRate: number | null;
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

/** Anchored to the demo clock, so every window sits over the seeded data. */
const startOf = startOfDayAgo;

/** Buckets timestamps into a per-day series and the two comparison windows. */
function buildKpi(
  timestamps: string[],
  period: Period,
  weights?: number[],
): Kpi {
  const windowStart = startOf(period - 1);
  const previousStart = startOf(period * 2 - 1);

  const buckets = new Map<string, number>();
  for (let i = 0; i < period; i++) {
    buckets.set(
      new Date(startOf(period - 1 - i)).toISOString().slice(0, 10),
      0,
    );
  }

  let value = 0;
  let previous = 0;

  timestamps.forEach((iso, index) => {
    const weight = weights?.[index] ?? 1;
    const time = new Date(iso).getTime();
    if (time >= windowStart) {
      value += weight;
      const key = dayKey(new Date(time).toISOString());
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + weight);
    } else if (time >= previousStart) {
      previous += weight;
    }
  });

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
      const stageProbability = new Map<string, number>();
      for (const pipeline of Object.values(s.pipelines)) {
        for (const stage of pipeline.stages) {
          stageProbability.set(stage.id, stage.probability);
        }
      }

      const won = opportunities.filter((o) => o.status === "won" && o.closedAt);
      const open = opportunities.filter((o) => o.status === "open");
      const closed = opportunities.filter(
        (o) => o.status === "won" || o.status === "lost",
      );

      const openPipelineValue = open.reduce((sum, o) => sum + o.value, 0);
      const weightedForecast = open.reduce(
        (sum, o) =>
          sum +
          Math.round((o.value * (stageProbability.get(o.stageId) ?? 0)) / 100),
        0,
      );

      return {
        newContacts: buildKpi(
          Object.values(s.contacts).map((c) => c.createdAt),
          period,
        ),
        wonRevenue: buildKpi(
          won.map((o) => o.closedAt!),
          period,
          won.map((o) => o.value),
        ),
        appointments: buildKpi(
          Object.values(s.appointments)
            .filter((a) => a.status !== "cancelled")
            .map((a) => a.startAt),
          period,
        ),
        messages: buildKpi(
          Object.values(s.messages).map((m) => m.sentAt),
          period,
        ),
        openPipelineValue,
        weightedForecast,
        winRate: closed.length > 0 ? won.length / closed.length : null,
      };
    },
    { canFail: false, ms: 260 },
  );
}

export interface FunnelStage {
  stageId: string;
  name: string;
  count: number;
  total: Cents;
}

export async function pipelineFunnel(
  pipelineId?: string,
): Promise<FunnelStage[]> {
  return simulate(
    () => {
      const s = db.getState();
      const pipeline = pipelineId
        ? s.pipelines[pipelineId]
        : Object.values(s.pipelines).find((p) => p.isDefault);
      if (!pipeline) return [];

      const deals = Object.values(s.opportunities).filter(
        (o) => o.pipelineId === pipeline.id,
      );

      return pipeline.stages
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((stage) => {
          const inStage = deals.filter((d) => d.stageId === stage.id);
          return {
            stageId: stage.id,
            name: stage.name,
            count: inStage.length,
            total: inStage.reduce((sum, d) => sum + d.value, 0),
          };
        });
    },
    { canFail: false },
  );
}

export interface SourceSlice {
  source: LeadSource;
  count: number;
}

export async function leadSources(): Promise<SourceSlice[]> {
  return simulate(
    () => {
      const counts = new Map<LeadSource, number>();
      for (const contact of Object.values(db.getState().contacts)) {
        counts.set(contact.source, (counts.get(contact.source) ?? 0) + 1);
      }
      return [...counts.entries()]
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count);
    },
    { canFail: false },
  );
}
