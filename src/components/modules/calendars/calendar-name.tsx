import type { Calendar } from "@/types";
import { TAG_DOT_CLASSES } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * A calendar's colour dot and name, truncated to fit: how a calendar reads in
 * a select's items and its chosen value.
 */
export function CalendarName({
  calendar,
}: {
  calendar: Pick<Calendar, "name" | "color">;
}) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span
        aria-hidden
        className={cn(
          "size-2 shrink-0 rounded-full",
          TAG_DOT_CLASSES[calendar.color],
        )}
      />
      <span className="truncate">{calendar.name}</span>
    </span>
  );
}
