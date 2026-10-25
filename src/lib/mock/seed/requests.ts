import type { AutomationRequest, ID, User } from "@/types";
import { AUTOMATIONS } from "@/lib/automations";
import { newId } from "../ids";
import { refPlusDays } from "./rng";

/**
 * Seeded automation requests (design "Phase 8b"): what the team has asked
 * the developer for, one or more in every status. Written by hand, so it
 * makes no faker draws, and dated before the anchor.
 *
 * A shipped request names a real registry automation, and the developer's
 * reply (`notes`) says what shipped; a declined one says why.
 *
 * Called last in `buildDb()`, after the runs.
 */

/** The automation a slug names, by `Workflow.id`. Throws on a missing slug. */
function automationId(slug: string): ID {
  const definition = AUTOMATIONS[slug];
  if (!definition) throw new Error(`No automation "${slug}" to ship to.`);
  return definition.id;
}

export function seedAutomationRequests(users: User[]): AutomationRequest[] {
  // Hand-written user ids (`usr_jordan`), checked so a renamed teammate
  // fails the seed instead of leaving a request nobody asked.
  const known = new Set(users.map((u) => u.id));
  const by = (id: ID): ID => {
    if (!known.has(id)) throw new Error(`No seeded user "${id}".`);
    return id;
  };

  const rows: Omit<AutomationRequest, "id">[] = [
    {
      title: "Remind people the day before their appointment",
      problem:
        "About one in five discovery calls is a no-show, and most of them say they forgot.",
      trigger: "Someone books any appointment.",
      outcome:
        "Text them to confirm right away, then again the day before with the time.",
      status: "shipped",
      priority: "high",
      notes:
        "Shipped as Appointment Reminders: a confirmation text when they book and a reminder the day before.",
      shippedWorkflowId: automationId("appointment-reminders"),
      createdBy: by("usr_priya"),
      createdAt: refPlusDays(-74, 15, 12),
      updatedAt: refPlusDays(-66, 10, 40),
    },
    {
      title: "Win back people who miss a call",
      problem:
        "When someone misses a call we only notice days later, and by then they have gone cold.",
      trigger: "An appointment is marked as a no-show.",
      outcome:
        "Text them a link to rebook, and if they have not rebooked after two days, give me a task to call them.",
      status: "shipped",
      priority: "normal",
      notes:
        "Shipped as No-Show Recovery. The call task goes to Sam, as you asked.",
      shippedWorkflowId: automationId("no-show-recovery"),
      createdBy: by("usr_sam"),
      createdAt: refPlusDays(-51, 9, 5),
      updatedAt: refPlusDays(-40, 16, 30),
    },
    {
      title: "Delete contacts with no activity for 90 days",
      problem: "The contact list is full of people we will never hear from.",
      trigger: "A contact has had no activity for 90 days.",
      outcome: "Delete the contact.",
      status: "declined",
      priority: "low",
      notes:
        'Declined: a deleted contact cannot be brought back, and the automation would also delete their history. I can tag them "Inactive" instead, so you can review the list and delete them yourself.',
      createdBy: by("usr_marcus"),
      createdAt: refPlusDays(-33, 11, 20),
      updatedAt: refPlusDays(-31, 14, 0),
    },
    {
      title: "Flag deals stuck in one stage for two weeks",
      problem:
        "Deals sit in Proposal Sent for weeks and nobody notices until the end of the month.",
      trigger: "A deal has been in the same stage for 14 days.",
      outcome: "Tell the deal's owner and add a task to follow up.",
      status: "in_review",
      priority: "high",
      notes:
        "Looking at it. Should this watch every pipeline, or only Sales Pipeline?",
      createdBy: by("usr_lena"),
      createdAt: refPlusDays(-12, 13, 45),
      updatedAt: refPlusDays(-9, 10, 15),
    },
    {
      title: "Thank customers after their first payment",
      problem:
        "New customers hear nothing from us between signing and kickoff.",
      trigger: "A deal is marked won for the first time for that contact.",
      outcome: "Send a thank-you email from the account owner.",
      status: "requested",
      priority: "normal",
      createdBy: by("usr_aiko"),
      createdAt: refPlusDays(-5, 16, 20),
      updatedAt: refPlusDays(-5, 16, 20),
    },
    {
      title: "Tag contacts who open three emails in a week",
      problem: "We cannot tell who is actually reading our newsletter.",
      trigger: "A contact opens three emails within seven days.",
      outcome: 'Add the tag "Engaged" so sales can call them.',
      status: "requested",
      priority: "low",
      createdBy: by("usr_jordan"),
      createdAt: refPlusDays(-2, 8, 30),
      updatedAt: refPlusDays(-2, 8, 30),
    },
  ];

  return rows.map((row) => ({ ...row, id: newId("req") }));
}
