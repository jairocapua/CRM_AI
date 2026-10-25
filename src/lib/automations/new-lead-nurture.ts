import type { AutomationDefinition } from "@/types";

/** A short value sequence for every new contact. */
export const newLeadNurture: AutomationDefinition = {
  id: "wf_new_lead_nurture",
  name: "New Lead Nurture",
  description: "Warm up every new contact with a short value sequence.",
  folder: "Nurture",
  status: "published",
  owner: "lena",
  trigger: { label: "Contact created", config: { kind: "contact_created" } },
  steps: [
    {
      id: "add_to_newsletter",
      label: "Add to newsletter",
      config: { kind: "add_tag", tags: ["Newsletter"] },
    },
    {
      id: "wait_3_days",
      label: "Wait 3 days",
      config: { kind: "wait", mode: "duration", amount: 3, unit: "days" },
    },
    {
      id: "value_email",
      label: "Value email",
      config: {
        kind: "send_email",
        subject: "3 things we would fix first",
        body: "Hi {{contact.first_name}}, here are the three things we would tackle first.",
      },
    },
  ],
  settings: { allowMultipleEnrollment: false, stopOnReply: true },
};
