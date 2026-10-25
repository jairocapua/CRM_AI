import type { WorkflowStatus } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { TAG_DOT_CLASSES } from "@/lib/constants";
import { cn } from "@/lib/utils";

import { STATUS_COPY } from "./automation-summary";

const STATUS_DOTS: Record<WorkflowStatus, string> = {
  published: TAG_DOT_CLASSES.green,
  draft: TAG_DOT_CLASSES.amber,
  paused: TAG_DOT_CLASSES.slate,
};

/**
 * One automation on the list page: read-only, like the contact page's deal
 * cards. Status is lifecycle copy ("Live", "In development"), never a toggle:
 * automations are code, so there is nothing here for staff to switch. The
 * trigger and owner arrive as finished sentences from `automation-summary.ts`.
 */
export function AutomationCard({
  name,
  description,
  status,
  trigger,
  owner,
}: {
  name: string;
  description?: string;
  status: WorkflowStatus;
  trigger: string;
  owner: string;
}) {
  const copy = STATUS_COPY[status];
  return (
    <Card size="sm" className="h-full">
      <CardContent className="flex flex-1 flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm leading-snug font-medium">{name}</h3>
          <Badge variant="outline" className="shrink-0">
            <span
              aria-hidden
              className={cn("size-1.5 rounded-full", STATUS_DOTS[status])}
            />
            {copy.label}
          </Badge>
        </div>
        {description ? (
          <p className="text-muted-foreground">{description}</p>
        ) : null}
        <dl className="mt-auto flex flex-col gap-1 text-xs">
          <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-2">
            <dt className="text-muted-foreground">Trigger</dt>
            <dd>{trigger}</dd>
          </div>
          <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-2">
            <dt className="text-muted-foreground">Owner</dt>
            <dd>{owner}</dd>
          </div>
        </dl>
        {status === "published" ? null : (
          <p className="text-xs text-muted-foreground">{copy.description}</p>
        )}
      </CardContent>
    </Card>
  );
}
