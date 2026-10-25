import type { ID, Workflow, WorkflowStatus } from "@/types";
import { CHANNEL_LABELS } from "@/lib/constants";
import { fullName } from "@/lib/format";

/**
 * Plain-language copy for the automation list (`/automation`): what starts
 * each automation, who owns it, and where it is in its life. Pure functions,
 * so the page only renders.
 */

/** The heading for automations that name no folder. Sorted last. */
export const UNFILED = "Unfiled";

/**
 * Status as lifecycle state. Automations are code that a developer writes and
 * ships; nobody on staff can publish or pause one, so the copy says where the
 * automation stands, never what a missing switch would do.
 */
export const STATUS_COPY: Readonly<
  Record<WorkflowStatus, { label: string; description: string }>
> = {
  published: {
    label: "Live",
    description: "Running now for every contact it applies to.",
  },
  draft: {
    label: "In development",
    description: "A developer is still building this; it does not run yet.",
  },
  paused: {
    label: "Paused by the developer",
    description: "Switched off in code for now; it does not run.",
  },
};

/**
 * One sentence for what starts the automation: "When a form is submitted:
 * Free Website Audit". Tag triggers name their tags through `tagNames`; an
 * id it cannot name is left out rather than printed.
 */
export function triggerSummary(
  workflow: Pick<Workflow, "nodes">,
  tagNames: ReadonlyMap<ID, string>,
): string {
  const trigger = workflow.nodes.find((node) => node.category === "trigger");
  if (!trigger) return "No trigger set";

  const config = trigger.config;
  switch (config.kind) {
    case "form_submitted":
      return config.formName
        ? `When a form is submitted: ${config.formName}`
        : "When any form is submitted";
    case "tag_added": {
      const names = config.tagIds.flatMap((id) => {
        const name = tagNames.get(id);
        return name ? [name] : [];
      });
      return names.length > 0
        ? `When the tag ${names.join(" or ")} is added`
        : "When a tag is added";
    }
    case "appointment_booked": {
      const count = config.calendarIds.length;
      if (count === 0) return "When an appointment is booked";
      return `When an appointment is booked on ${count} ${
        count === 1 ? "calendar" : "calendars"
      }`;
    }
    case "opportunity_stage_changed":
      return "When a deal moves to another stage";
    case "contact_created":
      return "When a contact is created";
    case "inbound_message": {
      if (config.channels.length === 0) return "When a contact sends a message";
      const labels = config.channels.map(
        (channel) =>
          CHANNEL_LABELS[channel as keyof typeof CHANNEL_LABELS] ?? channel,
      );
      return `When a contact sends a message by ${labels.join(" or ")}`;
    }
    case "birthday":
      return "On the contact's birthday";
    case "manual":
      return "When someone on the team starts it";
    default:
      // A trigger-category node always carries a trigger config; this keeps
      // the sentence readable if a new kind lands before its copy does.
      return trigger.label;
  }
}

/** The owner's full name; never an id, even one that resolves to nobody. */
export function ownerName(
  ownerId: ID | undefined,
  usersById: ReadonlyMap<ID, { firstName: string; lastName: string }>,
): string {
  if (ownerId === undefined) return "No owner";
  const user = usersById.get(ownerId);
  return user ? fullName(user) : "Unknown owner";
}

export interface FolderGroup<T> {
  folder: string;
  workflows: T[];
}

/**
 * Automations grouped by folder: folders A to Z with `UNFILED` last, names A
 * to Z inside each. A blank folder counts as none. The input is not reordered.
 */
export function groupByFolder<T extends { name: string; folder?: string }>(
  workflows: readonly T[],
): FolderGroup<T>[] {
  const byFolder = new Map<string, T[]>();
  const unfiled: T[] = [];
  for (const workflow of workflows) {
    const folder = workflow.folder?.trim();
    if (!folder) {
      unfiled.push(workflow);
      continue;
    }
    const group = byFolder.get(folder);
    if (group) group.push(workflow);
    else byFolder.set(folder, [workflow]);
  }

  const byName = (a: T, b: T) => a.name.localeCompare(b.name);
  const groups = [...byFolder]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([folder, items]) => ({ folder, workflows: items.sort(byName) }));
  if (unfiled.length > 0) {
    groups.push({ folder: UNFILED, workflows: unfiled.sort(byName) });
  }
  return groups;
}
