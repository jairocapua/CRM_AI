import type { ID, Location } from "@/types";
import { AUTOMATIONS, LAYOUTS } from "@/lib/automations";
import {
  definitionProblems,
  layoutProblems,
} from "@/lib/automations/integrity";
import { referencedKeys } from "@/lib/automations/keys";
import { clearDatabase, db } from "@/lib/mock/db";
import { resumeDeliveries } from "@/lib/mock/delivery";
import { businessSchema } from "@/lib/validation/business";
import { invalidate, invalidateAll } from "./cache";
import { deliveryOptions } from "./delivery";
import { parsePatch, withoutEmpty, withoutUndefined } from "./patch";
import {
  ApiError,
  getTuning,
  notFound,
  nowIso,
  setTuning,
  simulate,
  type Tuning,
} from "./http";

/**
 * The seed builder and faker with it (several hundred KiB) are their own
 * chunk, fetched only on a boot that finds no seeded workspace (first run,
 * or the first load after a clear) and on reseed. A seeded reload never
 * downloads them.
 */
function loadSeed() {
  return import("@/lib/mock/seed");
}

/** The sentence a reseed shows when the seed chunk cannot be fetched. */
export const SEED_UNAVAILABLE_MESSAGE =
  "Could not load the demo data. Check your connection and try again.";

/**
 * Brings the datastore up before any screen reads it: rehydrate from storage,
 * then seed on first run. Lives behind the seam so no component ever needs to
 * know that persistence is localStorage — against a real backend this becomes
 * a session/bootstrap request and DbGate does not change.
 */
export async function bootstrap(): Promise<void> {
  await db.persist.rehydrate();
  if (!db.getState().seededAt) (await loadSeed()).seedDatabase();
  // Messages a refresh caught mid-delivery pick up where they left off.
  resumeDeliveries(deliveryOptions);
  invalidateAll();
}

export async function listLocations(): Promise<Location[]> {
  return simulate(
    () =>
      Object.values(db.getState().locations).sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    { canFail: false },
  );
}

export async function activeLocation(): Promise<Location> {
  return simulate(
    () => {
      const { locations, locationId } = db.getState();
      return locations[locationId] ?? notFound("Location", locationId);
    },
    { canFail: false },
  );
}

export async function switchLocation(id: ID): Promise<void> {
  await simulate(() => db.setState({ locationId: id }), { ms: 260 });
  invalidateAll();
}

/** The keys `updateLocation()` saves: any of them may be sent alone. */
const locationPatchSchema = businessSchema.partial();

/**
 * Applies `patch` to a location and returns the saved record.
 *
 * - Only the keys the business form edits can change (`businessSchema`:
 *   name, email, phone, website, industry, time zone). Every other key is
 *   ignored: `id`, the timestamps, the address and logo (no form edits them
 *   yet), and the currency, which would change what every stored amount
 *   means.
 * - Each must pass the form's own rules, so the API is never looser than the
 *   form: otherwise the call is a 422 `INVALID_LOCATION` whose `message` is
 *   the form's sentence for the first bad field ("Enter the business name.")
 *   and whose `field` is that key, and nothing is saved.
 * - Values are saved trimmed; an emptied email, phone, website or industry
 *   removes the stored value; an `undefined` value is ignored.
 * - An unknown id is a 404.
 */
export async function updateLocation(
  id: ID,
  patch: Partial<Location>,
): Promise<Location> {
  const location = await simulate(() => {
    const prev = db.getState().locations[id] ?? notFound("Location", id);
    const details = parsePatch(
      locationPatchSchema,
      patch,
      "INVALID_LOCATION",
      "Those business details are not valid.",
    );
    const next: Location = withoutEmpty(
      {
        ...prev,
        ...withoutUndefined(details),
        id,
        updatedAt: nowIso(),
      },
      ["email", "phone", "website", "industry"],
    );
    db.setState((s) => ({ locations: { ...s.locations, [id]: next } }));
    return next;
  });
  invalidate("settings");
  return location;
}

export interface DbStats {
  seededAt?: string;
  counts: Record<string, number>;
  /** Approximate serialised size of the store, in bytes. */
  approxBytes: number;
}

/** Powers the Demo Data page, which doubles as the Phase 2 test harness. */
export async function stats(): Promise<DbStats> {
  return simulate(
    () => {
      const state = db.getState();
      const counts: Record<string, number> = {
        locations: Object.keys(state.locations).length,
        users: Object.keys(state.users).length,
        tags: Object.keys(state.tags).length,
        customFields: Object.keys(state.customFields).length,
        templates: Object.keys(state.templates).length,
        snippets: Object.keys(state.snippets).length,
        contacts: Object.keys(state.contacts).length,
        notes: Object.keys(state.notes).length,
        tasks: Object.keys(state.tasks).length,
        smartLists: Object.keys(state.smartLists).length,
        conversations: Object.keys(state.conversations).length,
        messages: Object.keys(state.messages).length,
        pipelines: Object.keys(state.pipelines).length,
        opportunities: Object.keys(state.opportunities).length,
        calendars: Object.keys(state.calendars).length,
        appointments: Object.keys(state.appointments).length,
        // A code constant, not a table: doubles as a check the registry loaded.
        automations: Object.keys(AUTOMATIONS).length,
        automationRuns: Object.keys(state.workflowRuns).length,
        automationRequests: Object.keys(state.automationRequests).length,
        activities: Object.keys(state.activities).length,
      };

      let approxBytes = 0;
      try {
        approxBytes = new Blob([JSON.stringify(state)]).size;
      } catch {
        approxBytes = 0;
      }

      return { seededAt: state.seededAt, counts, approxBytes };
    },
    { canFail: false, ms: 120 },
  );
}

export async function reseed(): Promise<void> {
  // Offline, or a tab left open across a deploy (the old chunk is gone): a
  // refusal the page can show, with nothing written.
  const { seedDatabase } = await loadSeed().catch(() => {
    throw new ApiError(SEED_UNAVAILABLE_MESSAGE, 503, "SEED_UNAVAILABLE");
  });
  await simulate(() => seedDatabase(), { ms: 600, canFail: false });
  invalidateAll();
}

export async function clear(): Promise<void> {
  await simulate(() => clearDatabase(), { ms: 300, canFail: false });
  invalidateAll();
}

export function tuning(): Tuning {
  return getTuning();
}

export function setLatency(latencyMs: number) {
  setTuning({ latencyMs });
}

export function setFailureRate(failureRate: number) {
  setTuning({ failureRate });
}

/**
 * Referential-integrity check over the seeded world. Surfaced on the Demo Data
 * page so a broken fixture shows up as a red line rather than as a confusing
 * blank row three screens away.
 */
export async function integrityReport(): Promise<string[]> {
  return simulate(
    () => {
      const s = db.getState();
      const problems: string[] = [];

      const missing = (label: string, count: number) => {
        if (count > 0) problems.push(`${count} ${label}`);
      };

      missing(
        "opportunities point at a missing contact",
        Object.values(s.opportunities).filter((o) => !s.contacts[o.contactId])
          .length,
      );
      missing(
        "opportunities point at a missing pipeline",
        Object.values(s.opportunities).filter((o) => !s.pipelines[o.pipelineId])
          .length,
      );
      missing(
        "opportunities sit in a stage that does not exist",
        Object.values(s.opportunities).filter((o) => {
          const pipeline = s.pipelines[o.pipelineId];
          return !pipeline?.stages.some((stage) => stage.id === o.stageId);
        }).length,
      );
      missing(
        "conversations point at a missing contact",
        Object.values(s.conversations).filter((c) => !s.contacts[c.contactId])
          .length,
      );
      missing(
        "conversations reference a missing message",
        Object.values(s.conversations).filter((c) =>
          c.messageIds.some((id) => !s.messages[id]),
        ).length,
      );
      missing(
        "conversations disagree with their newest message",
        Object.values(s.conversations).filter((c) => {
          const lastId = c.messageIds[c.messageIds.length - 1];
          const last = lastId ? s.messages[lastId] : undefined;
          return last ? last.sentAt !== c.lastMessageAt : false;
        }).length,
      );
      missing(
        "appointments point at a missing calendar",
        Object.values(s.appointments).filter((a) => !s.calendars[a.calendarId])
          .length,
      );
      missing(
        "appointments point at a missing contact",
        Object.values(s.appointments).filter((a) => !s.contacts[a.contactId])
          .length,
      );
      missing(
        "activities point at a missing contact",
        Object.values(s.activities).filter(
          (a) => a.contactId && !s.contacts[a.contactId],
        ).length,
      );
      // The rest of what hangs off a contact. These are the invariants
      // @/lib/mock/cascade maintains on delete — checked here so a gap in the
      // cascade shows up as a red line instead of a blank row somewhere.
      missing(
        "notes point at a missing contact",
        Object.values(s.notes).filter((n) => !s.contacts[n.contactId]).length,
      );
      missing(
        "tasks point at a missing contact",
        Object.values(s.tasks).filter(
          (t) => t.contactId && !s.contacts[t.contactId],
        ).length,
      );
      missing(
        "tasks point at a missing opportunity",
        Object.values(s.tasks).filter(
          (t) => t.opportunityId && !s.opportunities[t.opportunityId],
        ).length,
      );
      missing(
        "activities point at a missing opportunity",
        Object.values(s.activities).filter(
          (a) => a.opportunityId && !s.opportunities[a.opportunityId],
        ).length,
      );

      // Every person a record hands work to, as `users.remove()` reassigns
      // them (`reassignUserReferences` in @/lib/mock/cascade). Users are
      // looked up by key, never listed. History is not checked: `createdBy`,
      // notes' and messages' `authorId` and activities' `actorId` keep a
      // teammate who is gone, and the pages show them as unknown.
      const gone = (userId: ID | undefined) =>
        userId !== undefined && !s.users[userId];
      const contacts = Object.values(s.contacts);
      missing(
        "contacts are owned by a missing user",
        contacts.filter((c) => gone(c.ownerId)).length,
      );
      missing(
        "contacts are followed by a missing user",
        contacts.filter((c) => c.followers.some(gone)).length,
      );
      missing(
        "opportunities are owned by a missing user",
        Object.values(s.opportunities).filter((o) => gone(o.ownerId)).length,
      );
      missing(
        "tasks are assigned to a missing user",
        Object.values(s.tasks).filter((t) => gone(t.assigneeId)).length,
      );
      missing(
        "conversations are assigned to a missing user",
        Object.values(s.conversations).filter((c) => gone(c.assigneeId)).length,
      );
      missing(
        "appointments are assigned to a missing user",
        Object.values(s.appointments).filter((a) => gone(a.assignedUserId))
          .length,
      );
      missing(
        "calendars list a missing team member",
        Object.values(s.calendars).filter((c) => c.teamMemberIds.some(gone))
          .length,
      );
      missing(
        "smart lists are owned by a missing user",
        Object.values(s.smartLists).filter((l) => gone(l.ownerId)).length,
      );

      // Tags are looked up by key, never listed: `tags.remove()` and
      // `tags.merge()` sweep them off contacts and deals
      // (`cascadeTagDelete`, `cascadeTagMerge`).
      const tagGone = (tagId: ID) => !s.tags[tagId];
      missing(
        "contacts are tagged with a missing tag",
        contacts.filter((c) => c.tagIds.some(tagGone)).length,
      );
      missing(
        "opportunities are tagged with a missing tag",
        Object.values(s.opportunities).filter((o) => o.tagIds.some(tagGone))
          .length,
      );

      // Custom values are keyed by their field's `key`, per object type, and
      // `customFields.remove()` sweeps them (`cascadeCustomFieldDelete`).
      const fieldKeys = new Set(
        Object.values(s.customFields).map((f) => `${f.objectType}:${f.key}`),
      );
      const undefinedValue = (
        objectType: string,
        values: Record<string, unknown>,
      ) =>
        Object.keys(values).some((k) => !fieldKeys.has(`${objectType}:${k}`));
      missing(
        "contacts hold a value for a missing custom field",
        contacts.filter((c) => undefinedValue("contact", c.customFields))
          .length,
      );
      missing(
        "opportunities hold a value for a missing custom field",
        Object.values(s.opportunities).filter((o) =>
          undefinedValue("opportunity", o.customFields),
        ).length,
      );

      // Run history: each run names a contact (swept by the cascade), an
      // automation by `Workflow.id`, and nodes of that automation's diagram.
      const nodeIdsById = new Map(
        Object.entries(AUTOMATIONS).map(([slug, d]) => [
          d.id,
          new Set(LAYOUTS[slug]!.nodes.map((n) => n.id)),
        ]),
      );
      const runs = Object.values(s.workflowRuns);
      missing(
        "automation runs point at a missing contact",
        runs.filter((r) => !s.contacts[r.contactId]).length,
      );
      missing(
        "automation runs point at a missing automation",
        runs.filter((r) => !nodeIdsById.has(r.workflowId)).length,
      );
      missing(
        "automation runs log a step their automation does not have",
        runs.filter((r) => {
          const nodeIds = nodeIdsById.get(r.workflowId);
          return nodeIds && r.steps.some((step) => !nodeIds.has(step.nodeId));
        }).length,
      );
      // A shipped request names its automation by `Workflow.id`. Who asked
      // (`createdBy`) is not checked, as no other `createdBy` is: the page
      // shows "Unknown teammate" for a user who is gone.
      missing(
        "automation requests point at a missing automation",
        Object.values(s.automationRequests).filter(
          (r) =>
            r.shippedWorkflowId !== undefined &&
            !nodeIdsById.has(r.shippedWorkflowId),
        ).length,
      );

      // Automations are code: their structure and layout can only break in
      // a commit, but their tag and user keys break whenever staff rename or
      // delete one.
      const definitions = Object.values(AUTOMATIONS);
      problems.push(...definitionProblems(definitions));
      problems.push(...layoutProblems(definitions));
      const tagNames = new Set(Object.values(s.tags).map((t) => t.name));
      const userSlugs = new Set(Object.values(s.users).map((u) => u.slug));
      for (const definition of definitions) {
        const { tags, users } = referencedKeys(definition);
        for (const tag of new Set(tags)) {
          if (!tagNames.has(tag)) {
            problems.push(
              `${definition.name} references a missing tag "${tag}"`,
            );
          }
        }
        for (const user of new Set(users)) {
          if (!userSlugs.has(user)) {
            problems.push(
              `${definition.name} references a missing user "${user}"`,
            );
          }
        }
      }

      return problems;
    },
    { canFail: false, ms: 150 },
  );
}
