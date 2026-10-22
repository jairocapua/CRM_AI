"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { toast } from "sonner";

import {
  APPOINTMENT_LOCATION_LABELS,
  APPOINTMENT_STATUS_LABELS,
  type Appointment,
  type AppointmentStatus,
  type ID,
  type ISODate,
} from "@/types";
import * as api from "@/lib/api";
import {
  ApiError,
  apiNow,
  useAction,
  useResource,
  type AppointmentRow,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  calendarDayOf,
  offersStart,
  shownStatus,
  zonedTimes,
  type StatusWrite,
  type ZonedTimes,
} from "./appointment-display";

/**
 * Every status, in the order the select lists them. Cancelled is listed but
 * not offered: cancelling goes through its own button, which offers Undo.
 */
const STATUS_OPTIONS: readonly AppointmentStatus[] = [
  "confirmed",
  "showed",
  "no_show",
  "cancelled",
];

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

/**
 * One appointment's details: its contact (a link to their record), its time
 * in the viewer's zone and in the calendar's, its calendar, location, notes
 * and status. The status changes through the select (`setStatus`) and the
 * appointment is cancelled through its own button (`cancel`), with Undo in
 * the toast.
 *
 * Controlled by the calendars workspace, which passes the row as its latest
 * fetch has it. A change shows at once (`shownStatus`) and the row takes over
 * when the refetch lands; a failed change shows the stored status again and
 * says why. The dialog stays open after a cancel, so the result is visible:
 * the status reads Cancelled and, for a time still ahead, a line says whether
 * the booking engine offers that time again.
 */
export function AppointmentDetailsDialog({
  appointment,
  open,
  onOpenChange,
}: {
  appointment: AppointmentRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open && appointment !== null} onOpenChange={onOpenChange}>
      {appointment ? (
        <DialogContent className="sm:max-w-md">
          <AppointmentDetails
            appointment={appointment}
            onNavigate={() => onOpenChange(false)}
          />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function AppointmentDetails({
  appointment: row,
  onNavigate,
}: {
  appointment: AppointmentRow;
  onNavigate: () => void;
}) {
  const [write, setWrite] = useState<StatusWrite | null>(null);
  const [setStatus, settingStatus] = useAction(api.calendars.setStatus);
  const [cancel, cancelling] = useAction(api.calendars.cancel);
  const busy = settingStatus || cancelling;
  const status = shownStatus(row, write);

  async function changeStatus(next: AppointmentStatus) {
    if (busy || next === status) return;
    setWrite({ id: row.id, base: row.updatedAt, status: next });
    try {
      await setStatus(row.id, next);
      toast.success(`Marked ${APPOINTMENT_STATUS_LABELS[next]}`);
    } catch (error) {
      setWrite(null);
      toast.error(errorMessage(error, "Could not change the status."));
    }
  }

  async function cancelAppointment() {
    if (busy || status === "cancelled") return;
    const { id } = row;
    const previous = status;
    setWrite({ id, base: row.updatedAt, status: "cancelled" });
    try {
      await cancel(id);
      toast.success("Appointment cancelled", {
        action: {
          label: "Undo",
          // A 409 if another booking has taken the time since.
          onClick: () =>
            void api.calendars
              .setStatus(id, previous)
              .then(() => toast.success("Appointment restored"))
              .catch((error: unknown) =>
                toast.error(errorMessage(error, "Could not restore it.")),
              ),
        },
      });
    } catch (error) {
      setWrite(null);
      toast.error(errorMessage(error, "Could not cancel the appointment."));
    }
  }

  // The stored status, not the shown one: the line reads the slots only once
  // the cancel has landed, never ahead of it.
  const showAvailability =
    row.status === "cancelled" &&
    status === "cancelled" &&
    Date.parse(row.startAt) > apiNow().getTime();

  return (
    <>
      <DialogHeader>
        <DialogTitle className="pr-8 leading-snug">{row.title}</DialogTitle>
        <DialogDescription className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={cn(
              "size-2 shrink-0 rounded-full",
              TAG_DOT_CLASSES[row.calendarColor],
            )}
          />
          {row.calendarName}
        </DialogDescription>
      </DialogHeader>

      <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-3">
        <DetailRow term="Contact">
          <Link
            href={`/contacts/${row.contactId}`}
            onNavigate={onNavigate}
            className="font-medium underline-offset-4 hover:underline"
          >
            {row.contactName}
          </Link>
        </DetailRow>
        <DetailRow term="Your time">
          <TimesValue times={zonedTimes(row.startAt, row.endAt)} />
        </DetailRow>
        <DetailRow term="Calendar time">
          <TimesValue
            times={zonedTimes(row.startAt, row.endAt, row.timezone)}
          />
        </DetailRow>
        <DetailRow term="Location">
          <LocationValue location={row.location} />
        </DetailRow>
        {row.notes ? (
          <DetailRow term="Notes">
            <span className="whitespace-pre-line">{row.notes}</span>
          </DetailRow>
        ) : null}
        <DetailRow term="Status">
          <div className="flex flex-col items-start gap-2">
            <div className="flex items-center gap-2">
              <Select
                value={status}
                readOnly={busy}
                onValueChange={(next) => {
                  if (next) void changeStatus(next);
                }}
              >
                <SelectTrigger aria-label="Status" className="w-36">
                  <SelectValue>
                    {(value: AppointmentStatus) =>
                      APPOINTMENT_STATUS_LABELS[value]
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {STATUS_OPTIONS.map((option) => (
                      <SelectItem
                        key={option}
                        value={option}
                        disabled={option === "cancelled"}
                      >
                        {APPOINTMENT_STATUS_LABELS[option]}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {settingStatus ? (
                <Spinner aria-hidden className="text-muted-foreground" />
              ) : null}
            </div>
            {showAvailability ? (
              <SlotAvailability
                calendarId={row.calendarId}
                startAt={row.startAt}
                timeZone={row.timezone}
              />
            ) : null}
          </div>
        </DetailRow>
      </dl>

      {row.status !== "cancelled" ? (
        <DialogFooter>
          <Button
            variant="destructive"
            disabled={busy}
            // Keeps focus while pending: a natively disabled button drops it
            // to <body>. Once the cancel lands this button goes, and the
            // dialog takes focus back.
            focusableWhenDisabled
            className="data-disabled:opacity-50"
            onClick={() => void cancelAppointment()}
          >
            {cancelling ? <Spinner data-icon="inline-start" /> : null}
            Cancel appointment
          </Button>
        </DialogFooter>
      ) : null}
    </>
  );
}

/** One term and its value; the pair spans the list's two columns. */
function DetailRow({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="col-span-2 grid grid-cols-subgrid items-baseline">
      <dt className="text-muted-foreground">{term}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function TimesValue({ times }: { times: ZonedTimes }) {
  return (
    <span className="flex flex-col">
      <span>{times.day}</span>
      <span className="tabular-nums">{times.times}</span>
      <span className="text-muted-foreground text-xs">{times.zone}</span>
    </span>
  );
}

/** Only an https link becomes a link; any other value is shown as text. */
function LocationValue({ location }: { location: Appointment["location"] }) {
  if (!location) return <span className="text-muted-foreground">Not set</span>;
  const label = APPOINTMENT_LOCATION_LABELS[location.type];
  const { value } = location;
  if (!value) return <span>{label}</span>;

  const isMeeting =
    (location.type === "zoom" || location.type === "google_meet") &&
    value.startsWith("https://");
  return (
    <span className="flex flex-col">
      <span>{label}</span>
      {isMeeting ? (
        <a
          href={value}
          target="_blank"
          rel="noreferrer"
          className="text-primary truncate underline-offset-4 hover:underline"
        >
          {value}
        </a>
      ) : (
        <span className="text-muted-foreground">{value}</span>
      )}
    </span>
  );
}

/**
 * Whether the booking engine offers a cancelled appointment's time again,
 * read from `availableSlots()` for the calendar's own date. It may not:
 * another booking can have taken the time since, or it is now inside the
 * calendar's minimum notice.
 */
function SlotAvailability({
  calendarId,
  startAt,
  timeZone,
}: {
  calendarId: ID;
  startAt: ISODate;
  timeZone: string;
}) {
  const day = calendarDayOf(startAt, timeZone);
  const slots = useResource(
    "appointments",
    () => api.calendars.availableSlots(calendarId, day),
    `${calendarId}|${day}`,
  );

  if (slots.isLoading) return <Skeleton className="h-4 w-56" />;
  return (
    <p aria-live="polite" className="text-muted-foreground text-xs">
      {slots.error
        ? "Could not check whether this time is open again."
        : offersStart(slots.data ?? [], startAt)
          ? "This time is open for booking again."
          : "This time is no longer offered for booking."}
    </p>
  );
}
