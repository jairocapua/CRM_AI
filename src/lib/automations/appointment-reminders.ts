import type { AutomationDefinition } from "@/types";

/** Confirm the booking, then remind the day before. */
export const appointmentReminders: AutomationDefinition = {
  id: "wf_appointment_reminders",
  name: "Appointment Reminders",
  description:
    "Confirm the booking, then remind the day before to cut no-shows.",
  folder: "Scheduling",
  status: "published",
  owner: "aiko",
  trigger: {
    label: "Appointment booked",
    // No calendars listed: a booking on any calendar enrols the contact.
    config: { kind: "appointment_booked", calendarIds: [] },
  },
  steps: [
    {
      id: "confirmation_sms",
      label: "Confirmation SMS",
      config: {
        kind: "send_sms",
        body: "You are booked for {{appointment.time}}. Reply R to reschedule.",
      },
    },
    {
      id: "wait_1_day",
      label: "Wait 1 day",
      config: { kind: "wait", mode: "duration", amount: 1, unit: "days" },
    },
    {
      id: "reminder_sms",
      label: "Reminder SMS",
      config: {
        kind: "send_sms",
        body: "See you tomorrow at {{appointment.time}}!",
      },
    },
    {
      id: "tag_booked",
      label: "Tag as booked",
      config: { kind: "add_tag", tags: ["Demo Booked"] },
    },
  ],
  // Every booking gets its own reminders, even for a returning contact.
  settings: { allowMultipleEnrollment: true, stopOnReply: true },
};
