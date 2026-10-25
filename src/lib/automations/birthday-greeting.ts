import type { AutomationDefinition } from "@/types";

/** A short birthday note, sent at a civil hour. */
export const birthdayGreeting: AutomationDefinition = {
  id: "wf_birthday_greeting",
  name: "Birthday Greeting",
  description: "Send a short birthday note to every active contact.",
  folder: "Nurture",
  status: "draft",
  owner: "jordan",
  trigger: { label: "Contact's birthday", config: { kind: "birthday" } },
  steps: [
    {
      id: "wait_until_morning",
      label: "Wait until 09:00",
      config: { kind: "wait", mode: "until_time", untilTime: "09:00" },
    },
    {
      id: "send_email",
      label: "Send email",
      config: {
        kind: "send_email",
        subject: "Birthday Greeting",
        body: "Hi {{contact.first_name}}, just checking in.",
      },
    },
  ],
  // Birthdays come round every year.
  settings: { allowMultipleEnrollment: true, stopOnReply: true },
};
