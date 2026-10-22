"use client";

import { format } from "date-fns";

import type { AppointmentRow } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { TAG_COLOR_CLASSES, TAG_DOT_CLASSES } from "@/lib/constants";
import { formatClockTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { dayStart, rangeLabel, type CalendarDay } from "./calendar-nav";
import {
  groupByLocalDay,
  isInMonth,
  monthWeeks,
  splitOverflow,
} from "./month-grid";

/**
 * The month as a weeks-by-days grid. Each day lists its appointments as chips
 * coloured by calendar, filed under the viewer's local day in the order they
 * are given (the workspace puts live ones before cancelled ones); a crowded
 * day shows two chips and "+N more". The day number and "+N more" open that
 * day in day view (through `onOpenDay`), a chip opens that appointment's
 * details (through `onOpenAppointment`), and the rest of the cell is left free
 * for click-to-book.
 *
 * Presentational: the workspace fetches, filters hidden calendars, orders the
 * rows and owns the URL. Below `sm` the same DOM collapses each chip to a thin coloured bar
 * and "+N more" to "+N"; the text stays in the accessibility tree.
 */
export function MonthView({
  date,
  today,
  appointments,
  onOpenDay,
  onOpenAppointment,
}: {
  date: CalendarDay;
  today: CalendarDay;
  appointments: readonly AppointmentRow[];
  onOpenDay: (day: CalendarDay) => void;
  onOpenAppointment: (appointment: AppointmentRow) => void;
}) {
  const weeks = monthWeeks(date);
  const byDay = groupByLocalDay(appointments);

  return (
    <div className="bg-card overflow-hidden rounded-xl border">
      <div
        aria-hidden
        className="bg-muted/50 text-muted-foreground grid grid-cols-7 border-b text-xs font-medium"
      >
        {(weeks[0] ?? []).map((day) => (
          <div key={day} className="px-1 py-1.5 text-center sm:px-2">
            <span className="sm:hidden">{format(dayStart(day), "EEEEE")}</span>
            <span className="hidden sm:inline">
              {format(dayStart(day), "EEE")}
            </span>
          </div>
        ))}
      </div>
      <div className="bg-border grid grid-cols-7 gap-px">
        {weeks.flat().map((day) => (
          <DayCell
            key={day}
            day={day}
            isToday={day === today}
            inMonth={isInMonth(day, date)}
            appointments={byDay.get(day) ?? []}
            onOpenDay={onOpenDay}
            onOpenAppointment={onOpenAppointment}
          />
        ))}
      </div>
    </div>
  );
}

function DayCell({
  day,
  isToday,
  inMonth,
  appointments,
  onOpenDay,
  onOpenAppointment,
}: {
  day: CalendarDay;
  isToday: boolean;
  inMonth: boolean;
  appointments: readonly AppointmentRow[];
  onOpenDay: (day: CalendarDay) => void;
  onOpenAppointment: (appointment: AppointmentRow) => void;
}) {
  const label = rangeLabel("day", day);
  const { visible, more } = splitOverflow(appointments);

  return (
    <div
      role="group"
      aria-label={label}
      aria-current={isToday ? "date" : undefined}
      data-day={day}
      data-outside={inMonth ? undefined : ""}
      className={cn(
        "bg-card flex min-h-16 min-w-0 flex-col gap-1 p-1 sm:min-h-28 sm:p-1.5",
        !inMonth && "bg-muted/40 text-muted-foreground",
      )}
    >
      <Button
        variant={isToday ? "default" : "ghost"}
        size="icon-xs"
        aria-label={`Open day view, ${label}`}
        onClick={() => onOpenDay(day)}
        className="self-center rounded-full text-xs tabular-nums sm:self-start"
      >
        {dayStart(day).getDate()}
      </Button>

      {visible.length > 0 ? (
        <ul aria-label="Appointments" className="flex min-w-0 flex-col gap-0.5">
          {visible.map((appointment) => (
            <AppointmentChip
              key={appointment.id}
              appointment={appointment}
              onOpen={onOpenAppointment}
            />
          ))}
        </ul>
      ) : null}

      {more > 0 ? (
        <Button
          variant="ghost"
          size="xs"
          aria-label={`+${more} more`}
          onClick={() => onOpenDay(day)}
          className="h-5 self-center px-1 sm:self-start"
        >
          +{more}
          <span className="hidden sm:inline"> more</span>
        </Button>
      ) : null}
    </div>
  );
}

/**
 * One appointment: start time and contact on the calendar's tint, as a button
 * that opens its details. The tint, status and id stay on the list item; the
 * button fills it.
 */
function AppointmentChip({
  appointment,
  onOpen,
}: {
  appointment: AppointmentRow;
  onOpen: (appointment: AppointmentRow) => void;
}) {
  const time = formatClockTime(appointment.startAt);
  const cancelled = appointment.status === "cancelled";

  return (
    <li
      title={`${time} ${appointment.contactName} · ${appointment.calendarName}${
        cancelled ? " (cancelled)" : ""
      }`}
      data-appointment-id={appointment.id}
      data-status={appointment.status}
      className={cn(
        "flex min-w-0 items-center rounded-full text-xs leading-4 sm:rounded-sm sm:border sm:px-1 sm:py-px",
        TAG_COLOR_CLASSES[appointment.calendarColor],
        cancelled && "opacity-60",
      )}
    >
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => onOpen(appointment)}
        // A 1px offset stays inside the cell's padding and clear of the
        // next chip, so the outline is never clipped or covered.
        className="focus-visible:outline-ring flex w-full min-w-0 cursor-pointer items-center gap-1 rounded-[inherit] text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-solid"
      >
        {/* A full-width bar below `sm`, a dot beside the text from `sm` up. */}
        <span
          aria-hidden
          className={cn(
            "h-1.5 w-full shrink-0 rounded-full sm:w-1.5",
            TAG_DOT_CLASSES[appointment.calendarColor],
          )}
        />
        <span className="sr-only sm:not-sr-only sm:min-w-0 sm:flex-1">
          <span className={cn("block truncate", cancelled && "line-through")}>
            <span className="tabular-nums">{time}</span>{" "}
            {appointment.contactName}
          </span>
        </span>
        <span className="sr-only">
          {`, ${appointment.calendarName}`}
          {cancelled ? ", Cancelled" : null}
        </span>
      </button>
    </li>
  );
}
