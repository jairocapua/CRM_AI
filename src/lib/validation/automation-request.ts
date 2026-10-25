import { z } from "zod";

import type { AutomationRequestPriority } from "@/types";

/**
 * The automation request form (`/automation/requests`). The API checks the
 * same rules (`api.automationRequests.create`); this gives each field its
 * message before anything is sent.
 */
export const automationRequestSchema = z.object({
  title: z.string().trim().min(1, "Give the request a title."),
  problem: z.string().trim().min(1, "Say what goes wrong today."),
  trigger: z.string().trim().min(1, "Say what should start it."),
  outcome: z.string().trim().min(1, "Say what should happen."),
  priority: z.enum(["low", "normal", "high"] satisfies [
    AutomationRequestPriority,
    ...AutomationRequestPriority[],
  ]),
});

export type AutomationRequestFormValues = z.infer<
  typeof automationRequestSchema
>;

export const EMPTY_AUTOMATION_REQUEST: AutomationRequestFormValues = {
  title: "",
  problem: "",
  trigger: "",
  outcome: "",
  priority: "normal",
};
