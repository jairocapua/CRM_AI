import type {
  Activity,
  Appointment,
  AutomationRequest,
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
  WorkflowRun,
} from "@/types";

/**
 * Bump whenever the shape of seeded data changes. `persist` compares this to
 * the stored version and reseeds rather than migrating — fixtures are demo
 * data, so a clean reseed is always preferable to a half-migrated store.
 */
export const SEED_VERSION = 7;

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

  activities: Table<Activity>;

  /**
   * Automation run history. The automations themselves are code
   * (`src/lib/automations/`); each run names one by `Workflow.id`.
   */
  workflowRuns: Table<WorkflowRun>;

  /**
   * Staff asking the developer for an automation. A shipped one names the
   * automation by `Workflow.id`.
   */
  automationRequests: Table<AutomationRequest>;
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
  activities: {},
  workflowRuns: {},
  automationRequests: {},
};
