import type { AutomationDefinition } from "@/types";

/** Ask a happy client for a review once the deal is won. */
export const reviewRequest: AutomationDefinition = {
  id: "wf_review_request",
  name: "Review Request",
  description: "Ask happy clients for a review after a won deal.",
  folder: "Retention",
  status: "published",
  owner: "aiko",
  trigger: { label: "Started manually", config: { kind: "manual" } },
  steps: [
    {
      id: "wait_2_days",
      label: "Wait 2 days",
      config: { kind: "wait", mode: "duration", amount: 2, unit: "days" },
    },
    {
      id: "send_email",
      label: "Send email",
      config: {
        kind: "send_email",
        subject: "Review Request",
        body: "Hi {{contact.first_name}}, just checking in.",
      },
    },
  ],
  settings: { allowMultipleEnrollment: false, stopOnReply: true },
};
