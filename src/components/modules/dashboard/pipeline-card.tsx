"use client";

import { useState } from "react";
import { ArrowRightIcon } from "lucide-react";

import * as api from "@/lib/api";
import { useResource } from "@/lib/api";
import { Money } from "@/components/common/money";
import { LinkButton } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { TAG_DOT_CLASSES } from "@/lib/constants";
import { pluralize } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BarList } from "./bar-list";

/**
 * Live deals by stage for one pipeline. The figures are the board's own —
 * same rollup, same live-deal rule — so this card and the board's summary
 * line read identically. It is a stage distribution, not a conversion funnel:
 * the data holds each deal's current stage, not the path it took.
 */
export function PipelineCard() {
  const pipelines = useResource("pipelines", () => api.pipelines.list());
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const selected =
    (pipelines.data ?? []).find((p) => p.id === pipelineId) ??
    (pipelines.data ?? []).find((p) => p.isDefault) ??
    pipelines.data?.[0];

  const summary = useResource(
    "analytics",
    () =>
      selected
        ? api.analytics.pipelineSummary(selected.id)
        : Promise.resolve(null),
    selected?.id ?? "none",
  );

  const data = summary.data;
  const widest = Math.max(1, ...(data?.stages ?? []).map((s) => s.total));

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Deals by stage</CardTitle>
        <CardDescription>
          {summary.isLoading || !data ? (
            <Skeleton className="h-4 w-64" />
          ) : (
            <>
              {pluralize(data.liveCount, "live deal")} ·{" "}
              <Money
                cents={data.total}
                currency={data.currency}
                className="font-medium text-foreground"
              />{" "}
              pipeline value ·{" "}
              <Money
                cents={data.weighted}
                currency={data.currency}
                className="font-medium text-foreground"
              />{" "}
              weighted forecast
            </>
          )}
        </CardDescription>
        <CardAction>
          {selected ? (
            <Select
              value={selected.id}
              onValueChange={(value) => setPipelineId(value ?? selected.id)}
            >
              <SelectTrigger size="sm" className="w-44" aria-label="Pipeline">
                <SelectValue>
                  {(value: string) =>
                    pipelines.data?.find((p) => p.id === value)?.name ??
                    "Pipeline"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(pipelines.data ?? []).map((pipeline) => (
                  <SelectItem key={pipeline.id} value={pipeline.id}>
                    {pipeline.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </CardAction>
      </CardHeader>
      <CardContent>
        {summary.isLoading || !data ? (
          <Skeleton className="h-52 w-full" />
        ) : (
          <BarList
            items={data.stages.map((stage) => ({
              key: stage.stageId,
              label: stage.name,
              leading: (
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    TAG_DOT_CLASSES[stage.color],
                  )}
                  aria-hidden
                />
              ),
              fraction: stage.total / widest,
              value: (
                <>
                  {stage.count} ·{" "}
                  <Money
                    cents={stage.total}
                    currency={data.currency}
                    compact
                    className="text-foreground"
                  />
                </>
              ),
            }))}
          />
        )}
      </CardContent>
      <CardFooter>
        <LinkButton href="/opportunities" variant="ghost" size="sm">
          Open board
          <ArrowRightIcon />
        </LinkButton>
      </CardFooter>
    </Card>
  );
}
