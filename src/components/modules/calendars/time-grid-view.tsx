"use client";

import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { format } from "date-fns";

import type { AppointmentRow } from "@/lib/api";
import { apiNow } from "@/lib/api";
import { TAG_COLOR_CLASSES } from "@/lib/constants";
import { formatClockTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { dayStart, rangeLabel, type CalendarDay } from "./calendar-nav";
import {
  HOUR_HEIGHT_PX,
  MINUTES_PER_DAY,
  MIN_BLOCK_PX,
  hourLabel,
  layoutDay,
  minutesToPx,
  nowLineMinutes,
  scrollTargetMinutes,
  viewDays,
  type LaidOutSegment,
} from "./time-grid";

/** How often the now line moves, in milliseconds. */
const NOW_TICK_MS = 60_000;

/**
 * Below this height a block has room for one line, so the contact and times
 * share it; from here up they get a line each.
 */
const TWO_LINE_BLOCK_PX = 40;

const DAY_HEIGHT_PX = minutesToPx(MINUTES_PER_DAY);

/** Ruled hour lines, one per `HOUR_HEIGHT_PX`, drawn behind each day. */
const HOUR_LINES = {
  backgroundImage: `repeating-linear-gradient(to bottom, var(--border) 0 1px, transparent 1px ${HOUR_HEIGHT_PX}px)`,
} as const;

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

/**
 * The week and day views: a 24-hour grid with one column per day, each
 * appointment a block at its wall-clock time in the viewer's zone, coloured by
 * calendar. Overlapping appointments sit side by side (`layoutDay`), and so do
 * short ones whose minimum-height blocks would overlap; one that crosses
 * local midnight is drawn on both days, each part showing its real times.
 *
 * A now line marks the demo clock's present (`apiNow()`, never the wall
 * clock) on today's column and moves once a minute. When a range opens, the
 * grid scrolls so its earliest appointment is near the top: from Asia the
 * seeded Los Angeles hours fall around midnight to 08:00, and opening at the
 * top of a working day would show nothing. It scrolls once per range opened,
 * not when a calendar is hidden, rows refetch or the line moves.
 *
 * Each block is a button that opens the appointment's details (through
 * `onOpenAppointment`, with that button as the opener). Blocks are listed in
 * the order they are given, which the workspace makes live before cancelled,
 * so a live booking comes first to a screen reader and, sharing a cancelled
 * one's exact slot, sits leftmost.
 *
 * Presentational: the workspace fetches, filters hidden calendars, orders the
 * rows and owns the URL. The grid scrolls inside its own card, so on a phone
 * the week scrolls sideways there and never widens the page.
 */
export function TimeGridView({
  view,
  date,
  today,
  appointments,
  onOpenAppointment,
}: {
  view: "week" | "day";
  date: CalendarDay;
  today: CalendarDay;
  appointments: readonly AppointmentRow[];
  onOpenAppointment: (appointment: AppointmentRow, opener: HTMLElement) => void;
}) {
  const days = viewDays(view, date);
  const columns = days.map((day) => ({
    day,
    segments: layoutDay(appointments, day),
  }));

  // The demo clock, never the wall clock: the line sits in the seeded world's
  // present, which is not the machine's.
  const [nowMs, setNowMs] = useState(() => apiNow().getTime());
  useEffect(() => {
    const id = window.setInterval(
      () => setNowMs(apiNow().getTime()),
      NOW_TICK_MS,
    );
    return () => window.clearInterval(id);
  }, []);
  const now = new Date(nowMs);

  const nowInView =
    days
      .map((day) => nowLineMinutes(now, day))
      .find((minutes) => minutes !== null) ?? null;
  const target = scrollTargetMinutes(
    columns.flatMap(({ segments }) => segments.map(({ start }) => start)),
    nowInView,
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  // Reads the latest target without making it a dependency: the scroll
  // happens when a range opens, and only then.
  const scrollToTarget = useEffectEvent(() => {
    const scroller = scrollRef.current;
    // Set directly: a smooth scroll is an animation, and would stall in a
    // hidden tab.
    if (scroller) scroller.scrollTop = minutesToPx(target);
  });
  const rangeKey = `${view}|${days[0]}`;
  useLayoutEffect(() => {
    scrollToTarget();
  }, [rangeKey]);

  const gridColumns =
    view === "week"
      ? "grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]"
      : "grid-cols-[3.5rem_minmax(0,1fr)]";

  return (
    <div className="bg-card overflow-hidden rounded-xl border">
      <div
        ref={scrollRef}
        role="region"
        aria-label={`Time grid, ${rangeLabel(view, date)}`}
        tabIndex={0}
        data-time-grid=""
        // An inset outline: a ring would be drawn outside the box, where the
        // card's rounded overflow clips it.
        className="focus-visible:outline-ring max-h-[min(70vh,40rem)] overflow-auto outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-solid"
      >
        <div className={cn(view === "week" && "min-w-[42rem]")}>
          <div
            aria-hidden
            data-time-grid-header=""
            className={cn(
              "bg-card sticky top-0 z-30 grid border-b",
              gridColumns,
            )}
          >
            <div className="bg-card sticky left-0 z-10" />
            {days.map((day) => (
              <DayHeading key={day} day={day} isToday={day === today} />
            ))}
          </div>

          <div className={cn("grid", gridColumns)}>
            <HourGutter />
            {columns.map(({ day, segments }) => (
              <DayColumn
                key={day}
                day={day}
                isToday={day === today}
                segments={segments}
                nowMinutes={nowLineMinutes(now, day)}
                onOpenAppointment={onOpenAppointment}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DayHeading({ day, isToday }: { day: CalendarDay; isToday: boolean }) {
  const local = dayStart(day);
  return (
    <div className="flex items-center justify-center gap-1.5 border-l px-1 py-2 text-xs font-medium">
      <span className="text-muted-foreground">{format(local, "EEE")}</span>
      <span
        className={cn(
          "flex size-6 items-center justify-center rounded-full tabular-nums",
          isToday && "bg-primary text-primary-foreground",
        )}
      >
        {local.getDate()}
      </span>
    </div>
  );
}

/** "1 AM" to "11 PM" beside the hour lines; midnight is the grid's top edge. */
function HourGutter() {
  return (
    <div
      aria-hidden
      className="bg-card sticky left-0 z-20"
      style={{ height: DAY_HEIGHT_PX }}
    >
      {HOURS.slice(1).map((hour) => (
        <span
          key={hour}
          className="text-muted-foreground absolute right-2 -translate-y-1/2 text-[0.6875rem] leading-none whitespace-nowrap tabular-nums"
          style={{ top: minutesToPx(hour * 60) }}
        >
          {hourLabel(hour)}
        </span>
      ))}
    </div>
  );
}

function DayColumn({
  day,
  isToday,
  segments,
  nowMinutes,
  onOpenAppointment,
}: {
  day: CalendarDay;
  isToday: boolean;
  segments: readonly LaidOutSegment<AppointmentRow>[];
  nowMinutes: number | null;
  onOpenAppointment: (appointment: AppointmentRow, opener: HTMLElement) => void;
}) {
  return (
    <div
      role="group"
      aria-label={rangeLabel("day", day)}
      aria-current={isToday ? "date" : undefined}
      data-day={day}
      className={cn(
        // Clips a short block drawn at its minimum height past midnight; x stays
        // visible for the now line's dot.
        "relative min-w-0 overflow-y-clip border-l",
        isToday && "bg-primary/[0.03]",
      )}
      style={{ ...HOUR_LINES, height: DAY_HEIGHT_PX }}
    >
      {segments.length > 0 ? (
        <ul aria-label="Appointments" className="absolute inset-0">
          {segments.map((segment) => (
            <AppointmentBlock
              key={segment.row.id}
              segment={segment}
              onOpen={onOpenAppointment}
            />
          ))}
        </ul>
      ) : null}

      {nowMinutes !== null ? (
        <div
          aria-hidden
          data-now-line=""
          className="pointer-events-none absolute inset-x-0 z-10 h-0.5 -translate-y-1/2 bg-red-500 dark:bg-red-400"
          style={{ top: minutesToPx(nowMinutes) }}
        >
          <span className="absolute top-1/2 -left-1 size-2 -translate-y-1/2 rounded-full bg-red-500 dark:bg-red-400" />
        </div>
      ) : null}
    </div>
  );
}

/**
 * One appointment's part of a day: the contact, then its real start and end
 * times, on the calendar's tint. The contact leads because the block's place
 * on the grid already shows the time, and a narrow week column truncates
 * whatever comes last. A part cut at midnight loses its rounded edge there.
 * The tinted box is a button that opens the appointment's details; the list
 * item keeps the id, status and exact geometry.
 */
function AppointmentBlock({
  segment,
  onOpen,
}: {
  segment: LaidOutSegment<AppointmentRow>;
  onOpen: (appointment: AppointmentRow, opener: HTMLElement) => void;
}) {
  const {
    row: appointment,
    start,
    end,
    column,
    columns,
    clippedStart,
    clippedEnd,
  } = segment;
  const times = `${formatClockTime(appointment.startAt)} – ${formatClockTime(appointment.endAt)}`;
  const cancelled = appointment.status === "cancelled";
  const height = Math.max(minutesToPx(end - start), MIN_BLOCK_PX);
  const oneLine = height < TWO_LINE_BLOCK_PX;

  return (
    <li
      data-appointment-id={appointment.id}
      data-status={appointment.status}
      title={`${appointment.contactName}, ${times} · ${appointment.calendarName}${
        cancelled ? " (cancelled)" : ""
      }`}
      className="absolute p-px"
      style={{
        top: minutesToPx(start),
        height,
        left: `${(column / columns) * 100}%`,
        width: `${100 / columns}%`,
      }}
    >
      <button
        type="button"
        aria-haspopup="dialog"
        // This part's button: an appointment that crosses midnight has two,
        // and focus goes back to the one that was clicked.
        onClick={(event) => onOpen(appointment, event.currentTarget)}
        className={cn(
          // An inset outline: neighbouring blocks and the column's clip would
          // cover one drawn outside.
          "focus-visible:outline-ring flex h-full w-full cursor-pointer overflow-hidden rounded-md border px-1.5 py-0.5 text-left text-xs leading-4 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-solid",
          oneLine ? "flex-row items-baseline gap-1" : "flex-col",
          TAG_COLOR_CLASSES[appointment.calendarColor],
          clippedStart && "rounded-t-none border-t-0",
          clippedEnd && "rounded-b-none border-b-0",
          cancelled && "opacity-60",
        )}
      >
        <span
          className={cn(
            "truncate font-medium",
            oneLine && "max-w-full shrink-0",
            cancelled && "line-through",
          )}
        >
          {appointment.contactName}
        </span>{" "}
        <span
          className={cn("truncate tabular-nums", cancelled && "line-through")}
        >
          {times}
        </span>
        <span className="sr-only">
          {`, ${appointment.calendarName}`}
          {cancelled ? ", Cancelled" : null}
        </span>
      </button>
    </li>
  );
}
