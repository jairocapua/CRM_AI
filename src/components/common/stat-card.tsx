"use client";

import { ArrowDownRightIcon, ArrowUpRightIcon } from "lucide-react";
import { Area, AreaChart } from "recharts";

import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

const SPARK_CONFIG = {
  value: { label: "Value", color: "var(--chart-1)" },
} satisfies ChartConfig;

/**
 * Change vs the previous period. The arrow wears the reserved status hue; the
 * figure stays in text ink (the status greens and reds are too light for small
 * text on a white card), so the sign and arrow carry it, never hue alone.
 * `null` means there was nothing to compare against.
 */
function Delta({ delta }: { delta: number | null }) {
  if (delta === null) {
    return (
      <span className="text-xs text-muted-foreground">No prior period</span>
    );
  }
  const up = delta >= 0;
  const Icon = up ? ArrowUpRightIcon : ArrowDownRightIcon;
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground tabular-nums">
      <Icon
        className={cn(
          "size-3.5",
          up ? "text-status-good" : "text-status-critical",
        )}
        aria-hidden
      />
      {up ? "+" : "−"}
      {formatPercent(Math.abs(delta))}
      <span className="sr-only">{up ? " increase" : " decrease"}</span>
    </span>
  );
}

/**
 * A headline number with its trend. The sparkline is decoration for the
 * figure beside it — no axes, no tooltip — so the number itself is the
 * accessible reading and the chart is hidden from assistive tech.
 */
export function StatCard({
  title,
  value,
  delta,
  series,
  footer,
  isLoading,
}: {
  title: string;
  value: React.ReactNode;
  delta: number | null;
  series: { date: string; value: number }[];
  footer?: React.ReactNode;
  isLoading?: boolean;
}) {
  return (
    <Card size="sm" className="gap-2">
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        {isLoading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <CardTitle className="flex items-baseline gap-2 text-2xl font-semibold tabular-nums">
            {value}
            <Delta delta={delta} />
          </CardTitle>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {isLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <ChartContainer
            config={SPARK_CONFIG}
            className="aspect-auto h-10 w-full"
            aria-hidden
          >
            <AreaChart
              data={series}
              // Decorative: recharts' accessibility layer would make the
              // aria-hidden chart a tab stop.
              accessibilityLayer={false}
              margin={{ top: 2, right: 0, bottom: 0, left: 0 }}
            >
              <Area
                dataKey="value"
                type="linear"
                stroke="var(--color-value)"
                strokeWidth={2}
                fill="var(--color-value)"
                fillOpacity={0.12}
                isAnimationActive={false}
              />
            </AreaChart>
          </ChartContainer>
        )}
        {footer && !isLoading ? (
          <p className="text-xs text-muted-foreground">{footer}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
