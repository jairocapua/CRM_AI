import type { AutomationDefinition } from "@/types";

/** Chase a proposal that has gone quiet. */
export const proposalFollowUp: AutomationDefinition = {
  id: "wf_proposal_follow_up",
  name: "Proposal Follow-Up",
  description: "Chase proposals that have gone quiet for five days.",
  folder: "Sales",
  status: "paused",
  owner: "marcus",
  trigger: {
    label: "Tagged: Proposal Sent",
    config: { kind: "tag_added", tags: ["Proposal Sent"] },
  },
  steps: [
    {
      id: "wait_5_days",
      label: "Wait 5 days",
      config: { kind: "wait", mode: "duration", amount: 5, unit: "days" },
    },
    {
      id: "send_email",
      label: "Send email",
      config: {
        kind: "send_email",
        subject: "Proposal Follow-Up",
        body: "Hi {{contact.first_name}}, just checking in.",
        fromUser: "marcus",
      },
    },
  ],
  settings: { allowMultipleEnrollment: false, stopOnReply: true },
};
