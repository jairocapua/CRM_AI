import { z } from "zod";

import { TAG_COLOR_CLASSES } from "@/lib/constants";
import type { AvailabilityWindow, Calendar, TagColor } from "@/types";

/**
 * The availability editor's form: a calendar's weekly hours and its booking
 * rules, shaped like the `calendars.update` patch it saves.
 *
 * Windows are "HH:mm" wall-clock times in the calendar's own zone, as
 * `<input type="time">` writes them. Zero-padded 24-hour strings sort in time
 * order, so they are compared as strings and never parsed into a `Date`.
 *
 * On an enabled day each window must end after it starts, and no two may
 * overlap; windows that touch (one ends at 12:00, the next starts at 12:00)
 * are fine, as the slot engine reads them half-open. A disabled day's windows
 * are not checked: saving drops them (`toAvailabilityPatch`), so a hidden
 * error can never block the Save button.
 */

/** The settings the editor edits, a subset of `Calendar`. */
export type AvailabilitySettings = Pick<
  Calendar,
  | "availability"
  | "slotDurationMin"
  | "slotIntervalMin"
  | "bufferBeforeMin"
  | "bufferAfterMin"
  | "minSchedulingNoticeHours"
  | "dateRangeDays"
>;

/** Weekday names by `AvailabilityRule["weekday"]`: 0 is Sunday. */
export const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const isTime = (value: string) => TIME.test(value);

const rule = z
  .object({
    weekday: z.literal(WEEKDAYS, { error: "Not a weekday." }),
    enabled: z.boolean(),
    // Strings here, checked below only when the day is enabled: a day turned
    // off with a half-typed time in it must not block saving.
    windows: z.array(z.object({ start: z.string(), end: z.string() })),
  })
  .superRefine(({ enabled, windows }, ctx) => {
    if (!enabled) return;

    // Each window on its own: both times well-formed, and it ends after it
    // starts.
    const spans: { start: string; end: string; index: number }[] = [];
    windows.forEach((hours, index) => {
      let wellFormed = true;
      for (const edge of ["start", "end"] as const) {
        if (isTime(hours[edge])) continue;
        wellFormed = false;
        ctx.addIssue({
          code: "custom",
          path: ["windows", index, edge],
          message: "Enter a time.",
        });
      }
      if (!wellFormed) return;
      const { start, end } = hours;
      if (end <= start) {
        ctx.addIssue({
          code: "custom",
          path: ["windows", index, "end"],
          message: "End time must be after the start time.",
        });
        return;
      }
      spans.push({ start, end, index });
    });

    // Then against each other, by start: a window that starts before the
    // latest end so far overlaps an earlier one. The running maximum (not
    // just the previous window's end) catches a window nested in a long one
    // with another window between them.
    spans.sort((a, b) => a.start.localeCompare(b.start) || a.index - b.index);
    let latestEnd = "";
    for (const { start, end, index } of spans) {
      if (start < latestEnd) {
        ctx.addIssue({
          code: "custom",
          path: ["windows", index, "start"],
          message: "Overlaps another time window on this day.",
        });
      }
      if (end > latestEnd) latestEnd = end;
    }
  });

const WHOLE_NUMBER = "Enter a whole number.";

/**
 * A whole number between `min` and `max`. An empty `<input type="number">`
 * registered with `valueAsNumber` reads as NaN, which zod rejects as the
 * wrong type: that, a fraction and Infinity all say "Enter a whole number."
 */
const wholeNumber = (
  [min, minMessage]: [number, string],
  [max, maxMessage]: [number, string],
) =>
  z
    .number({ error: WHOLE_NUMBER })
    .int(WHOLE_NUMBER)
    .min(min, minMessage)
    .max(max, maxMessage);

const AT_LEAST_ONE = [1, "Must be at least 1 minute."] as [number, string];
const NOT_NEGATIVE = [0, "Can't be negative."] as [number, string];
const A_DAY = [1440, "Can't be more than 1,440 minutes."] as [number, string];

export const availabilitySchema = z.object({
  availability: z.array(rule),
  slotDurationMin: wholeNumber(AT_LEAST_ONE, A_DAY),
  slotIntervalMin: wholeNumber(AT_LEAST_ONE, A_DAY),
  bufferBeforeMin: wholeNumber(NOT_NEGATIVE, A_DAY),
  bufferAfterMin: wholeNumber(NOT_NEGATIVE, A_DAY),
  minSchedulingNoticeHours: wholeNumber(NOT_NEGATIVE, [
    8760,
    "Can't be more than 8,760 hours.",
  ]),
  dateRangeDays: wholeNumber(NOT_NEGATIVE, [
    365,
    "Can't be more than 365 days.",
  ]),
});

export type AvailabilityFormValues = z.infer<typeof availabilitySchema>;

/** The colours a calendar can take: the tag palette. */
const CALENDAR_COLORS = Object.keys(TAG_COLOR_CLASSES) as [
  TagColor,
  ...TagColor[],
];

/** Whether `zone` is a time zone this runtime knows, such as an IANA name. */
export function isTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * What `calendars.update` accepts: the editor's rules, every key optional,
 * plus at most one rule per weekday, the settings the editor does not show
 * (time zone and daily cap) and the calendar's details: a name that is not
 * blank (trimmed), a description, a calendar colour, team member ids
 * (non-empty strings, not checked against the users) and the active switch.
 *
 * This is also the allow-list: `update()` saves only what this parses, and
 * zod drops every key it does not name, at every depth (id, slug, type, the
 * timestamps, a stray key in a rule or a window).
 *
 * `null` is how a caller removes an optional field: `maxBookingsPerDay: null`
 * means "no cap" and `description: null` "no description" (update() then
 * removes the key). A number must still be 1 or more, and a required field
 * rejects `null`. An undefined value counts as absent: every key is optional
 * and `update()` drops undefined values from the parsed output.
 *
 * As in the editor, a disabled day's windows are not checked. That is no gap:
 * `availability` is replaced whole, so re-enabling a day means sending the
 * array again, and its windows are checked then.
 */
export const calendarSettingsSchema = availabilitySchema
  .extend({
    availability: availabilitySchema.shape.availability.superRefine(
      (rules, ctx) => {
        const seen = new Set<number>();
        rules.forEach(({ weekday }, index) => {
          if (seen.has(weekday)) {
            ctx.addIssue({
              code: "custom",
              path: [index, "weekday"],
              message: "Only one rule per weekday.",
            });
          }
          seen.add(weekday);
        });
      },
    ),
    timezone: z.string().refine(isTimeZone, "Not a known time zone."),
    maxBookingsPerDay: wholeNumber(
      [1, "Must be at least 1."],
      [1440, "Can't be more than 1,440."],
    ).nullable(),
    name: z.string().trim().min(1, "Can't be empty."),
    description: z.string().nullable(),
    color: z.enum(CALENDAR_COLORS, { error: "Not a calendar colour." }),
    teamMemberIds: z.array(z.string().min(1)),
    isActive: z.boolean(),
  })
  .partial();

/**
 * A calendar's settings as the editor loads them: always seven rules, one per
 * weekday from Sunday (index = weekday), so the form can address a day by its
 * number. A weekday the calendar has no rule for comes in disabled with no
 * windows. Windows are copied, never shared with the calendar.
 */
export function toAvailabilityForm(
  calendar: AvailabilitySettings,
): AvailabilityFormValues {
  return {
    availability: WEEKDAYS.map((weekday) => {
      const found = calendar.availability.find((r) => r.weekday === weekday);
      return {
        weekday,
        enabled: found?.enabled ?? false,
        windows: (found?.windows ?? []).map(({ start, end }) => ({
          start,
          end,
        })),
      };
    }),
    slotDurationMin: calendar.slotDurationMin,
    slotIntervalMin: calendar.slotIntervalMin,
    bufferBeforeMin: calendar.bufferBeforeMin,
    bufferAfterMin: calendar.bufferAfterMin,
    minSchedulingNoticeHours: calendar.minSchedulingNoticeHours,
    dateRangeDays: calendar.dateRangeDays,
  };
}

/**
 * Validated form values as the `calendars.update` patch. A disabled day is
 * saved with no windows (they were never checked), and an enabled day's
 * windows are saved in start order.
 */
export function toAvailabilityPatch(
  values: AvailabilityFormValues,
): AvailabilitySettings {
  return {
    availability: values.availability.map(({ weekday, enabled, windows }) => ({
      weekday,
      enabled,
      windows: enabled
        ? [...windows]
            .sort((a, b) => a.start.localeCompare(b.start))
            .map(({ start, end }) => ({ start, end }))
        : [],
    })),
    slotDurationMin: values.slotDurationMin,
    slotIntervalMin: values.slotIntervalMin,
    bufferBeforeMin: values.bufferBeforeMin,
    bufferAfterMin: values.bufferAfterMin,
    minSchedulingNoticeHours: values.minSchedulingNoticeHours,
    dateRangeDays: values.dateRangeDays,
  };
}

const DAY_LAST_MINUTE = 23 * 60 + 59;

const toMinutes = (value: string) =>
  Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));

const toTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/**
 * The window "Add hours" appends: 09:00–17:00 on an empty day, otherwise an
 * hour from the latest end among the day's windows, stopping at 23:59 (a
 * window cannot run to midnight, since "24:00" is not a time). A day already
 * open to 23:59 gets a zero-length window, which the schema flags.
 */
export function nextWindow(
  windows: readonly AvailabilityWindow[],
): AvailabilityWindow {
  const ends = windows.map(({ end }) => end).filter(isTime);
  if (ends.length === 0) return { start: "09:00", end: "17:00" };
  const start = Math.max(...ends.map(toMinutes));
  return {
    start: toTime(start),
    end: toTime(Math.min(start + 60, DAY_LAST_MINUTE)),
  };
}
