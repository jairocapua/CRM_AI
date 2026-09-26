"use client";

import Link from "next/link";

import * as api from "@/lib/api";
import { useResource } from "@/lib/api";
import { Money } from "@/components/common/money";
import { OpportunityStatusBadge } from "@/components/modules/opportunities/opportunity-status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TAG_DOT_CLASSES } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function ContactOpportunitiesPanel({
  contactId,
}: {
  contactId: string;
}) {
  const opportunities = useResource(
    "opportunities",
    () => api.opportunities.listForContact(contactId),
    contactId,
  );
  const pipelines = useResource("pipelines", () => api.pipelines.list());

  if (opportunities.isLoading) {
    return <Skeleton className="h-20 w-full" />;
  }

  const rows = opportunities.data ?? [];
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No open deals yet.</p>;
  }

  const stagesById = new Map(
    (pipelines.data ?? []).flatMap((pipeline) =>
      pipeline.stages.map((stage) => [stage.id, stage]),
    ),
  );

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-medium">Opportunities</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        {rows.map((opportunity) => {
          const stage = stagesById.get(opportunity.stageId);
          return (
            <Card
              key={opportunity.id}
              size="sm"
              className="transition-colors hover:border-ring/60"
            >
              <CardContent className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <Link
                    href={`/opportunities/${opportunity.id}`}
                    className="text-sm font-medium hover:underline"
                  >
                    {opportunity.name}
                  </Link>
                  <OpportunityStatusBadge status={opportunity.status} />
                </div>
                <Money
                  cents={opportunity.value}
                  currency={opportunity.currency}
                  className="text-sm"
                />
                {stage ? (
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span
                      className={cn(
                        "size-1.5 rounded-full",
                        TAG_DOT_CLASSES[stage.color],
                      )}
                    />
                    {stage.name}
                  </span>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
