"use client";

import { UsersIcon } from "lucide-react";

import { LEAD_SOURCE_LABELS } from "@/types";
import * as api from "@/lib/api";
import { loadErrorOf, useResource, type Period } from "@/lib/api";
import { LoadError } from "@/components/common/load-error";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPercent, pluralize } from "@/lib/format";
import { BarList } from "./bar-list";
import { REGION_FOCUS, useCardRegion } from "./card-region";

/**
 * Where the period's new contacts came from — the New contacts card broken
 * down, so both show the same total.
 *
 * Bars, not the planned donut: nine sources with close counts is the case a
 * donut reads worst (and past the palette's eight categorical slots), while
 * one-hue bars compare lengths directly and need no colour per source.
 */
export function LeadSourcesCard({ period }: { period: Period }) {
  const sources = useResource(
    "analytics",
    () => api.analytics.leadSources(period),
    period,
  );

  const loadError = loadErrorOf(sources);
  const region = useCardRegion();
  const rows = sources.data ?? [];
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  const widest = Math.max(1, ...rows.map((r) => r.count));

  return (
    <Card {...region.regionProps} className={REGION_FOCUS}>
      <CardHeader>
        <CardTitle id={region.titleId}>Lead sources</CardTitle>
        <CardDescription>
          {sources.isLoading ? (
            <Skeleton className="h-4 w-40" />
          ) : loadError ? (
            "Where new contacts came from."
          ) : (
            `${pluralize(total, "new contact")} in the last ${period} days`
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sources.isLoading ? (
          <Skeleton className="h-52 w-full" />
        ) : loadError ? (
          <LoadError
            title="Could not load lead sources"
            message={loadError.message}
            onRetry={sources.refetch}
            retrying={sources.isRefreshing}
            focusTarget={region.ref}
          />
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
            <UsersIcon className="size-5" aria-hidden />
            No new contacts in this period.
          </div>
        ) : (
          <BarList
            items={rows.map((row) => ({
              key: row.source,
              label: LEAD_SOURCE_LABELS[row.source],
              fraction: row.count / widest,
              value: (
                <>
                  <span className="text-foreground">{row.count}</span> ·{" "}
                  {formatPercent(row.count / total)}
                </>
              ),
            }))}
          />
        )}
      </CardContent>
    </Card>
  );
}
