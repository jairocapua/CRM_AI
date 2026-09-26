import type { Tag } from "@/types";
import { Badge } from "@/components/ui/badge";
import { TAG_COLOR_CLASSES } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function TagBadge({
  tag,
  className,
}: {
  tag: Pick<Tag, "name" | "color">;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(TAG_COLOR_CLASSES[tag.color], className)}
    >
      {tag.name}
    </Badge>
  );
}
