import type { AutomationDefinition } from "@/types";

import { appointmentReminders } from "./appointment-reminders";
import { birthdayGreeting } from "./birthday-greeting";
import { churnRiskAlert } from "./churn-risk-alert";
import { layout, type Layout } from "./layout";
import { newLeadNurture } from "./new-lead-nurture";
import { noShowRecovery } from "./no-show-recovery";
import { proposalFollowUp } from "./proposal-follow-up";
import { reviewRequest } from "./review-request";
import { speedToLead } from "./speed-to-lead";

/**
 * Every automation, keyed by slug: the module's file name, so a definition's
 * source is `src/lib/automations/<slug>.ts`. Ids are `wf_<slug>` with
 * underscores, written by hand.
 *
 * This is code, not data: a developer adds an automation by adding a module
 * here, and staff can only view it. Read it through `api.workflows`, which
 * resolves the tag and user keys to ids, never directly from a component.
 */
export const AUTOMATIONS: Readonly<Record<string, AutomationDefinition>> =
  deepFreeze({
    "speed-to-lead": speedToLead,
    "appointment-reminders": appointmentReminders,
    "no-show-recovery": noShowRecovery,
    "new-lead-nurture": newLeadNurture,
    "proposal-follow-up": proposalFollowUp,
    "review-request": reviewRequest,
    "churn-risk-alert": churnRiskAlert,
    "birthday-greeting": birthdayGreeting,
  });

/**
 * Every automation's diagram, keyed like `AUTOMATIONS`. Laid out here, at
 * import, on purpose: anything that reads the registry (`api.workflows`, the
 * integrity report) evaluates this, so a malformed definition throws when
 * the module loads and fails `next build` instead of a page at runtime.
 */
export const LAYOUTS: Readonly<Record<string, Layout>> = deepFreeze(
  Object.fromEntries(
    Object.entries(AUTOMATIONS).map(([slug, d]) => [slug, layout(d)]),
  ),
);

/** Freezes a plain object tree, so nothing can edit a definition at runtime. */
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
