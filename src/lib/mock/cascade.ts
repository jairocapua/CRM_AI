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
 * their deals, threads and messages, plus their notes, tasks, appointments,
 * timeline entries and automation runs. Every contact has at least a
 * `contact.created` activity, so skipping the activity sweep orphans a record
 * on every single delete.
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
  const workflowRuns = omitBy(state.workflowRuns, (r) => gone.has(r.contactId));

  return {
    contacts,
    opportunities,
    conversations,
    messages,
    notes,
    tasks,
    appointments,
    activities,
    workflowRuns,
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

/**
 * Deleting a pipeline deletes its deals through `cascadeOpportunityDelete`,
 * renumbers the pipelines left 0..n-1 and, when the default went, makes the
 * first of them the default. The caller refuses to delete the last one.
 */
export function cascadePipelineDelete(
  state: DbState,
  id: ID,
): Partial<DbState> {
  const left = Object.values(state.pipelines)
    .filter((p) => p.id !== id)
    .sort((a, b) => a.position - b.position);
  const needsDefault = !left.some((p) => p.isDefault);
  const pipelines: DbState["pipelines"] = {};
  left.forEach((p, position) => {
    pipelines[p.id] = {
      ...p,
      position,
      isDefault: p.isDefault || (needsDefault && position === 0),
    };
  });

  const deals = Object.values(state.opportunities)
    .filter((o) => o.pipelineId === id)
    .map((o) => o.id);
  return { pipelines, ...cascadeOpportunityDelete(state, deals) };
}

/**
 * Removing a stage keeps its deals: they join the end of the neighbouring
 * column (`fallbackId`), in their old order, and that column is renumbered
 * 0..n-1. The stages left are renumbered too. The caller checks that both
 * stages exist and that they differ.
 */
export function cascadeStageDelete(
  state: DbState,
  pipelineId: ID,
  stageId: ID,
  fallbackId: ID,
): Partial<DbState> {
  const pipeline = state.pipelines[pipelineId]!;
  const stages = [...pipeline.stages]
    .sort((a, b) => a.position - b.position)
    .filter((s) => s.id !== stageId)
    .map((s, position) => ({ ...s, position }));

  const inColumn = (id: ID) =>
    Object.values(state.opportunities)
      .filter((o) => o.pipelineId === pipelineId && o.stageId === id)
      .sort((a, b) => a.position - b.position);
  const opportunities = { ...state.opportunities };
  [...inColumn(fallbackId), ...inColumn(stageId)].forEach((o, position) => {
    opportunities[o.id] = { ...o, stageId: fallbackId, position };
  });

  return {
    pipelines: { ...state.pipelines, [pipelineId]: { ...pipeline, stages } },
    opportunities,
  };
}

/** Maps every `from` in a table's field to `to`, keeping untouched rows. */
function reassign<T, K extends keyof T>(
  table: Record<ID, T>,
  field: K,
  from: ID,
  to: ID,
): Record<ID, T> {
  const out: Record<ID, T> = {};
  for (const [id, row] of Object.entries(table)) {
    out[id] = row[field] === from ? { ...row, [field]: to } : row;
  }
  return out;
}

/**
 * Removing a teammate hands what they hold to `toId`: the contacts and deals
 * they own, the tasks, conversations and appointments assigned to them, their
 * calendar seats (replaced in place, nobody listed twice) and their private
 * smart lists. Following is personal, so their follows are dropped and nobody
 * is added. History keeps its author: `createdBy`, notes' `authorId`,
 * messages' `authorId` and activities' `actorId` are left as they are, and the
 * pages show "Unknown teammate" (or nothing) for someone who is gone.
 */
export function reassignUserReferences(
  state: DbState,
  fromId: ID,
  toId: ID,
): Partial<DbState> {
  const contacts: DbState["contacts"] = {};
  for (const [id, contact] of Object.entries(state.contacts)) {
    const owned = contact.ownerId === fromId;
    const follows = contact.followers.includes(fromId);
    contacts[id] =
      owned || follows
        ? {
            ...contact,
            ...(owned ? { ownerId: toId } : {}),
            ...(follows
              ? { followers: contact.followers.filter((f) => f !== fromId) }
              : {}),
          }
        : contact;
  }

  const calendars: DbState["calendars"] = {};
  for (const [id, calendar] of Object.entries(state.calendars)) {
    calendars[id] = calendar.teamMemberIds.includes(fromId)
      ? {
          ...calendar,
          teamMemberIds: [
            ...new Set(
              calendar.teamMemberIds.map((m) => (m === fromId ? toId : m)),
            ),
          ],
        }
      : calendar;
  }

  return {
    contacts,
    opportunities: reassign(state.opportunities, "ownerId", fromId, toId),
    tasks: reassign(state.tasks, "assigneeId", fromId, toId),
    conversations: reassign(state.conversations, "assigneeId", fromId, toId),
    appointments: reassign(state.appointments, "assignedUserId", fromId, toId),
    calendars,
    smartLists: reassign(state.smartLists, "ownerId", fromId, toId),
  };
}

/**
 * How much `reassignUserReferences(state, id, …)` would move, by kind: the
 * contacts and deals `id` owns, the tasks, conversations and appointments
 * assigned to them, the calendars they are a team member of, their private
 * smart lists, and the contacts they follow (dropped, not moved). Each count
 * uses the same test the reassignment does, so a preview never disagrees
 * with the removal.
 */
export interface UserReferenceCounts {
  contacts: number;
  opportunities: number;
  tasks: number;
  conversations: number;
  appointments: number;
  calendars: number;
  smartLists: number;
  follows: number;
}

export function countUserReferences(
  state: DbState,
  id: ID,
): UserReferenceCounts {
  const count = <T>(table: Record<ID, T>, holds: (row: T) => boolean) =>
    Object.values(table).filter(holds).length;
  return {
    contacts: count(state.contacts, (c) => c.ownerId === id),
    opportunities: count(state.opportunities, (o) => o.ownerId === id),
    tasks: count(state.tasks, (t) => t.assigneeId === id),
    conversations: count(state.conversations, (c) => c.assigneeId === id),
    appointments: count(state.appointments, (a) => a.assignedUserId === id),
    calendars: count(state.calendars, (c) => c.teamMemberIds.includes(id)),
    smartLists: count(state.smartLists, (l) => l.ownerId === id),
    follows: count(state.contacts, (c) => c.followers.includes(id)),
  };
}

/**
 * Deleting a custom field deletes the values stored under its key, on the
 * records of its own object type only: a contact field and a deal field may
 * share a key.
 */
export function cascadeCustomFieldDelete(
  state: DbState,
  id: ID,
): Partial<DbState> {
  const field = state.customFields[id];
  const customFields = omitBy(state.customFields, (_, key) => key === id);
  if (!field) return { customFields };

  const strip = <T extends { customFields: Record<string, unknown> }>(
    table: Record<ID, T>,
  ): Record<ID, T> => {
    const out: Record<ID, T> = {};
    for (const [key, row] of Object.entries(table)) {
      if (field.key in row.customFields) {
        const values = { ...row.customFields };
        delete values[field.key];
        out[key] = { ...row, customFields: values };
      } else {
        out[key] = row;
      }
    }
    return out;
  };

  return field.objectType === "contact"
    ? { customFields, contacts: strip(state.contacts) }
    : { customFields, opportunities: strip(state.opportunities) };
}
