"use client";

import { useState } from "react";

import * as api from "@/lib/api";
import { useResource, type Period } from "@/lib/api";
import { Money } from "@/components/common/money";
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatNumber, formatPercent, pluralize } from "@/lib/format";
import { ActivityFeed } from "./activity-feed";
import { DueTasksCard } from "./due-tasks-card";
import { LeadSourcesCard } from "./lead-sources-card";
import { PipelineCard } from "./pipeline-card";
import { RevenueChart } from "./revenue-chart";
import { UpcomingAppointmentsCard } from "./upcoming-appointments-card";

const PERIODS: Period[] = [7, 30, 90];

const EMPTY_KPI = { value: 0, previous: 0, delta: null, series: [] };

export function Dashboard() {
  const [period, setPeriod] = useState<Period>(30);
  const summary = useResource(
    "analytics",
    () => api.analytics.summary(period),
    period,
  );

  const data = summary.data;
  const loading = summary.isLoading;
  const winRate = data?.winRate;

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <PageHeader
        title="Dashboard"
        description="Pipeline, revenue and activity at a glance."
        actions={
          <ToggleGroup
            variant="outline"
            size="sm"
            spacing={0}
            value={[String(period)]}
            onValueChange={(value) => {
              // Pressing the active item empties the group; keep the period.
              const next = Number(value[0]);
              if (PERIODS.includes(next as Period)) setPeriod(next as Period);
            }}
            aria-label="Period"
          >
            {PERIODS.map((p) => (
              <ToggleGroupItem key={p} value={String(p)} className="px-3">
                {p}d
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="New contacts"
          isLoading={loading}
          value={formatNumber(data?.newContacts.value ?? 0)}
          delta={data?.newContacts.delta ?? null}
          series={(data?.newContacts ?? EMPTY_KPI).series}
          footer={`vs ${formatNumber(data?.newContacts.previous ?? 0)} the ${period} days before`}
        />
        <StatCard
          title="Won revenue"
          isLoading={loading}
          value={<Money cents={data?.wonRevenue.value ?? 0} compact />}
          delta={data?.wonRevenue.delta ?? null}
          series={(data?.wonRevenue ?? EMPTY_KPI).series}
          footer={
            winRate?.value == null
              ? "No deals closed in this period"
              : `${formatPercent(winRate.value)} win rate · ${winRate.won} of ${pluralize(winRate.closed, "closed deal")}`
          }
        />
        <StatCard
          title="Appointments"
          isLoading={loading}
          value={formatNumber(data?.appointments.value ?? 0)}
          delta={data?.appointments.delta ?? null}
          series={(data?.appointments ?? EMPTY_KPI).series}
          footer="Held or no-show; cancellations excluded"
        />
        <StatCard
          title="Messages"
          isLoading={loading}
          value={formatNumber(data?.messages.value ?? 0)}
          delta={data?.messages.delta ?? null}
          series={(data?.messages ?? EMPTY_KPI).series}
          footer="Sent and received; calls excluded"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <RevenueChart
          revenue={data?.wonRevenue}
          period={period}
          isLoading={loading}
        />
        <LeadSourcesCard period={period} />

        <PipelineCard />
        <DueTasksCard />

        <ActivityFeed />
        <UpcomingAppointmentsCard />
      </div>
    </div>
  );
}
