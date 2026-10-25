import type { AutomationDefinition } from "@/types";

/** Win back a missed appointment with a text and a follow-up call. */
export const noShowRecovery: AutomationDefinition = {
  id: "wf_no_show_recovery",
  name: "No-Show Recovery",
  description: "Win back missed appointments with a text and a follow-up task.",
  folder: "Scheduling",
  status: "published",
  owner: "sam",
  trigger: {
    label: "Tagged: Needs Follow Up",
    config: { kind: "tag_added", tags: ["Needs Follow Up"] },
  },
  steps: [
    {
      id: "no_show_sms",
      label: "No-show SMS",
      config: {
        kind: "send_sms",
        body: "Sorry we missed you! Grab another time here: {{calendar.link}}",
      },
    },
    {
      id: "wait_2_days",
      label: "Wait 2 days",
      config: { kind: "wait", mode: "duration", amount: 2, unit: "days" },
    },
    {
      id: "call_task",
      label: "Create task",
      config: {
        kind: "create_task",
        title: "Call the no-show",
        dueInDays: 1,
        assignee: "sam",
      },
    },
  ],
  settings: { allowMultipleEnrollment: false, stopOnReply: true },
};
