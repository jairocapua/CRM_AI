import type { ID } from "@/types";
import type { DbState } from "./db-state";

/**
 * Referential cleanup for deletes.
 *
 * A relational backend would express this as `ON DELETE CASCADE`; the mock
 * store has no such enforcement, so the rules live here — in one place, rather
 * than scattered across the resource modules where it is easy to remember deals
 * and forget the activity feed. `settings.integrityReport()` checks exactly the
 * invariants these functions maintain, so a gap here shows up as a red line on
 * the Demo Data page rather than as a blank row three screens away.
 *
 * Each function returns the slices of state it changed, ready to hand back from
 * a `db.setState` updater.
 */

function omitBy<T>(
  table: Record<ID, T>,
  drop: (value: T, key: ID) => boolean,
): Record<ID, T> {
  const out: Record<ID, T> = {};
  for (const [key, value] of Object.entries(table)) {
    if (!drop(value, key)) out[key] = value;
  }
  return out;
}

/**
 * Deleting a contact deletes everything that only exists because of them:
 * their deals, threads and messages, plus their notes, tasks, appointments and
 * timeline entries. Every contact has at least a `contact.created` activity, so
 * skipping the activity sweep orphans a record on every single delete.
 */
export function cascadeContactDelete(
  state: DbState,
  ids: ID[],
): Partial<DbState> {
  const gone = new Set(ids);

  const contacts = omitBy(state.contacts, (_, id) => gone.has(id));
  const opportunities = omitBy(state.opportunities, (o) =>
    gone.has(o.contactId),
  );
  const conversations = omitBy(state.conversations, (c) =>
    gone.has(c.contactId),
  );
  const keptConversations = new Set(Object.keys(conversations));
  const messages = omitBy(
    state.messages,
    (m) => !keptConversations.has(m.conversationId),
  );
  const notes = omitBy(state.notes, (n) => gone.has(n.contactId));
  const tasks = omitBy(
    state.tasks,
    (t) => !!t.contactId && gone.has(t.contactId),
  );
  const appointments = omitBy(state.appointments, (a) => gone.has(a.contactId));
  const activities = omitBy(
    state.activities,
    (a) => !!a.contactId && gone.has(a.contactId),
  );

  return {
    contacts,
    opportunities,
    conversations,
    messages,
    notes,
    tasks,
    appointments,
    activities,
  };
}

/**
 * Deleting a deal keeps the contact and their history, but drops the timeline
 * entries that describe the deal itself and detaches any task that pointed at
 * it — the task is still the contact's, so it survives without the link.
 */
export function cascadeOpportunityDelete(
  state: DbState,
  ids: ID[],
): Partial<DbState> {
  const gone = new Set(ids);

  const opportunities = omitBy(state.opportunities, (_, id) => gone.has(id));
  const activities = omitBy(
    state.activities,
    (a) => !!a.opportunityId && gone.has(a.opportunityId),
  );

  const tasks: DbState["tasks"] = {};
  for (const [id, task] of Object.entries(state.tasks)) {
    tasks[id] =
      task.opportunityId && gone.has(task.opportunityId)
        ? { ...task, opportunityId: undefined }
        : task;
  }

  return { opportunities, activities, tasks };
}
