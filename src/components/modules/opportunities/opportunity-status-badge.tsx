import { OPPORTUNITY_STATUS_LABELS, type OpportunityStatus } from "@/types";
import { Badge } from "@/components/ui/badge";
import { OPPORTUNITY_STATUS_CLASSES } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function OpportunityStatusBadge({
  status,
  className,
}: {
  status: OpportunityStatus;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(OPPORTUNITY_STATUS_CLASSES[status], className)}
    >
      {OPPORTUNITY_STATUS_LABELS[status]}
    </Badge>
  );
}
