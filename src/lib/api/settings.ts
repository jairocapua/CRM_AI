import type { ID, Location } from "@/types";
import { db } from "@/lib/mock/db";
import { resumeDeliveries } from "@/lib/mock/delivery";
import { seedDatabase, clearDatabase } from "@/lib/mock/seed";
import { invalidate, invalidateAll } from "./cache";
import { deliveryOptions } from "./delivery";
import {
  getTuning,
  notFound,
  nowIso,
  setTuning,
  simulate,
  type Tuning,
} from "./http";

/**
 * Brings the datastore up before any screen reads it: rehydrate from storage,
 * then seed on first run. Lives behind the seam so no component ever needs to
 * know that persistence is localStorage — against a real backend this becomes
 * a session/bootstrap request and DbGate does not change.
 */
export async function bootstrap(): Promise<void> {
  await db.persist.rehydrate();
  if (!db.getState().seededAt) seedDatabase();
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

export async function updateLocation(
  id: ID,
  patch: Partial<Location>,
): Promise<Location> {
  const location = await simulate(() => {
    const prev = db.getState().locations[id] ?? notFound("Location", id);
    const next: Location = {
      ...prev,
      ...patch,
      id,
      updatedAt: nowIso(),
    };
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
        workflows: Object.keys(state.workflows).length,
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
      missing(
        "workflow edges reference a missing node",
        Object.values(s.workflows).filter((w) => {
          const ids = new Set(w.nodes.map((n) => n.id));
          return w.edges.some((e) => !ids.has(e.source) || !ids.has(e.target));
        }).length,
      );

      return problems;
    },
    { canFail: false, ms: 150 },
  );
}
