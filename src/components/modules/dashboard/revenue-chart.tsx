"use client";

import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import type { Kpi } from "@/lib/api";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import { Money } from "@/components/common/money";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { REGION_FOCUS, useCardRegion } from "./card-region";

const CONFIG = {
  total: { label: "Won to date", color: "var(--chart-1)" },
} satisfies ChartConfig;

interface Point {
  date: string;
  /** Won that day. */
  day: number;
  /** Won since the start of the period — the plotted line. */
  total: number;
}

function accumulate(series: Kpi["series"]): Point[] {
  const points: Point[] = [];
  for (const { date, value } of series) {
    const previous = points.at(-1)?.total ?? 0;
    points.push({ date, day: value, total: previous + value });
  }
  return points;
}

/** Series keys are local calendar dates; `parseISO` reads them as local. */
const toDay = (key: string) => parseISO(key);

function RevenueTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload?: Point }[];
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="grid min-w-44 gap-1 rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <div className="font-medium">
        {format(toDay(point.date), "EEE, MMM d")}
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Won that day</span>
        <span className="font-medium tabular-nums">
          {formatMoney(point.day)}
        </span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">Period to date</span>
        <span className="font-medium tabular-nums">
          {formatMoney(point.total)}
        </span>
      </div>
    </div>
  );
}

/**
 * Won revenue accumulated across the period. Plotted cumulative rather than
 * per day: wins are a handful of discrete closes, and a smoothed daily line
 * drew them as rolling hills of revenue on days nothing closed. Cumulative
 * also ends exactly on the headline figure, so the chart checks the number.
 */
export function RevenueChart({
  revenue,
  period,
  isLoading,
  failed = false,
}: {
  revenue: Kpi | undefined;
  period: number;
  isLoading: boolean;
  /** The summary read failed: its alert is in the figures above. */
  failed?: boolean;
}) {
  const points = useMemo(() => accumulate(revenue?.series ?? []), [revenue]);
  const region = useCardRegion();

  return (
    <Card {...region.regionProps} className={cn("lg:col-span-2", REGION_FOCUS)}>
      <CardHeader>
        <CardTitle id={region.titleId}>Won revenue</CardTitle>
        <CardDescription>
          {failed ? (
            "Won revenue across the period."
          ) : isLoading || !revenue ? (
            <Skeleton className="h-4 w-40" />
          ) : (
            <>
              <Money cents={revenue.value} /> closed in the last {period} days
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {failed ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Shows once the summary above loads.
          </p>
        ) : isLoading || !revenue ? (
          <Skeleton className="h-60 w-full" />
        ) : (
          <ChartContainer config={CONFIG} className="aspect-auto h-60 w-full">
            <AreaChart
              data={points}
              margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={24}
                tickFormatter={(key: string) => format(toDay(key), "MMM d")}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={56}
                tickFormatter={(cents: number) =>
                  formatMoney(cents, "USD", { compact: true })
                }
              />
              <ChartTooltip cursor content={<RevenueTooltip />} />
              <Area
                dataKey="total"
                type="stepAfter"
                stroke="var(--color-total)"
                strokeWidth={2}
                fill="var(--color-total)"
                fillOpacity={0.15}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
