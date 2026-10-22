"use client";

import { ChevronLeftIcon, ChevronRightIcon, GlobeIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  CALENDAR_VIEWS,
  VIEW_LABELS,
  isCalendarView,
  rangeLabel,
  shiftDate,
  type CalendarDay,
  type CalendarPosition,
  type CalendarView,
} from "./calendar-nav";

/**
 * Today, previous/next by the view's unit, the range heading, the viewer's
 * zone and the view switch. Presentational: it reports where to go through
 * `onNavigate` and the workspace owns the URL. `children` is the actions slot,
 * after the view switch; the workspace puts its Book button there.
 */
export function CalendarToolbar({
  view,
  date,
  today,
  timeZoneLabel,
  onNavigate,
  children,
}: {
  view: CalendarView;
  date: CalendarDay;
  today: CalendarDay;
  timeZoneLabel: string;
  onNavigate: (next: CalendarPosition) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          onClick={() => onNavigate({ view, date: today })}
        >
          Today
        </Button>
        <ButtonGroup aria-label={`Change ${view}`}>
          <Button
            variant="outline"
            size="icon"
            aria-label={`Previous ${view}`}
            onClick={() =>
              onNavigate({ view, date: shiftDate(view, date, -1) })
            }
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label={`Next ${view}`}
            onClick={() => onNavigate({ view, date: shiftDate(view, date, 1) })}
          >
            <ChevronRightIcon />
          </Button>
        </ButtonGroup>
      </div>

      <h2
        aria-live="polite"
        className="min-w-0 text-lg font-semibold tracking-tight"
      >
        {rangeLabel(view, date)}
      </h2>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:ms-auto">
        <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
          <GlobeIcon className="size-4 shrink-0" aria-hidden />
          <span>
            <span className="sr-only">Times shown in </span>
            {timeZoneLabel}
          </span>
        </span>
        <ToggleGroup
          aria-label="Calendar view"
          variant="outline"
          spacing={0}
          value={[view]}
          onValueChange={(values) => {
            // Pressing the active item empties the group; keep the view.
            const next = values[0] ?? null;
            if (isCalendarView(next) && next !== view) {
              onNavigate({ view: next, date });
            }
          }}
        >
          {CALENDAR_VIEWS.map((v) => (
            <ToggleGroupItem key={v} value={v} className="px-3">
              {VIEW_LABELS[v]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {children}
      </div>
    </div>
  );
}
