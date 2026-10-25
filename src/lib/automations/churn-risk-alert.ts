import type { AutomationDefinition } from "@/types";

/** Reach out to an account that has gone quiet. */
export const churnRiskAlert: AutomationDefinition = {
  id: "wf_churn_risk_alert",
  name: "Churn Risk Alert",
  description: "Flag accounts that have gone quiet for 30 days.",
  folder: "Retention",
  status: "draft",
  owner: "aiko",
  trigger: {
    label: "Tagged: Churn Risk",
    config: { kind: "tag_added", tags: ["Churn Risk"] },
  },
  steps: [
    {
      id: "wait_1_day",
      label: "Wait 1 day",
      config: { kind: "wait", mode: "duration", amount: 1, unit: "days" },
    },
    {
      id: "send_email",
      label: "Send email",
      config: {
        kind: "send_email",
        subject: "Churn Risk Alert",
        body: "Hi {{contact.first_name}}, just checking in.",
      },
    },
  ],
  settings: { allowMultipleEnrollment: false, stopOnReply: true },
};
