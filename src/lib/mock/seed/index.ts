import type { ID } from "@/types";
import { db } from "../db";
import { EMPTY_DB, type DbState, type Table } from "../db-state";
import { REF_DATE, resetRng } from "./rng";
import {
  seedCustomFields,
  seedLocations,
  seedSnippets,
  seedTags,
  seedTemplates,
  seedUsers,
} from "./core";
import { seedContacts } from "./contacts";
import { seedOpportunities, seedPipelines } from "./pipelines";
import { seedConversations } from "./conversations";
import { seedAppointments, seedCalendars } from "./calendars";
import { seedWorkflows } from "./workflows";
import {
  seedActivities,
  seedNotes,
  seedSmartLists,
  seedTasks,
} from "./engagement";

function table<T extends { id: ID }>(rows: T[]): Table<T> {
  const out: Table<T> = {};
  for (const row of rows) out[row.id] = row;
  return out;
}

export const SEED_VOLUME = {
  contacts: 240,
  conversations: 90,
  appointments: 120,
  tasks: 60,
  notes: 70,
} as const;

/**
 * Builds the whole demo workspace.
 *
 * Call order is load-bearing: faker is seeded once and consumed sequentially,
 * so reordering these calls shifts every downstream value. Add new seeders at
 * the end rather than in the middle.
 */
export function buildDb(): DbState {
  resetRng();

  const locations = seedLocations();
  const users = seedUsers();
  const tags = seedTags();
  const customFields = seedCustomFields();
  const templates = seedTemplates();
  const snippets = seedSnippets();

  const contacts = seedContacts(
    SEED_VOLUME.contacts,
    tags,
    users,
    customFields,
  );

  const pipelines = seedPipelines();
  const opportunities = seedOpportunities(
    pipelines,
    contacts,
    users,
    tags.map((t) => t.id),
  );

  const { conversations, messages } = seedConversations(
    contacts,
    users,
    SEED_VOLUME.conversations,
  );

  const calendars = seedCalendars(users);
  const appointments = seedAppointments(
    calendars,
    contacts,
    users,
    SEED_VOLUME.appointments,
  );

  const workflows = seedWorkflows(
    tags,
    users.map((u) => u.id),
  );

  const tasks = seedTasks(contacts, opportunities, users, SEED_VOLUME.tasks);
  const notes = seedNotes(contacts, users, SEED_VOLUME.notes);
  const smartLists = seedSmartLists(users);

  const activities = seedActivities({
    contacts,
    opportunities,
    pipelines,
    conversations,
    messages,
    appointments,
    tasks,
    notes,
  });

  return {
    seededAt: REF_DATE.toISOString(),
    locationId: locations[0]!.id,
    currentUserId: users[0]!.id,
    locations: table(locations),
    users: table(users),
    tags: table(tags),
    customFields: table(customFields),
    templates: table(templates),
    snippets: table(snippets),
    contacts: table(contacts),
    notes: table(notes),
    tasks: table(tasks),
    smartLists: table(smartLists),
    conversations: table(conversations),
    messages: table(messages),
    pipelines: table(pipelines),
    opportunities: table(opportunities),
    calendars: table(calendars),
    appointments: table(appointments),
    workflows: table(workflows),
    activities: table(activities),
  };
}

/** Replaces the store wholesale. Used on first run and by Settings → Demo Data. */
export function seedDatabase(): DbState {
  const next = buildDb();
  db.setState(next, true);
  return next;
}

export function clearDatabase() {
  db.setState({ ...EMPTY_DB }, true);
}
