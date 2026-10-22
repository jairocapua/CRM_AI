"use client";

import { useId } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { toast } from "sonner";

import type { Calendar, ID, ISODate } from "@/types";
import * as api from "@/lib/api";
import { ApiError, apiNow, useAction, useResource } from "@/lib/api";
import {
  bookingFormSchema,
  type BookingFormValues,
} from "@/lib/validation/appointment";
import { ContactPicker } from "@/components/modules/opportunities/contact-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { TAG_DOT_CLASSES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { zonedTimes } from "./appointment-display";
import { calendarDaysFor, slotsOnLocalDay } from "./booking-slots";
import {
  dayStart,
  isCalendarDay,
  localDay,
  zoneLabel,
  type CalendarDay,
} from "./calendar-nav";

/**
 * Books an appointment: a calendar, a contact, a day and one of the times the
 * calendar offers that day, then `api.calendars.book()`.
 *
 * Controlled by its caller: the Calendars toolbar's Book button, or the
 * contact page's Appointments tab, which passes `contactId` so the contact is
 * filled in (and can still be changed). The form lives inside the popup,
 * which unmounts on close, so every open starts from fresh defaults.
 */
export function BookingDialog({
  open,
  onOpenChange,
  defaultDay,
  contactId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A viewer-local day, "YYYY-MM-DD". */
  defaultDay: CalendarDay;
  contactId?: ID;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Book appointment</DialogTitle>
          <DialogDescription>
            Pick a calendar, a contact and one of the open times.
          </DialogDescription>
        </DialogHeader>
        <BookingForm
          defaultDay={defaultDay}
          contactId={contactId}
          onBooked={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

const SERVER_ERROR = "root.server" as const;

function BookingForm({
  defaultDay,
  contactId,
  onBooked,
}: {
  defaultDay: CalendarDay;
  contactId?: ID;
  onBooked: () => void;
}) {
  const formId = useId();
  const form = useForm<BookingFormValues>({
    resolver: zodResolver(bookingFormSchema),
    defaultValues: {
      calendarId: "",
      contactId: contactId ?? "",
      day: defaultDay,
      startAt: "",
    },
  });
  const { errors } = form.formState;
  const [calendarId, day, startAt] = useWatch({
    control: form.control,
    name: ["calendarId", "day", "startAt"],
  });

  const calendars = useResource("calendars", () => api.calendars.list());
  // Only active calendars take bookings.
  const active = (calendars.data ?? []).filter((c) => c.isActive);
  const calendar = active.find((c) => c.id === calendarId) ?? null;
  const dayIsValid = isCalendarDay(day);

  // The viewer's day can overlap two of the calendar's dates (from Asia, one
  // local day is two Los Angeles dates), so ask for each and keep the slots
  // on the viewer's day. Invalidated with "appointments": a booking anywhere
  // refetches this list.
  const slots = useResource(
    "appointments",
    async () => {
      if (!calendar || !dayIsValid) return null;
      const lists = await Promise.all(
        calendarDaysFor(day, calendar.timezone).map((date) =>
          api.calendars.availableSlots(calendar.id, date),
        ),
      );
      return slotsOnLocalDay(lists, day);
    },
    // Strings only: anything read from apiNow() would refetch forever.
    `${calendarId}|${day}`,
  );

  const [book, booking] = useAction(api.calendars.book);

  /** A changed choice makes the chosen time and any booking error stale. */
  function clearTime() {
    form.setValue("startAt", "");
    form.clearErrors(SERVER_ERROR);
  }

  async function submit(values: BookingFormValues) {
    // Enter in a field submits too, and the button's disabled state does not
    // stop that: one booking at a time.
    if (booking) return;
    form.clearErrors(SERVER_ERROR);
    try {
      const appointment = await book({
        calendarId: values.calendarId,
        contactId: values.contactId,
        startAt: values.startAt,
      });
      const times = zonedTimes(appointment.startAt, appointment.endAt);
      toast.success("Appointment booked", {
        description: `${times.day}, ${times.times}`,
      });
      onBooked();
    } catch (error) {
      // Most likely the time was taken, or slipped inside the calendar's
      // notice, since the list was read: drop it and read the list again.
      form.setValue("startAt", "");
      form.setError(SERVER_ERROR, {
        message:
          error instanceof ApiError
            ? error.message
            : "Could not book the appointment.",
      });
      slots.refetch();
    }
  }

  const today = localDay(apiNow());
  const timesBusy = slots.isLoading || slots.isRefreshing;

  return (
    <>
      <form
        id={formId}
        noValidate
        onSubmit={form.handleSubmit((values) => submit(values))}
      >
        <FieldGroup>
          <Field data-invalid={Boolean(errors.calendarId) || undefined}>
            <FieldLabel htmlFor="booking-calendar">Calendar</FieldLabel>
            <Controller
              control={form.control}
              name="calendarId"
              render={({ field }) => (
                <Select
                  value={field.value || null}
                  disabled={calendars.isLoading}
                  onValueChange={(value: string | null) => {
                    field.onChange(value ?? "");
                    clearTime();
                  }}
                >
                  <SelectTrigger
                    id="booking-calendar"
                    className="w-full"
                    aria-invalid={Boolean(errors.calendarId) || undefined}
                  >
                    <SelectValue>
                      {(value: string | null) => {
                        const chosen = active.find((c) => c.id === value);
                        return chosen ? (
                          <CalendarName calendar={chosen} />
                        ) : (
                          "Pick a calendar"
                        );
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {active.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          <CalendarName calendar={c} />
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError errors={[errors.calendarId]} />
          </Field>

          <Field data-invalid={Boolean(errors.contactId) || undefined}>
            <FieldLabel htmlFor="booking-contact">Contact</FieldLabel>
            <Controller
              control={form.control}
              name="contactId"
              render={({ field }) => (
                <ContactPicker
                  id="booking-contact"
                  value={field.value}
                  onChange={(next) => {
                    field.onChange(next);
                    form.clearErrors(SERVER_ERROR);
                  }}
                />
              )}
            />
            <FieldError errors={[errors.contactId]} />
          </Field>

          <Field data-invalid={Boolean(errors.day) || undefined}>
            <FieldLabel htmlFor="booking-day">Day</FieldLabel>
            <Input
              id="booking-day"
              type="date"
              min={today}
              aria-invalid={Boolean(errors.day) || undefined}
              {...form.register("day", { onChange: clearTime })}
            />
            <FieldError errors={[errors.day]} />
          </Field>

          <FieldSet
            aria-busy={timesBusy || undefined}
            data-invalid={Boolean(errors.startAt) || undefined}
          >
            <FieldLegend variant="label">Time</FieldLegend>
            <FieldDescription>
              Times in {zoneLabel(dayIsValid ? dayStart(day) : dayStart(today))}
            </FieldDescription>
            {!calendar ? (
              <TimesNote>Pick a calendar to see open times.</TimesNote>
            ) : !dayIsValid ? (
              <TimesNote>Pick a day to see open times.</TimesNote>
            ) : slots.isLoading ? (
              <SlotsSkeleton />
            ) : slots.error ? (
              <TimesNote>Could not load the open times.</TimesNote>
            ) : (slots.data ?? []).length === 0 ? (
              <TimesNote>No open times on this day.</TimesNote>
            ) : (
              <Controller
                control={form.control}
                name="startAt"
                render={({ field }) => (
                  <RadioGroup
                    aria-label="Open times"
                    value={field.value}
                    onValueChange={(value: string) => {
                      field.onChange(value);
                      form.clearErrors(SERVER_ERROR);
                    }}
                    className="grid-cols-3 sm:grid-cols-4"
                  >
                    {(slots.data ?? []).map((slot) => (
                      <SlotChoice key={slot} slot={slot} formId={formId} />
                    ))}
                  </RadioGroup>
                )}
              />
            )}
            {calendar && startAt ? (
              <CalendarTime calendar={calendar} startAt={startAt} />
            ) : null}
            <FieldError errors={[errors.startAt]} />
          </FieldSet>
        </FieldGroup>
      </form>

      <FieldError errors={[errors.root?.server]} />

      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        <Button type="submit" form={formId} disabled={booking}>
          {booking ? <Spinner data-icon="inline-start" /> : null}
          Book appointment
        </Button>
      </DialogFooter>
    </>
  );
}

function CalendarName({ calendar }: { calendar: Calendar }) {
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

/** One open time as a choice card, labelled with the viewer's local time. */
function SlotChoice({ slot, formId }: { slot: ISODate; formId: string }) {
  const id = `${formId}-slot-${Date.parse(slot)}`;
  return (
    <FieldLabel htmlFor={id}>
      <Field orientation="horizontal" className="gap-2">
        <RadioGroupItem id={id} value={slot} data-start={slot} />
        <FieldTitle className="tabular-nums">
          {format(new Date(slot), "h:mm a")}
        </FieldTitle>
      </Field>
    </FieldLabel>
  );
}

/** The chosen time as the calendar's own zone reads it. */
function CalendarTime({
  calendar,
  startAt,
}: {
  calendar: Calendar;
  startAt: ISODate;
}) {
  const end = new Date(
    Date.parse(startAt) + calendar.slotDurationMin * 60_000,
  ).toISOString();
  const times = zonedTimes(startAt, end, calendar.timezone);
  return (
    <FieldDescription>
      Calendar time: {times.day}, {times.times} ({times.zone})
    </FieldDescription>
  );
}

function TimesNote({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground text-sm">{children}</p>;
}

function SlotsSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full rounded-lg" />
      ))}
    </div>
  );
}
