import type { Audited, ID, ISODate, TagColor } from "./common";

export type CalendarType = "round_robin" | "simple" | "class" | "service";

/** Local wall-clock times, "09:00" / "17:00". */
export interface AvailabilityWindow {
  start: string;
  end: string;
}

export interface AvailabilityRule {
  weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  enabled: boolean;
  windows: AvailabilityWindow[];
}

export interface Calendar extends Audited {
  id: ID;
  name: string;
  description?: string;
  type: CalendarType;
  color: TagColor;
  slug: string;
  timezone: string;
  slotDurationMin: number;
  slotIntervalMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  minSchedulingNoticeHours: number;
  dateRangeDays: number;
  maxBookingsPerDay?: number;
  teamMemberIds: ID[];
  availability: AvailabilityRule[];
  isActive: boolean;
}

export type AppointmentStatus =
  "confirmed" | "showed" | "no_show" | "cancelled";

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  confirmed: "Confirmed",
  showed: "Showed",
  no_show: "No Show",
  cancelled: "Cancelled",
};

export interface Appointment extends Audited {
  id: ID;
  calendarId: ID;
  contactId: ID;
  assignedUserId?: ID;
  title: string;
  notes?: string;
  startAt: ISODate;
  endAt: ISODate;
  timezone: string;
  status: AppointmentStatus;
  location?: {
    type: "zoom" | "phone" | "in_person" | "google_meet";
    value?: string;
  };
  source: "booking_widget" | "manual" | "workflow";
}
