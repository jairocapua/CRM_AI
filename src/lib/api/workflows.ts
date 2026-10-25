import type {
  AutomationDefinition,
  ID,
  Workflow,
  WorkflowNode,
  WorkflowNodeConfig,
} from "@/types";
import { AUTOMATIONS, LAYOUTS } from "@/lib/automations";
import type { LayoutConfig } from "@/lib/automations/layout";
import { db } from "@/lib/mock/db";
import { notFound, nowIso, simulate } from "./http";

/**
 * Automations are developer-written code (`src/lib/automations/`), so this
 * module only reads. It still sits behind the seam: against a real backend
 * these become `fetch()` calls and no component changes.
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
    // Real counts arrive with run history (P8-T06); never faked here.
    stats: { enrolled: 0, active: 0, completed: 0 },
    createdAt: lookup.at,
    updatedAt: lookup.at,
  };
}
