import type {
  CustomField,
  ID,
  ISODate,
  Opportunity,
  Pipeline,
  PipelineStage,
} from "@/types";
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
 * A table's rows, read through `Object.entries`. The writes below read whole
 * tables this way, not with `Object.values`: the e2e read fault
 * (`failReads` in e2e/calendar-helpers.ts) patches `Object.values` to fail a
 * table's list reads, and a write must survive it so a spec can fail only
 * the refetch after it.
 */
function rowsOf<T>(table: Record<ID, T>): T[] {
  return Object.entries(table).map(([, row]) => row);
}

/** Whether `deal` belongs to the pipeline `pipelineId`. */
export function dealInPipeline(deal: Opportunity, pipelineId: ID): boolean {
  return deal.pipelineId === pipelineId;
}

/** Whether `deal` sits in the stage `stageId` of the pipeline `pipelineId`. */
export function dealInStage(
  deal: Opportunity,
  pipelineId: ID,
  stageId: ID,
): boolean {
  return dealInPipeline(deal, pipelineId) && deal.stageId === stageId;
}

/** The pipelines left once `id` goes, in position order. */
function pipelinesLeft(state: DbState, id: ID): Pipeline[] {
  return rowsOf(state.pipelines)
    .filter((p) => p.id !== id)
    .sort((a, b) => a.position - b.position);
}

/**
 * The pipeline that becomes the default when `id` is deleted: the first one
 * left, when `id` was the only default; otherwise none.
 */
export function nextDefaultPipeline(
  state: DbState,
  id: ID,
): Pipeline | undefined {
  const left = pipelinesLeft(state, id);
  return left.some((p) => p.isDefault) ? undefined : left[0];
}

/**
 * How many deals deleting the pipeline `id` deletes with it
 * (`cascadePipelineDelete`, same test). A count for a preview, so it reads
 * the deals with `Object.values`: an e2e deals fault fails it.
 */
export function countPipelineDeals(state: DbState, id: ID): number {
  return Object.values(state.opportunities).filter((o) => dealInPipeline(o, id))
    .length;
}

/**
 * Deleting a pipeline deletes its deals through `cascadeOpportunityDelete`,
 * renumbers the pipelines left 0..n-1 and, when the default went, makes the
 * first of them the default (`nextDefaultPipeline`). The caller refuses to
 * delete the last one.
 */
export function cascadePipelineDelete(
  state: DbState,
  id: ID,
): Partial<DbState> {
  const nextDefault = nextDefaultPipeline(state, id);
  const pipelines: DbState["pipelines"] = {};
  pipelinesLeft(state, id).forEach((p, position) => {
    pipelines[p.id] = {
      ...p,
      position,
      isDefault: p.isDefault || p.id === nextDefault?.id,
    };
  });

  const deals = rowsOf(state.opportunities)
    .filter((o) => dealInPipeline(o, id))
    .map((o) => o.id);
  return { pipelines, ...cascadeOpportunityDelete(state, deals) };
}

/** A pipeline's stages in board order (by position). */
export function stagesInOrder(pipeline: Pipeline): PipelineStage[] {
  return [...pipeline.stages].sort((a, b) => a.position - b.position);
}

/**
 * Where removing `stageId` moves its deals: the stage before it in board
 * order, or the one after it when it is the first. None when it is the
 * pipeline's only stage, or not one of its stages.
 */
export function stageRemovalNeighbour(
  pipeline: Pipeline,
  stageId: ID,
): PipelineStage | undefined {
  const stages = stagesInOrder(pipeline);
  const index = stages.findIndex((s) => s.id === stageId);
  if (index < 0) return undefined;
  return stages[index === 0 ? 1 : index - 1];
}

/** How many of a stage's deals are closed, by status. */
export interface ClosedDealCounts {
  won: number;
  lost: number;
  abandoned: number;
}

/**
 * The deals removing a stage moves (`cascadeStageDelete`, same test): how
 * many, and how many of them are won, lost or abandoned. A count for a
 * preview, so it reads the deals with `Object.values`: an e2e deals fault
 * fails it.
 */
export function countStageDeals(
  state: DbState,
  pipelineId: ID,
  stageId: ID,
): { count: number; closed: ClosedDealCounts } {
  const moving = Object.values(state.opportunities).filter((o) =>
    dealInStage(o, pipelineId, stageId),
  );
  const count = (status: Opportunity["status"]) =>
    moving.filter((o) => o.status === status).length;
  return {
    count: moving.length,
    closed: {
      won: count("won"),
      lost: count("lost"),
      abandoned: count("abandoned"),
    },
  };
}

/**
 * Removing a stage keeps its deals: they join the end of the neighbouring
 * column (`fallbackId`), in their old order, and that column is renumbered
 * 0..n-1. The deals that moved start their time in the new stage at `at`
 * (`stageEnteredAt`, and `updatedAt`); their status is kept, so won deals
 * stay won. The stages left are renumbered too. The caller checks that both
 * stages exist and that they differ.
 */
export function cascadeStageDelete(
  state: DbState,
  pipelineId: ID,
  stageId: ID,
  fallbackId: ID,
  at: ISODate,
): Partial<DbState> {
  const pipeline = state.pipelines[pipelineId]!;
  const stages = stagesInOrder(pipeline)
    .filter((s) => s.id !== stageId)
    .map((s, position) => ({ ...s, position }));

  const inColumn = (id: ID) =>
    rowsOf(state.opportunities)
      .filter((o) => dealInStage(o, pipelineId, id))
      .sort((a, b) => a.position - b.position);
  const opportunities = { ...state.opportunities };
  inColumn(fallbackId).forEach((o, position) => {
    if (o.position !== position) opportunities[o.id] = { ...o, position };
  });
  const staying = inColumn(fallbackId).length;
  inColumn(stageId).forEach((o, index) => {
    opportunities[o.id] = {
      ...o,
      stageId: fallbackId,
      position: staying + index,
      stageEnteredAt: at,
      updatedAt: at,
    };
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
 * Whether a record's custom values hold a value for `key` that the contact
 * and deal pages show: anything but absent, `null`, "" or an empty list
 * (`false` is a value: the page shows "No"). The contact and deal forms save
 * `null` for every custom field left empty, so a key can be stored with no
 * value in it.
 */
export function holdsCustomFieldValue(
  values: Record<string, unknown>,
  key: string,
): boolean {
  const value = values[key];
  return (
    value !== undefined &&
    value !== null &&
    value !== "" &&
    !(Array.isArray(value) && value.length === 0)
  );
}

/**
 * How many records of `field`'s object type hold a value for it
 * (`holdsCustomFieldValue`): the values `cascadeCustomFieldDelete` deletes.
 * It also deletes the key where it holds no value, which no one loses, so
 * those are not counted.
 */
export function countCustomFieldValues(
  state: DbState,
  field: CustomField,
): number {
  const table: Record<ID, { customFields: Record<string, unknown> }> =
    field.objectType === "contact" ? state.contacts : state.opportunities;
  return Object.values(table).filter((row) =>
    holdsCustomFieldValue(row.customFields, field.key),
  ).length;
}

/**
 * Deleting a custom field deletes the values stored under its key, on the
 * records of its own object type only: a contact field and a deal field may
 * share a key. The key goes wherever it is stored, value or not
 * (`countCustomFieldValues` counts the values), so no record is left holding
 * a key for a field that is gone. The fields of its object type left are
 * renumbered 0..n-1 in their order, so the next one added goes last; the
 * other type's fields are untouched. Timestamps are kept.
 */
export function cascadeCustomFieldDelete(
  state: DbState,
  id: ID,
): Partial<DbState> {
  const field = state.customFields[id];
  const customFields = omitBy(state.customFields, (_, key) => key === id);
  if (!field) return { customFields };

  Object.entries(customFields)
    .map(([, f]) => f)
    .filter((f) => f.objectType === field.objectType)
    .sort((a, b) => a.position - b.position)
    .forEach((f, position) => {
      if (f.position !== position) customFields[f.id] = { ...f, position };
    });

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

/** Whether a contact or deal carries the tag `tagId`. */
export function holdsTag(
  record: { tagIds: readonly ID[] },
  tagId: ID,
): boolean {
  return record.tagIds.includes(tagId);
}

/**
 * The contacts and deals tagged `tagId` (`holdsTag`): the records
 * `cascadeTagDelete` strips it from, and the ones `cascadeTagMerge` moves
 * to the target. A count for a preview, so it reads the tables with
 * `Object.values`: an e2e contacts or deals fault fails it.
 */
export function countTaggedRecords(
  state: DbState,
  tagId: ID,
): { contacts: number; deals: number } {
  return {
    contacts: Object.values(state.contacts).filter((c) => holdsTag(c, tagId))
      .length,
    deals: Object.values(state.opportunities).filter((o) => holdsTag(o, tagId))
      .length,
  };
}

/**
 * How many contacts carry `targetId` once `sourceId` is merged into it: the
 * ones tagged with either, each counted once (`cascadeTagMerge`). Reads the
 * contacts with `Object.values`, as `countTaggedRecords`.
 */
export function countContactsAfterMerge(
  state: DbState,
  sourceId: ID,
  targetId: ID,
): number {
  return Object.values(state.contacts).filter(
    (c) => holdsTag(c, sourceId) || holdsTag(c, targetId),
  ).length;
}

/**
 * `tagIds` with `sourceId` replaced by `targetId` in its place, or simply
 * dropped when `targetId` is already there: no tag is listed twice and the
 * rest keep their order.
 */
export function mergedTagIds(
  tagIds: readonly ID[],
  sourceId: ID,
  targetId: ID,
): ID[] {
  const out: ID[] = [];
  for (const id of tagIds) {
    const next = id === sourceId ? targetId : id;
    if (!out.includes(next)) out.push(next);
  }
  return out;
}

/** `table` with `change` applied to every row tagged `tagId`; the rest kept. */
function retag<T extends { tagIds: ID[] }>(
  table: Record<ID, T>,
  tagId: ID,
  change: (tagIds: ID[]) => ID[],
): Record<ID, T> {
  const out: Record<ID, T> = {};
  for (const [key, row] of Object.entries(table)) {
    out[key] = holdsTag(row, tagId)
      ? { ...row, tagIds: change(row.tagIds) }
      : row;
  }
  return out;
}

/**
 * Deleting a tag takes it off every contact and deal that carries it, so
 * none is left tagged with a tag that is gone. Their timestamps are kept
 * (as `reassignUserReferences`): the records' own details did not change.
 * Reads every table through `Object.entries`, so an e2e read fault leaves
 * the write alone.
 */
export function cascadeTagDelete(state: DbState, id: ID): Partial<DbState> {
  return {
    tags: omitBy(state.tags, (_, key) => key === id),
    contacts: retag(state.contacts, id, (ids) => ids.filter((t) => t !== id)),
    opportunities: retag(state.opportunities, id, (ids) =>
      ids.filter((t) => t !== id),
    ),
  };
}

/**
 * Merging `sourceId` into `targetId`: every contact and deal tagged with the
 * source carries the target instead (`mergedTagIds`: in the source's place,
 * or nowhere new when it already has the target), then the source is
 * deleted. Record timestamps are kept, as `cascadeTagDelete`. The caller
 * checks both tags exist and differ.
 */
export function cascadeTagMerge(
  state: DbState,
  sourceId: ID,
  targetId: ID,
): Partial<DbState> {
  const change = (ids: ID[]) => mergedTagIds(ids, sourceId, targetId);
  return {
    tags: omitBy(state.tags, (_, key) => key === sourceId),
    contacts: retag(state.contacts, sourceId, change),
    opportunities: retag(state.opportunities, sourceId, change),
  };
}
