"use client";

import { Fragment, useId, useRef } from "react";
import {
  Controller,
  useFieldArray,
  useForm,
  useFormState,
  useWatch,
  type FieldError as FormFieldError,
  type UseFormReturn,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import type { Calendar } from "@/types";
import * as api from "@/lib/api";
import { ApiError, apiNow, useAction } from "@/lib/api";
import {
  WEEKDAY_LABELS,
  availabilitySchema,
  nextWindow,
  toAvailabilityForm,
  toAvailabilityPatch,
  type AvailabilityFormValues,
} from "@/lib/validation/availability";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { zoneLabel } from "./calendar-nav";

type AvailabilityForm = UseFormReturn<AvailabilityFormValues>;

/**
 * A window's time inputs share a phone's row with the remove button, so
 * there they fill the space and drop the browser's clock icon, which leaves
 * "09:00 AM" room at a 16px font (a phone opens its own picker on tap).
 */
const TIME_INPUT_CLASSES =
  "min-w-0 flex-1 max-sm:[&::-webkit-calendar-picker-indicator]:hidden sm:w-32 sm:flex-none";

/**
 * One calendar's weekly hours and booking rules, saved through
 * `api.calendars.update`. That call invalidates "calendars" and
 * "appointments", so the booking dialog's open times follow a save with no
 * more wiring.
 *
 * - Windows are wall-clock times in the calendar's own zone (the phase's
 *   Decided line), labelled with that zone, not the viewer's: "09:00" on a
 *   Los Angeles calendar is 09:00 in Los Angeles wherever it is edited from.
 * - A window edge that a DST change skips or repeats resolves the way the
 *   slot engine's `TZDate` does (a skipped 02:30 becomes 03:30, a repeated
 *   01:30 takes daylight time); the editor accepts such times as they are.
 * - A day switched off is saved with no windows, and its windows are not
 *   checked, so a hidden error can never block Save. Switching a day on with
 *   no windows starts it at 09:00–17:00.
 * - `calendars.update` checks these same rules itself (a 422
 *   `INVALID_CALENDAR`), so the form's checks are there to put each message
 *   beside its field before anything is sent.
 *
 * After a failed save, an edit to a day re-checks that whole day, so an
 * overlap error moves or clears as the windows change rather than waiting
 * for the next save. The parent keys this form on the calendar's id, so
 * switching calendars starts from that calendar's saved values.
 */
export function AvailabilityForm({ calendar }: { calendar: Calendar }) {
  const formId = useId();
  const form = useForm<AvailabilityFormValues>({
    resolver: zodResolver(availabilitySchema),
    defaultValues: toAvailabilityForm(calendar),
  });
  const { errors, isDirty } = form.formState;
  const [save, saving] = useAction(api.calendars.update);

  async function submit(values: AvailabilityFormValues) {
    // Enter in a field submits too, and the button's disabled state does not
    // stop that: one save at a time.
    if (saving) return;
    try {
      const saved = await save(calendar.id, toAvailabilityPatch(values));
      form.reset(toAvailabilityForm(saved));
      toast.success("Availability saved", { description: saved.name });
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? error.message
          : "Could not save availability.",
      );
    }
  }

  return (
    <form
      id={formId}
      noValidate
      onSubmit={form.handleSubmit((values) => submit(values))}
      className="flex flex-col gap-4"
    >
      <Card>
        <CardHeader>
          <CardTitle>Weekly hours</CardTitle>
          <CardDescription>
            Times are in {zoneLabel(apiNow(), calendar.timezone)}, the
            calendar&apos;s own time zone.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {WEEKDAY_LABELS.map((label, weekday) => (
            <Fragment key={label}>
              {weekday > 0 ? <Separator /> : null}
              <DayHours
                form={form}
                formId={formId}
                index={weekday}
                label={label}
              />
            </Fragment>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Booking rules</CardTitle>
          <CardDescription>
            How long a booking lasts, the room kept around it and when it can be
            made.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-5 sm:grid-cols-2">
            {NUMBER_FIELDS.map((spec) => (
              <NumberField
                key={spec.name}
                form={form}
                formId={formId}
                error={errors[spec.name]}
                {...spec}
              />
            ))}
          </FieldGroup>
        </CardContent>
      </Card>

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={!isDirty || saving}
          onClick={() => form.reset()}
        >
          Discard changes
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? <Spinner data-icon="inline-start" /> : null}
          Save availability
        </Button>
      </div>
    </form>
  );
}

/**
 * One weekday: a switch, then its windows (or "Unavailable"). Its own
 * component because each day's windows are a field array of their own. Rows
 * are keyed on the field array's ids, never the index, so removing a window
 * cannot shift another's values into it.
 *
 * The fieldset is named by the weekday ("Tuesday"); the switch by its label,
 * "Available on Tuesday", whose first words are visually hidden. Base UI
 * names a switch from its associated `<label>` (`aria-labelledby`), which
 * would override an `aria-label`.
 */
function DayHours({
  form,
  formId,
  index,
  label,
}: {
  form: AvailabilityForm;
  formId: string;
  index: number;
  label: string;
}) {
  const dayPath = `availability.${index}` as const;
  const windowsPath = `availability.${index}.windows` as const;
  const { control } = form;
  const { fields, append, remove } = useFieldArray({
    control,
    name: windowsPath,
  });
  const enabled = useWatch({ control, name: `${dayPath}.enabled` });
  const { errors, isSubmitted } = useFormState({ control, name: dayPath });
  const windowErrors = errors.availability?.[index]?.windows;
  const addRef = useRef<HTMLButtonElement>(null);

  /**
   * Once a save has failed, re-checks the whole day after a change, so an
   * error on one window that another window caused follows the edit. Typed
   * times do the same through `deps`.
   */
  function recheckDay() {
    if (isSubmitted) void form.trigger(dayPath);
  }

  const switchId = `${formId}-day-${index}`;

  return (
    // `min-w-0`: a fieldset is at least its content's width by default, which
    // would push the remove buttons past the card on a phone.
    <FieldSet className="min-w-0 gap-3 sm:flex-row sm:items-start sm:gap-6">
      <FieldLegend className="sr-only">{label}</FieldLegend>
      <div className="flex h-8 items-center gap-3 sm:w-36 sm:shrink-0">
        <Controller
          control={control}
          name={`${dayPath}.enabled`}
          render={({ field }) => (
            <Switch
              id={switchId}
              checked={field.value}
              onCheckedChange={(checked) => {
                field.onChange(checked);
                if (checked && form.getValues(windowsPath).length === 0) {
                  // Focus stays on the switch.
                  append(nextWindow([]), { shouldFocus: false });
                }
                recheckDay();
              }}
            />
          )}
        />
        <FieldLabel htmlFor={switchId}>
          <span className="sr-only">Available on </span>
          {label}
        </FieldLabel>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {enabled ? (
          <>
            {fields.map((field, i) => {
              const n = i + 1;
              const startId = `${formId}-${field.id}-start`;
              const endId = `${formId}-${field.id}-end`;
              const startError = windowErrors?.[i]?.start;
              const endError = windowErrors?.[i]?.end;
              // Only the defined ones: FieldError renders two entries as a
              // list, even when one of them is empty.
              const rowErrors = [startError, endError].filter(
                (error): error is FormFieldError => error !== undefined,
              );
              return (
                <Field
                  key={field.id}
                  data-invalid={rowErrors.length > 0 || undefined}
                  className="gap-1.5"
                >
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <FieldLabel htmlFor={startId} className="sr-only">
                      Start of window {n}
                    </FieldLabel>
                    <Input
                      id={startId}
                      type="time"
                      className={TIME_INPUT_CLASSES}
                      aria-invalid={Boolean(startError) || undefined}
                      {...form.register(`${windowsPath}.${i}.start`, {
                        deps: dayPath,
                      })}
                    />
                    <span aria-hidden className="text-muted-foreground">
                      –
                    </span>
                    <FieldLabel htmlFor={endId} className="sr-only">
                      End of window {n}
                    </FieldLabel>
                    <Input
                      id={endId}
                      type="time"
                      className={TIME_INPUT_CLASSES}
                      aria-invalid={Boolean(endError) || undefined}
                      {...form.register(`${windowsPath}.${i}.end`, {
                        deps: dayPath,
                      })}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove window ${n} on ${label}`}
                      onClick={() => {
                        remove(i);
                        recheckDay();
                        // The button is gone: keep focus in the day.
                        addRef.current?.focus();
                      }}
                    >
                      <XIcon />
                    </Button>
                  </div>
                  <FieldError errors={rowErrors} />
                </Field>
              );
            })}
            <Button
              ref={addRef}
              type="button"
              variant="ghost"
              size="sm"
              className="self-start"
              aria-label={`Add hours on ${label}`}
              onClick={() => {
                append(nextWindow(form.getValues(windowsPath)));
                recheckDay();
              }}
            >
              <PlusIcon data-icon="inline-start" />
              Add hours
            </Button>
          </>
        ) : (
          <p className="text-muted-foreground text-sm sm:flex sm:h-8 sm:items-center">
            Unavailable
          </p>
        )}
      </div>
    </FieldSet>
  );
}

type NumberName = Exclude<keyof AvailabilityFormValues, "availability">;

interface NumberSpec {
  name: NumberName;
  label: string;
  unit: string;
  min: number;
  max: number;
  description: string;
}

/** The booking rules, in the order they are asked for. */
const NUMBER_FIELDS: readonly NumberSpec[] = [
  {
    name: "slotDurationMin",
    label: "Slot duration",
    unit: "min",
    min: 1,
    max: 1440,
    description: "How long each appointment lasts.",
  },
  {
    name: "slotIntervalMin",
    label: "Slot interval",
    unit: "min",
    min: 1,
    max: 1440,
    description: "How often a new start time is offered.",
  },
  {
    name: "bufferBeforeMin",
    label: "Buffer before",
    unit: "min",
    min: 0,
    max: 1440,
    description: "Kept free before each appointment.",
  },
  {
    name: "bufferAfterMin",
    label: "Buffer after",
    unit: "min",
    min: 0,
    max: 1440,
    description: "Kept free after each appointment.",
  },
  {
    name: "minSchedulingNoticeHours",
    label: "Minimum notice",
    unit: "hours",
    min: 0,
    max: 8760,
    description: "Times sooner than this are not offered.",
  },
  {
    name: "dateRangeDays",
    label: "Booking range",
    unit: "days",
    min: 0,
    max: 365,
    description: "How many days ahead of today a time can be booked.",
  },
];

/**
 * A whole-number setting with its unit. Registered with `valueAsNumber`, so
 * an empty input reads as NaN and the schema says "Enter a whole number.";
 * `min`, `max` and `step` only steer the browser's stepper (the form is
 * `noValidate`).
 */
function NumberField({
  form,
  formId,
  error,
  name,
  label,
  unit,
  min,
  max,
  description,
}: NumberSpec & {
  form: AvailabilityForm;
  formId: string;
  error: FormFieldError | undefined;
}) {
  const id = `${formId}-${name}`;
  return (
    <Field data-invalid={Boolean(error) || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <InputGroup>
        <InputGroupInput
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={1}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={`${id}-description`}
          {...form.register(name, { valueAsNumber: true })}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupText>{unit}</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
      <FieldDescription id={`${id}-description`}>
        {description}
      </FieldDescription>
      <FieldError errors={[error]} />
    </Field>
  );
}
