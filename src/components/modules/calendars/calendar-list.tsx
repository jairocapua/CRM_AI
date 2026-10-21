"use client";

import type { Calendar, ID } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldLegend, FieldSet } from "@/components/ui/field";
import { TAG_DOT_CLASSES } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * Every calendar with its colour and a show/hide toggle. Visibility is the
 * workspace's component state (`hidden`), never written to the store: hiding
 * a calendar is a way of looking, not a change to the calendar.
 *
 * Inactive calendars stay listed and visible by default, but muted and
 * badged, so their past appointments can still be found.
 */
export function CalendarList({
  calendars,
  hidden,
  onToggle,
}: {
  calendars: readonly Calendar[];
  hidden: ReadonlySet<ID>;
  onToggle: (id: ID, visible: boolean) => void;
}) {
  return (
    <FieldSet className="gap-2">
      <FieldLegend variant="label">Calendars</FieldLegend>
      <ul className="flex flex-col gap-0.5">
        {calendars.map((calendar) => (
          <li key={calendar.id}>
            {/* The wrapping label names the checkbox (Base UI links a
                parent <label> through aria-labelledby). */}
            <label
              data-inactive={calendar.isActive ? undefined : ""}
              className={cn(
                "hover:bg-muted flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm",
                !calendar.isActive && "text-muted-foreground",
              )}
            >
              <Checkbox
                checked={!hidden.has(calendar.id)}
                onCheckedChange={(checked) => onToggle(calendar.id, checked)}
              />
              <span
                aria-hidden
                className={cn(
                  "size-2.5 shrink-0 rounded-full",
                  TAG_DOT_CLASSES[calendar.color],
                  !calendar.isActive && "opacity-50",
                )}
              />
              <span className="min-w-0 flex-1 truncate">{calendar.name}</span>
              {calendar.isActive ? null : (
                <Badge variant="outline">Inactive</Badge>
              )}
            </label>
          </li>
        ))}
      </ul>
    </FieldSet>
  );
}
