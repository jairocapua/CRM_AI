import type {
  AutomationDefinition,
  ID,
  Workflow,
  WorkflowNode,
  WorkflowNodeConfig,
  WorkflowRun,
} from "@/types";
import { AUTOMATIONS, LAYOUTS } from "@/lib/automations";
import type { LayoutConfig } from "@/lib/automations/layout";
import { fullName } from "@/lib/format";
import { db } from "@/lib/mock/db";
import {
  applyQuery,
  notFound,
  nowIso,
  simulate,
  type ListQuery,
  type Page,
} from "./http";

/**
 * Automations are developer-written code (`src/lib/automations/`), so this
 * module only reads. It still sits behind the seam: against a real backend
 * these become `fetch()` calls and no component changes. Their run history
 * is seeded data in the store (`workflowRuns`), read here too.
 */

export async function list(): Promise<Workflow[]> {
  return simulate(
    () => {
      const lookup = lookups();
      return Object.keys(AUTOMATIONS)
        .map((slug) => resolve(slug, lookup))
        .sort(
          (a, b) =>
            (a.folder ?? "").localeCompare(b.folder ?? "") ||
            a.name.localeCompare(b.name),
        );
    },
    { canFail: false },
  );
}

export async function get(id: ID): Promise<Workflow> {
  return simulate(
    () => {
      const slug =
        Object.keys(AUTOMATIONS).find((key) => AUTOMATIONS[key]!.id === id) ??
        notFound("Workflow", id);
      return resolve(slug, lookups());
    },
    { canFail: false },
  );
}

/**
 * A run as the run history lists it: the stored run plus its contact's name,
 * joined at read time so a renamed contact reads with the new name and the
 * store never holds a copy. `contactName` is unset when the contact is gone;
 * the UI then shows plain text, never the id.
 */
export interface WorkflowRunRow extends WorkflowRun {
  contactName?: string;
}

/**
 * One automation's run history, newest first by default. `workflowId` is
 * `Workflow.id`; an id the registry does not have is a 404, as in `get()`,
 * so a typo never reads as "no runs yet". Contacts are looked up by key for
 * the page's rows only, so this reads no whole table but the runs.
 */
export async function listRuns(
  workflowId: ID,
  query: ListQuery = {},
): Promise<Page<WorkflowRunRow>> {
  return simulate(
    () => {
      if (!Object.values(AUTOMATIONS).some((d) => d.id === workflowId)) {
        notFound("Workflow", workflowId);
      }
      const { workflowRuns, contacts } = db.getState();
      const runs = Object.values(workflowRuns).filter(
        (run) => run.workflowId === workflowId,
      );
      const page = applyQuery(runs, query, {
        defaultSort: [{ field: "startedAt", desc: true }],
      });
      return {
        ...page,
        rows: page.rows.map((run): WorkflowRunRow => {
          const contact = contacts[run.contactId];
          return contact ? { ...run, contactName: fullName(contact) } : run;
        }),
      };
    },
    { canFail: false },
  );
}

// ---------------------------------------------------------------------------
// Resolution: stable keys -> ids on the registry's laid-out nodes.
// ---------------------------------------------------------------------------

interface Lookups {
  tagIds: (names: readonly string[]) => ID[];
  userIds: (slugs: readonly string[]) => ID[];
  userId: (slug: string | undefined) => ID | undefined;
  /** When the world was seeded: the closest thing code has to a timestamp. */
  at: string;
}

/**
 * Tag names and user slugs, mapped to the current world's ids. A key that
 * matches nothing is dropped rather than turned into a made-up id; the
 * integrity report lists it.
 */
function lookups(): Lookups {
  const { tags, users, seededAt } = db.getState();
  const tagIdByName = new Map(Object.values(tags).map((t) => [t.name, t.id]));
  const userIdBySlug = new Map(Object.values(users).map((u) => [u.slug, u.id]));
  const userId = (slug: string | undefined) =>
    slug === undefined ? undefined : userIdBySlug.get(slug);
  return {
    tagIds: (names) =>
      names.flatMap((name) => {
        const id = tagIdByName.get(name);
        return id ? [id] : [];
      }),
    userIds: (slugs) =>
      slugs.flatMap((slug) => {
        const id = userId(slug);
        return id ? [id] : [];
      }),
    userId,
    at: seededAt ?? nowIso(),
  };
}

/** A laid-out node's config with its tag and user keys resolved to ids. */
function nodeConfig(c: LayoutConfig, lookup: Lookups): WorkflowNodeConfig {
  switch (c.kind) {
    case "tag_added":
    case "add_tag":
    case "remove_tag":
      return { kind: c.kind, tagIds: lookup.tagIds(c.tags) };
    case "assign_user":
      return {
        kind: "assign_user",
        strategy: c.strategy,
        userIds: lookup.userIds(c.users),
      };
    case "internal_notification":
      return {
        kind: "internal_notification",
        userIds: lookup.userIds(c.users),
        body: c.body,
      };
    case "send_email": {
      const { fromUser, ...rest } = c;
      const fromUserId = lookup.userId(fromUser);
      return fromUserId ? { ...rest, fromUserId } : { ...rest };
    }
    case "create_task": {
      const { assignee, ...rest } = c;
      const assigneeId = lookup.userId(assignee);
      return assigneeId ? { ...rest, assigneeId } : { ...rest };
    }
    default:
      return structuredClone(c);
  }
}

/**
 * The registry's automation `slug` as a `Workflow`. Geometry (positions,
 * sizes, the emitted `end` nodes) comes from `LAYOUTS`, laid out once at
 * import; this copies it out of the frozen registry and resolves the keys.
 */
function resolve(slug: string, lookup: Lookups): Workflow {
  const definition: AutomationDefinition = AUTOMATIONS[slug]!;
  const { nodes: laidOut, edges: laidOutEdges } = LAYOUTS[slug]!;
  const nodes = laidOut.map((n): WorkflowNode => ({
    ...n,
    position: { ...n.position },
    config: nodeConfig(n.config, lookup),
  }));
  const edges = laidOutEdges.map((e) => ({ ...e }));
  const ownerId = lookup.userId(definition.owner);
  return {
    id: definition.id,
    slug,
    name: definition.name,
    description: definition.description,
    folder: definition.folder,
    status: definition.status,
    ...(ownerId ? { ownerId } : {}),
    nodes,
    edges,
    settings: { ...definition.settings },
    createdAt: lookup.at,
    updatedAt: lookup.at,
  };
}
