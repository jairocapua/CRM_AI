import { z } from "zod";

import {
  LEAD_SOURCE_LABELS,
  type Activity,
  type Cents,
  type CurrencyCode,
  type ID,
  type ISODate,
  type LeadSource,
  type Opportunity,
  type PipelineStage,
} from "@/types";
import { parseInstant } from "@/lib/dates";
import { db } from "@/lib/mock/db";
import { newId } from "@/lib/mock/ids";
import { applyQuery } from "@/lib/mock/query-engine";
import { cascadeOpportunityDelete } from "@/lib/mock/cascade";
import { invalidate } from "./cache";
import {
  ApiError,
  notFound,
  nowIso,
  simulate,
  type ListQuery,
  type Page,
} from "./http";
import { withoutUndefined } from "./patch";

const SEARCH_FIELDS = ["name", "lostReason"];

/**
 * Why an expected close was refused, with an example a caller can copy. The
 * 422 reads "Expected close: <this>", "label: rule" like every other field.
 */
const EXPECTED_CLOSE_RULE =
  "Not a valid date and time. Send an ISO date-time ending in Z or an offset, such as 2026-12-01T00:00:00Z.";

/** The optional fields a caller removes by sending `null` or `undefined`. */
const REMOVABLE = ["expectedCloseAt", "ownerId", "lostReason"] as const;
type RemovableKey = (typeof REMOVABLE)[number];

/**
 * `value` as the expected close to store, run inside the schema below. It
 * must name one instant by the shared rule (`parseInstant` in `@/lib/dates`:
 * an ISO date-time ending in `Z` or an offset, on a real date, inside UTC
 * years 0000-9999), and it is stored in the UTC spelling `toISOString()`
 * gives, as book() stores a start.
 *
 * - `undefined` and `null` come back as they are: both remove the date (see
 *   `applyPatch`).
 * - Anything else that is not one instant, non-strings included, adds an
 *   issue whose message is `EXPECTED_CLOSE_RULE`, so the 422 is
 *   `INVALID_OPPORTUNITY` with `field` "expectedCloseAt" and the message
 *   P7-T35 set, word for word.
 */
function checkExpectedClose(
  value: unknown,
  ctx: z.RefinementCtx,
): ISODate | null | undefined {
  if (value === undefined || value === null) return value;
  const ms = typeof value === "string" ? parseInstant(value) : null;
  if (ms === null) {
    ctx.addIssue({ code: "custom", message: EXPECTED_CLOSE_RULE });
    return z.NEVER;
  }
  return new Date(ms).toISOString();
}

/** Every currency, as `z.enum` takes them. The mapped type keeps it complete. */
const CURRENCIES: { [K in CurrencyCode]: K } = {
  USD: "USD",
  EUR: "EUR",
  GBP: "GBP",
  CAD: "CAD",
  AUD: "AUD",
  PHP: "PHP",
};

const LEAD_SOURCES = Object.keys(LEAD_SOURCE_LABELS) as [
  LeadSource,
  ...LeadSource[],
];

const NOT_AN_AMOUNT = "Not a valid amount.";

/**
 * The keys create() and update() let a caller change, and the check each
 * value must pass. Every key is optional; `draftSchema` makes create()'s
 * required ones required. A key not named here is stripped by the parse, so
 * it can never reach the store. Ids are checked for shape only, not against
 * stored records, as `teamMemberIds` is on calendars. The one exception is
 * the pipeline and stage: create(), and a pipeline change through update(),
 * must name a stored pipeline and one of its stages (see `stageOf`).
 */
const editableSchema = z.object({
  name: z.string().trim().min(1, "Can't be empty.").optional(),
  contactId: z.string().min(1).optional(),
  pipelineId: z.string().min(1).optional(),
  value: z
    .number({ error: NOT_AN_AMOUNT })
    .int({ error: NOT_AN_AMOUNT })
    .min(0, { error: NOT_AN_AMOUNT })
    .optional(),
  currency: z.enum(CURRENCIES).optional(),
  source: z.enum(LEAD_SOURCES).optional(),
  ownerId: z.string().min(1).nullable().optional(),
  tagIds: z.array(z.string().min(1)).optional(),
  customFields: z
    .record(
      z.string(),
      z.union([
        z.string(),
        z.number(),
        z.boolean(),
        z.array(z.string()),
        z.null(),
      ]),
    )
    .optional(),
  expectedCloseAt: z.unknown().transform(checkExpectedClose).optional(),
  lostReason: z.string().nullable().optional(),
});

/**
 * update()'s input: the editable keys plus a stageId, which update() reads
 * only alongside a pipeline change (see update()).
 */
const updateSchema = editableSchema.extend({
  stageId: z.string().min(1).optional(),
});

/** create()'s input: the editable keys, with the four a deal needs required. */
const draftSchema = editableSchema.extend({
  name: z.string().trim().min(1, "Can't be empty."),
  contactId: z.string().min(1),
  pipelineId: z.string().min(1),
  stageId: z.string().min(1),
});

type EditableKey = keyof typeof editableSchema.shape;
type FieldKey = keyof typeof draftSchema.shape;

/**
 * Each key a 422 can be about, in the deal form's words. Typed by the schema's
 * keys, so a new key cannot be added without a label.
 */
const FIELD_LABELS: Record<FieldKey, string> = {
  name: "Deal name",
  contactId: "Contact",
  pipelineId: "Pipeline",
  stageId: "Stage",
  value: "Value",
  currency: "Currency",
  source: "Source",
  ownerId: "Owner",
  tagIds: "Tags",
  customFields: "Deal details",
  expectedCloseAt: "Expected close",
  lostReason: "Lost reason",
};

function isFieldKey(key: unknown): key is FieldKey {
  return typeof key === "string" && Object.hasOwn(FIELD_LABELS, key);
}

/**
 * `input` parsed by `schema`, or a 422 `INVALID_OPPORTUNITY` about the first
 * issue: "<label>: <rule>" ("Value: Not a valid amount."), with `field` the
 * dotted path to the bad value ("tagIds.0"). An issue about no one field (an
 * input that is not an object) is "Deal: Not a valid value." with `field`
 * unset.
 */
function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  // A per-parse error map ranks below every message the schema sets itself,
  // so this replaces only zod's built-in wording ("Invalid input: expected
  // string, received number"), which a wrong type would show.
  const checked = schema.safeParse(input, {
    error: () => "Not a valid value.",
  });
  if (checked.success) return checked.data;
  const [issue] = checked.error.issues;
  const path = issue?.path ?? [];
  const [key] = path;
  throw new ApiError(
    `${isFieldKey(key) ? FIELD_LABELS[key] : "Deal"}: ${issue?.message ?? "Not a valid value."}`,
    422,
    "INVALID_OPPORTUNITY",
    path.length > 0 ? path.join(".") : undefined,
  );
}

/** `value` without the given keys, as a new object. */
function withoutKeys<T extends object, K extends keyof T>(
  value: T,
  keys: readonly K[],
): Omit<T, K> {
  const copy = { ...value };
  for (const key of keys) delete copy[key];
  return copy;
}

/**
 * `base` (the stored deal, or create()'s defaults) with a parsed patch
 * applied. The one place a patch becomes an `Opportunity`. Its own body has
 * no cast: `withoutUndefined` (src/lib/api/patch.ts) casts once inside, which
 * is what lets the spread type-check. No `null` or `undefined` can reach the
 * store:
 *
 * - every key but the removable three is copied when it holds a value; an
 *   `undefined` one is skipped, the same as a missing key;
 * - expectedCloseAt, ownerId and lostReason are set when they hold a value,
 *   and deleted when they are `null` or when `sent` (the caller's own input)
 *   holds the key as `undefined`, which is what the deal form's empty fields
 *   send. A key `sent` leaves out keeps its stored value.
 */
function applyPatch(
  base: Opportunity,
  parsed: z.output<typeof editableSchema>,
  sent: object,
): Opportunity {
  const record: Opportunity = {
    ...base,
    ...withoutUndefined(withoutKeys(parsed, REMOVABLE)),
  };
  for (const key of REMOVABLE) {
    const value = parsed[key];
    if (value !== null && value !== undefined) record[key] = value;
    else if (value === null || Object.hasOwn(sent, key)) delete record[key];
  }
  return record;
}

/**
 * What update() accepts: the keys `editableSchema` names, where `null`
 * removes an optional one, the expected close, the owner or the lost reason
 * (the key is deleted, never stored as null). A JSON client cannot send
 * `undefined`, so `null` is how it clears one of these. `Pick` makes every
 * schema key an `Opportunity` key. `stageId` is read only with a pipeline
 * change (see update()).
 */
export type OpportunityPatch = Partial<
  Pick<Opportunity, Exclude<EditableKey, RemovableKey>>
> & {
  [K in RemovableKey]?: Opportunity[K] | null;
} & { stageId?: ID };

/**
 * The stage `stageId` names in the stored pipeline `pipelineId`, the one
 * check create() and update()'s pipeline change share. Throws a 422
 * `INVALID_OPPORTUNITY` "Pipeline: No pipeline has this id." (`field`
 * pipelineId) when the pipeline is not stored, then `stageMessage` (`field`
 * stageId) when the stage is missing or belongs to another pipeline. Reads
 * only, so a caller runs it before `nowIso()`.
 */
function stageOf(
  state: ReturnType<typeof db.getState>,
  pipelineId: ID,
  stageId: ID | undefined,
  stageMessage: string,
): PipelineStage {
  const pipeline = state.pipelines[pipelineId];
  if (!pipeline) {
    throw new ApiError(
      "Pipeline: No pipeline has this id.",
      422,
      "INVALID_OPPORTUNITY",
      "pipelineId",
    );
  }
  const stage = pipeline.stages.find((s) => s.id === stageId);
  if (!stage) {
    throw new ApiError(stageMessage, 422, "INVALID_OPPORTUNITY", "stageId");
  }
  return stage;
}

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

/** What create() accepts: a patch plus the four keys every deal needs. */
export type OpportunityDraft = OpportunityPatch &
  Pick<Opportunity, "name" | "contactId" | "pipelineId" | "stageId">;

/**
 * Creates a deal and records it on the contact's timeline.
 *
 * - Only the keys `draftSchema` names are saved: name, contactId, pipelineId
 *   and stageId (all required), plus value, currency, source, ownerId,
 *   tagIds, customFields, expectedCloseAt and lostReason. What is saved is
 *   the parsed draft, never the draft itself, so id, position, status,
 *   closedAt, stageEnteredAt, createdAt, createdBy, updatedAt and any key the
 *   API does not know are ignored: the deal's id, position (the end of its
 *   column), status and close date (from its stage, below) and timestamps
 *   always come from the API, never from the draft.
 * - A wrong-typed value is a 422 `INVALID_OPPORTUNITY`, "<label>: <rule>" in
 *   the deal form's words, with `field` the dotted path (see `parse`). A
 *   draft that is not an object is "Deal: Not a valid value." with no field.
 *   An expected close that is not one instant keeps P7-T35's message.
 * - The pipeline and stage must be stored, and the stage must be one of that
 *   pipeline's (see `stageOf`). Errors, in this order: 422 for the draft's
 *   shape (above), then 422 `INVALID_OPPORTUNITY` "Pipeline: No pipeline has
 *   this id." (`field` pipelineId), then "Stage: Pick a stage from this
 *   pipeline." (`field` stageId).
 * - Every check runs before `nowIso()`, so a refused draft writes nothing and
 *   does not move the demo clock.
 * - The status and close date come from the stage, the way move() and
 *   update()'s pipeline move set them (`enterStage`): a won or lost stage
 *   gives status won or lost with closedAt = createdAt; any other stage gives
 *   status open with no closedAt key. A won or lost stage also adds the same
 *   timeline entry move() writes (`stageEntryActivity`) after the "created"
 *   entry, at the same instant: `opportunity.won` "Won <deal>", or
 *   `opportunity.lost` "Moved <deal> to <stage>", plus " - <reason>" when a
 *   lostReason is sent (move()'s wording, kept so the two cannot drift). An open stage adds only the "created" entry.
 * - A lostReason is kept only in a lost stage, where it is saved with the
 *   deal in the same write as its one `opportunity.lost` entry; in an open
 *   or won stage it is dropped (`enterStage`), as setStatus() drops it.
 * - `null` or `undefined` for expectedCloseAt, ownerId or lostReason means
 *   the deal has no such field: the key is left out, never stored.
 */
export async function create(draft: OpportunityDraft): Promise<Opportunity> {
  const opportunity = await simulate(
    () => {
      const parsed = parse(draftSchema, draft);
      const state = db.getState();
      const stage = stageOf(
        state,
        parsed.pipelineId,
        parsed.stageId,
        "Stage: Pick a stage from this pipeline.",
      );
      const at = nowIso();
      const siblings = Object.values(state.opportunities).filter(
        (o) => o.stageId === parsed.stageId,
      );
      const record = applyPatch(
        {
          id: newId("opp"),
          name: parsed.name,
          contactId: parsed.contactId,
          pipelineId: parsed.pipelineId,
          stageId: parsed.stageId,
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
        },
        parsed,
        draft,
      );
      enterStage(record, stage, at);
      db.setState((s) => ({
        opportunities: { ...s.opportunities, [record.id]: record },
      }));
      const actorId = db.getState().currentUserId;
      pushActivity({
        type: "opportunity.created",
        at,
        contactId: record.contactId,
        opportunityId: record.id,
        actorId,
        summary: `Opportunity "${record.name}" was created`,
      });
      if (record.status !== "open") {
        pushActivity(stageEntryActivity(record, stage, at, actorId));
      }
      return record;
    },
    { ms: 380 },
  );

  invalidate("opportunities", "activities", "analytics");
  return opportunity;
}

/**
 * Writes `patch` over the deal.
 *
 * - Only the keys `editableSchema` names can change: name, contactId,
 *   pipelineId, value, currency, source, ownerId, tagIds, customFields,
 *   expectedCloseAt and lostReason. What is saved is the parsed patch, never
 *   the patch itself, so id, position, status, closedAt, stageEnteredAt,
 *   createdAt, createdBy, updatedAt and any key the API does not know are
 *   ignored, and a client that sends the whole record back still saves.
 *   move() owns stage changes inside a pipeline. Outside a pipeline move,
 *   setStatus() owns the status, the close date and the won/lost activity.
 * - A pipelineId that differs from the stored one moves the deal to that
 *   pipeline, and must come with a stageId from it. The deal is written once:
 *   the new pipelineId and stageId, position at the end of that stage's
 *   column, stageEnteredAt now, and the status and close date the target
 *   stage gives, the way move() does (`enterStage`): a won or lost stage sets
 *   status won or lost with closedAt now, an open stage sets status open and
 *   removes closedAt. A lost stage keeps a lostReason sent in the same patch;
 *   an open or won stage removes any lost reason. The contact's timeline gets
 *   exactly one matching entry
 *   (`stageEntryActivity`): `opportunity.won` "Won <deal>",
 *   `opportunity.lost` or `opportunity.stage_changed` "Moved <deal> to
 *   <stage>" (a lost entry adds " - <reason>" when the patch keeps a
 *   lostReason). A stageId with no pipelineId, or with the deal's own, is
 *   ignored.
 * - Errors, in this order, and nothing is written on any: 404 `NOT_FOUND`
 *   for an unknown id, then 422 `INVALID_OPPORTUNITY` for a wrong-typed
 *   value, "<label>: <rule>" with `field` the dotted path (see `parse`). A
 *   patch that is not an object is "Deal: Not a valid value." with no field;
 *   an expected close that is not one instant keeps P7-T35's message. On a
 *   pipeline change, then 422 `INVALID_OPPORTUNITY` "Pipeline: No pipeline
 *   has this id." (`field` pipelineId) for an unknown pipeline, and "Stage:
 *   Pick a stage from the new pipeline." (`field` stageId) for a stageId
 *   that is missing or not in that pipeline. All run before `nowIso()`, so a
 *   refused patch does not move the demo clock.
 * - `undefined` on any other key is ignored, the same as a missing key, so
 *   it never erases a stored value. On expectedCloseAt, ownerId or
 *   lostReason, `undefined` (the deal form's empty field) or `null` (a JSON
 *   client's) removes the field: the key is deleted, never stored.
 * - The lost reason is not checked against the status: clearing it on a lost
 *   deal is allowed, as the deal form already saves a loss with no reason.
 *   Changing it without a move is one write with no timeline entry (the
 *   deal form saves an edited reason this way).
 */
export async function update(
  id: ID,
  patch: OpportunityPatch,
): Promise<Opportunity> {
  let moved = false;
  const opportunity = await simulate(() => {
    const state = db.getState();
    const prev = state.opportunities[id] ?? notFound("Opportunity", id);
    const { stageId, ...fields } = parse(updateSchema, patch);
    // Compared with the stored pipeline, not just present: a client that
    // sends the whole record back resends the deal's own pipelineId.
    const targetPipelineId =
      fields.pipelineId !== prev.pipelineId ? fields.pipelineId : undefined;

    const stage =
      targetPipelineId === undefined
        ? undefined
        : stageOf(
            state,
            targetPipelineId,
            stageId,
            "Stage: Pick a stage from the new pipeline.",
          );

    const at = nowIso();
    const next = applyPatch({ ...prev, updatedAt: at }, fields, patch);
    if (stage) {
      next.stageId = stage.id;
      next.position = Object.values(state.opportunities).filter(
        (o) => o.stageId === stage.id,
      ).length;
      next.stageEnteredAt = at;
      enterStage(next, stage, at);
    }
    db.setState((s) => ({ opportunities: { ...s.opportunities, [id]: next } }));

    if (stage) {
      moved = true;
      pushActivity(stageEntryActivity(next, stage, at, state.currentUserId));
    }
    return next;
  });
  if (moved) invalidate("opportunities", "activities", "analytics");
  else invalidate("opportunities", "analytics");
  return opportunity;
}

/**
 * The status a deal takes on entering this stage: "won" for an isWon stage,
 * "lost" for an isLost one, otherwise "open". create(), move() and update()'s
 * pipeline move use it, and the deal form uses it to predict what a move
 * leaves.
 */
export function stageStatus(
  stage: PipelineStage | undefined,
): Opportunity["status"] {
  return stage?.isWon ? "won" : stage?.isLost ? "lost" : "open";
}

/**
 * Sets the status, close date and lost reason a deal takes on entering
 * `stage`: a won or lost stage closes it at `at`, an open one deletes the
 * close date. Any stage but a lost one deletes the lost reason, as
 * setStatus() does, so a lost deal moved to an open or won stage keeps no
 * stale reason; a lost stage keeps the reason the deal holds (one the caller
 * just wrote, such as update()'s or create()'s `lostReason`). Keys are
 * removed, never stored as `undefined`.
 */
function enterStage(
  next: Opportunity,
  stage: PipelineStage | undefined,
  at: ISODate,
): void {
  next.status = stageStatus(stage);
  if (next.status === "open") delete next.closedAt;
  else next.closedAt = at;
  if (next.status !== "lost") delete next.lostReason;
}

/**
 * The timeline entry for a deal entering `stage`, shared by move(),
 * update()'s pipeline move and create() (won or lost stages only) so they
 * cannot drift: "Won <deal>" for a won stage, otherwise "Moved <deal> to
 * <stage>", typed won, lost or stage_changed by the stage. A lost stage
 * appends the lost reason the deal carries after `enterStage`, the way
 * setStatus() writes "Lost <deal> - <reason>": "Moved <deal> to <stage> -
 * <reason>"; with no reason the text is unchanged.
 */
function stageEntryActivity(
  deal: Opportunity,
  stage: PipelineStage | undefined,
  at: ISODate,
  actorId: Activity["actorId"],
): Omit<Activity, "id"> {
  const status = stageStatus(stage);
  return {
    type:
      status === "won"
        ? "opportunity.won"
        : status === "lost"
          ? "opportunity.lost"
          : "opportunity.stage_changed",
    at,
    contactId: deal.contactId,
    opportunityId: deal.id,
    actorId,
    summary:
      status === "won"
        ? `Won "${deal.name}"`
        : `Moved "${deal.name}" to ${stage?.name ?? "a new stage"}${
            status === "lost" && deal.lostReason ? ` - ${deal.lostReason}` : ""
          }`,
    meta: { to: stage?.name },
  };
}

/**
 * Commits a board drag. The optimistic reorder already happened locally, so
 * this rewrites the positions of both affected columns.
 *
 * - Into another stage: records the move on the contact's timeline
 *   (`stageEntryActivity`), and the status, close date and lost reason follow
 *   the target stage (`enterStage`): an open or won stage removes the lost
 *   reason.
 * - Within the deal's own stage (a reorder): only positions and updatedAt
 *   change. The status, closedAt and lostReason are kept and no timeline
 *   entry is written, so a lost or won deal in an open stage stays closed.
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
      updatedAt: at,
    };
    // A same-stage move is a pure reorder: the stage did not change, so
    // neither do the status, close date or lost reason (P7-T64). Seeded lost
    // and won deals sit in open stages and would otherwise reopen here.
    if (changedStage) enterStage(next, stage, at);

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
      pushActivity(stageEntryActivity(next, stage, at, state.currentUserId));
    }

    return next;
  });

  invalidate("opportunities", "activities", "analytics");
  return opportunity;
}

/**
 * setStatus()'s write: the status, plus the close date and lost reason that
 * go with it. Not the public update(), which ignores status and closedAt. A
 * close date or reason given as `undefined` is deleted, never stored as an
 * `undefined` key.
 */
async function writeStatus(
  id: ID,
  fields: {
    status: Opportunity["status"];
    closedAt: ISODate | undefined;
    lostReason: string | undefined;
  },
): Promise<Opportunity> {
  const opportunity = await simulate(() => {
    const prev = db.getState().opportunities[id] ?? notFound("Opportunity", id);
    const next: Opportunity = {
      ...prev,
      status: fields.status,
      updatedAt: nowIso(),
    };
    if (fields.closedAt === undefined) delete next.closedAt;
    else next.closedAt = fields.closedAt;
    if (fields.lostReason === undefined) delete next.lostReason;
    else next.lostReason = fields.lostReason;
    db.setState((s) => ({ opportunities: { ...s.opportunities, [id]: next } }));
    return next;
  });
  invalidate("opportunities", "analytics");
  return opportunity;
}

export async function setStatus(
  id: ID,
  status: Opportunity["status"],
  lostReason?: string,
): Promise<Opportunity> {
  const at = nowIso();
  const opportunity = await writeStatus(id, {
    status,
    lostReason: status === "lost" ? lostReason : undefined,
    closedAt: status === "open" ? undefined : at,
  });

  // Reopening is not a loss: it gets the neutral type, so the feed and the
  // timeline never say "Lost" about a deal that was just revived.
  const outcome = {
    won: { type: "opportunity.won", summary: "Won" },
    lost: { type: "opportunity.lost", summary: "Lost" },
    abandoned: { type: "opportunity.lost", summary: "Abandoned" },
    open: { type: "opportunity.stage_changed", summary: "Reopened" },
  } as const satisfies Record<
    Opportunity["status"],
    { type: Activity["type"]; summary: string }
  >;
  const { type, summary } = outcome[status];
  pushActivity({
    type,
    at,
    contactId: opportunity.contactId,
    opportunityId: opportunity.id,
    actorId: db.getState().currentUserId,
    summary: `${summary} "${opportunity.name}"${
      status === "lost" && lostReason ? ` - ${lostReason}` : ""
    }`,
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

/**
 * Lost and abandoned deals are dead: they stay visible for the record but are
 * never counted as pipeline. Lives here rather than in the board because the
 * board's rollups and the dashboard's must agree on what "live" means.
 */
export function isDeadDeal(deal: Opportunity): boolean {
  return deal.status === "lost" || deal.status === "abandoned";
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
