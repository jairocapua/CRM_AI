import type { Activity, ID } from "@/types";
import { db } from "@/lib/mock/db";
import { simulate } from "./http";

export interface ActivityRow extends Activity {
  /** Who it happened to — a workspace-wide feed has no contact page around it. */
  contactName?: string;
}

export async function listRecent(limit = 20): Promise<ActivityRow[]> {
  return simulate(
    () => {
      const { activities, contacts } = db.getState();
      return Object.values(activities)
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, limit)
        .map((activity) => {
          const contact = activity.contactId
            ? contacts[activity.contactId]
            : undefined;
          return {
            ...activity,
            contactName: contact
              ? `${contact.firstName} ${contact.lastName}`
              : undefined,
          };
        });
    },
    { canFail: false },
  );
}

export async function listForContact(
  contactId: ID,
  limit = 200,
): Promise<Activity[]> {
  return simulate(
    () =>
      Object.values(db.getState().activities)
        .filter((a) => a.contactId === contactId)
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, limit),
    { canFail: false },
  );
}

export async function listForOpportunity(
  opportunityId: ID,
): Promise<Activity[]> {
  return simulate(
    () =>
      Object.values(db.getState().activities)
        .filter((a) => a.opportunityId === opportunityId)
        .sort((a, b) => b.at.localeCompare(a.at)),
    { canFail: false },
  );
}
