import { CONTACT_STATUS_LABELS, type ContactStatus } from "@/types";
import { Badge } from "@/components/ui/badge";
import { CONTACT_STATUS_CLASSES } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function ContactStatusBadge({
  status,
  className,
}: {
  status: ContactStatus;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(CONTACT_STATUS_CLASSES[status], className)}
    >
      {CONTACT_STATUS_LABELS[status]}
    </Badge>
  );
}
