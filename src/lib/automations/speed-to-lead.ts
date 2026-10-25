import type { AutomationDefinition } from "@/types";

/** The canonical GoHighLevel workflow: answer fast, then fork on a reply. */
export const speedToLead: AutomationDefinition = {
  id: "wf_speed_to_lead",
  name: "Speed to Lead",
  description:
    "Respond to new audit requests within minutes and route hot leads to a rep.",
  folder: "Lead Capture",
  status: "published",
  owner: "priya",
  trigger: {
    label: "Form submitted",
    config: { kind: "form_submitted", formName: "Free Website Audit" },
  },
  steps: [
    {
      id: "notify_sales",
      label: "Notify sales",
      config: {
        kind: "internal_notification",
        users: ["jordan", "priya"],
        body: "New audit request",
      },
    },
    {
      id: "send_sms",
      label: "Send SMS",
      config: {
        kind: "send_sms",
        body: "Hi {{contact.first_name}}, thanks for requesting the audit! When is a good time to talk?",
      },
    },
    {
      id: "wait_30_minutes",
      label: "Wait 30 minutes",
      config: { kind: "wait", mode: "duration", amount: 30, unit: "minutes" },
    },
    {
      id: "replied",
      label: "Replied?",
      config: {
        kind: "if_else",
        branches: [
          {
            id: "b_replied",
            label: "Replied",
            filter: {
              id: "fg_replied",
              combinator: "and",
              conditions: [
                {
                  id: "fc_active_last_day",
                  field: "lastActivityAt",
                  operator: "inLastDays",
                  value: 1,
                },
              ],
            },
            steps: [
              {
                id: "assign_rep",
                label: "Assign rep",
                config: {
                  kind: "assign_user",
                  strategy: "round_robin",
                  users: ["priya", "marcus", "lena"],
                },
              },
            ],
          },
          {
            id: "b_silent",
            label: "No reply",
            filter: { id: "fg_silent", combinator: "and", conditions: [] },
            steps: [
              {
                id: "send_audit_email",
                label: "Send audit email",
                config: {
                  kind: "send_email",
                  subject: "Your website audit",
                  body: "Hi {{contact.first_name}}, here is the audit we promised.",
                },
              },
            ],
          },
        ],
      },
    },
  ],
  settings: { allowMultipleEnrollment: false, stopOnReply: true },
};
