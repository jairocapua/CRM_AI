import type {
  Activity,
  Appointment,
  Calendar,
  Contact,
  Conversation,
  CustomField,
  ID,
  ISODate,
  Location,
  Message,
  MessageTemplate,
  Note,
  Opportunity,
  Pipeline,
  SmartList,
  Snippet,
  Tag,
  Task,
  User,
  Workflow,
} from "@/types";

/**
 * Bump whenever the shape of seeded data changes. `persist` compares this to
 * the stored version and reseeds rather than migrating — fixtures are demo
 * data, so a clean reseed is always preferable to a half-migrated store.
 */
export const SEED_VERSION = 2;

/** Collections are keyed by id so lookups and updates stay O(1). */
export type Table<T> = Record<ID, T>;

export interface DbState {
  seededAt?: ISODate;
  locationId: ID;
  currentUserId: ID;

  locations: Table<Location>;
  users: Table<User>;
  tags: Table<Tag>;
  customFields: Table<CustomField>;
  templates: Table<MessageTemplate>;
  snippets: Table<Snippet>;

  contacts: Table<Contact>;
  notes: Table<Note>;
  tasks: Table<Task>;
  smartLists: Table<SmartList>;

  conversations: Table<Conversation>;
  messages: Table<Message>;

  pipelines: Table<Pipeline>;
  opportunities: Table<Opportunity>;

  calendars: Table<Calendar>;
  appointments: Table<Appointment>;

  workflows: Table<Workflow>;
  activities: Table<Activity>;
}

export const EMPTY_DB: DbState = {
  locationId: "",
  currentUserId: "",
  locations: {},
  users: {},
  tags: {},
  customFields: {},
  templates: {},
  snippets: {},
  contacts: {},
  notes: {},
  tasks: {},
  smartLists: {},
  conversations: {},
  messages: {},
  pipelines: {},
  opportunities: {},
  calendars: {},
  appointments: {},
  workflows: {},
  activities: {},
};
