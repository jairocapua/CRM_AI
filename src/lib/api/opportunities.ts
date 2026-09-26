import type { Activity, Cents, ID, Opportunity } from "@/types";
import { db } from "@/lib/mock/db";
import { newId } from "@/lib/mock/ids";
import { applyQuery } from "@/lib/mock/query-engine";
import { cascadeOpportunityDelete } from "@/lib/mock/cascade";
import { invalidate } from "./cache";
import { notFound, nowIso, simulate, type ListQuery, type Page } from "./http";

const SEARCH_FIELDS = ["name", "lostReason"];

function pushActivity(activity: Omit<Activity, "id">) {
  const record: Activity = { ...activity, id: newId("act") };
  db.setState((s) => ({
    activities: { ...s.activities, [record.id]: record },
  }));
}

export async function list(query: ListQuery = {}): Promise<Page<Opportunity>> {
  return simulate(
    () =>
      applyQuery(Object.values(db.getState().opportunities), query, {
        searchFields: SEARCH_FIELDS,
        defaultSort: [{ field: "updatedAt", desc: true }],
      }),
    { canFail: false },
  );
}

/** Every deal in one pipeline, ordered for the board columns. */
export async function listForBoard(pipelineId: ID): Promise<Opportunity[]> {
  return simulate(
    () =>
      Object.values(db.getState().opportunities)
        .filter((o) => o.pipelineId === pipelineId)
        .sort((a, b) => a.position - b.position),
    { canFail: false },
  );
}

export async function listForContact(contactId: ID): Promise<Opportunity[]> {
  return simulate(
    () =>
      Object.values(db.getState().opportunities)
        .filter((o) => o.contactId === contactId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    { canFail: false },
  );
}

export async function get(id: ID): Promise<Opportunity> {
  return simulate(
    () => db.getState().opportunities[id] ?? notFound("Opportunity", id),
    { canFail: false },
  );
}

export type OpportunityDraft = Partial<Opportunity> &
  Pick<Opportunity, "name" | "contactId" | "pipelineId" | "stageId">;

export async function create(draft: OpportunityDraft): Promise<Opportunity> {
  const opportunity = await simulate(
    () => {
      const at = nowIso();
      const siblings = Object.values(db.getState().opportunities).filter(
        (o) => o.stageId === draft.stageId,
      );
      const record: Opportunity = {
        id: newId("opp"),
        position: siblings.length,
        value: 0,
        currency: "USD",
        status: "open",
        source: "manual",
        tagIds: [],
        customFields: {},
        stageEnteredAt: at,
        createdAt: at,
        updatedAt: at,
        ...draft,
      };
      db.setState((s) => ({
        opportunities: { ...s.opportunities, [record.id]: record },
      }));
      pushActivity({
        type: "opportunity.created",
        at,
        contactId: record.contactId,
        opportunityId: record.id,
        actorId: db.getState().currentUserId,
        summary: `Opportunity "${record.name}" was created`,
      });
      return record;
    },
    { ms: 380 },
  );

  invalidate("opportunities", "activities", "analytics");
  return opportunity;
}

export async function update(
  id: ID,
  patch: Partial<Opportunity>,
): Promise<Opportunity> {
  const opportunity = await simulate(() => {
    const prev = db.getState().opportunities[id] ?? notFound("Opportunity", id);
    const next: Opportunity = { ...prev, ...patch, id, updatedAt: nowIso() };
    db.setState((s) => ({ opportunities: { ...s.opportunities, [id]: next } }));
    return next;
  });
  invalidate("opportunities", "analytics");
  return opportunity;
}

/**
 * Commits a board drag. The optimistic reorder already happened locally, so
 * this rewrites the positions of both affected columns and records the move on
 * the contact's timeline.
 */
export async function move(
  id: ID,
  target: { stageId: ID; position: number },
): Promise<Opportunity> {
  const opportunity = await simulate(() => {
    const state = db.getState();
    const prev = state.opportunities[id] ?? notFound("Opportunity", id);
    const at = nowIso();
    const changedStage = prev.stageId !== target.stageId;

    const pipeline = state.pipelines[prev.pipelineId];
    const stage = pipeline?.stages.find((s) => s.id === target.stageId);

    const next: Opportunity = {
      ...prev,
      stageId: target.stageId,
      position: target.position,
      stageEnteredAt: changedStage ? at : prev.stageEnteredAt,
      status: stage?.isWon ? "won" : stage?.isLost ? "lost" : "open",
      closedAt: stage?.isWon || stage?.isLost ? at : undefined,
      updatedAt: at,
    };

    // Renumber the destination column so positions stay dense and stable.
    db.setState((s) => {
      const opportunities = { ...s.opportunities, [id]: next };
      const column = Object.values(opportunities)
        .filter((o) => o.stageId === target.stageId && o.id !== id)
        .sort((a, b) => a.position - b.position);

      column.splice(target.position, 0, next);
      column.forEach((opp, position) => {
        opportunities[opp.id] = { ...opportunities[opp.id]!, position };
      });

      return { opportunities };
    });

    if (changedStage) {
      pushActivity({
        type: stage?.isWon
          ? "opportunity.won"
          : stage?.isLost
            ? "opportunity.lost"
            : "opportunity.stage_changed",
        at,
        contactId: next.contactId,
        opportunityId: next.id,
        actorId: state.currentUserId,
        summary: stage?.isWon
          ? `Won "${next.name}"`
          : `Moved "${next.name}" to ${stage?.name ?? "a new stage"}`,
        meta: { to: stage?.name },
      });
    }

    return next;
  });

  invalidate("opportunities", "activities", "analytics");
  return opportunity;
}

export async function setStatus(
  id: ID,
  status: Opportunity["status"],
  lostReason?: string,
): Promise<Opportunity> {
  const at = nowIso();
  const opportunity = await update(id, {
    status,
    lostReason: status === "lost" ? lostReason : undefined,
    closedAt: status === "open" ? undefined : at,
  });

  pushActivity({
    type: status === "won" ? "opportunity.won" : "opportunity.lost",
    at,
    contactId: opportunity.contactId,
    opportunityId: opportunity.id,
    actorId: db.getState().currentUserId,
    summary:
      status === "won"
        ? `Won "${opportunity.name}"`
        : `Lost "${opportunity.name}"${lostReason ? ` - ${lostReason}` : ""}`,
  });

  invalidate("activities");
  return opportunity;
}

export async function remove(ids: ID[]): Promise<void> {
  await simulate(() => {
    // Drops the deal's timeline entries and detaches its tasks, so the contact
    // record keeps no links to a deal that no longer exists.
    db.setState((s) => cascadeOpportunityDelete(s, ids));
  });
  invalidate("opportunities", "tasks", "activities", "analytics");
}

export interface StageRollup {
  stageId: ID;
  count: number;
  total: Cents;
  weighted: Cents;
}

/** Per-column totals plus the probability-weighted forecast. */
export function rollupByStage(
  opportunities: Opportunity[],
  stages: { id: ID; probability: number }[],
): Map<ID, StageRollup> {
  const rollups = new Map<ID, StageRollup>(
    stages.map((s) => [
      s.id,
      { stageId: s.id, count: 0, total: 0, weighted: 0 },
    ]),
  );

  for (const opportunity of opportunities) {
    const rollup = rollups.get(opportunity.stageId);
    if (!rollup) continue;
    const probability =
      stages.find((s) => s.id === opportunity.stageId)?.probability ?? 0;
    rollup.count += 1;
    rollup.total += opportunity.value;
    rollup.weighted += Math.round((opportunity.value * probability) / 100);
  }

  return rollups;
}
