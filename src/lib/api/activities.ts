import type { Activity, ID } from "@/types";
import { db } from "@/lib/mock/db";
import { simulate } from "./http";

export async function listRecent(limit = 20): Promise<Activity[]> {
  return simulate(
    () =>
      Object.values(db.getState().activities)
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, limit),
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
