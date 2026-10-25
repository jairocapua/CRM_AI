import type { AutomationDefinition } from "@/types";

import { allSteps } from "./walk";

/**
 * Every stable key a definition names: tag names and user slugs, in walk
 * order (owner, trigger, then steps depth-first), repeats kept.
 * `api.workflows` resolves each one to an id; the integrity report lists the
 * ones that resolve to nothing.
 */
export function referencedKeys(definition: AutomationDefinition): {
  tags: string[];
  users: string[];
} {
  const tags: string[] = [];
  const users: string[] = [definition.owner];

  const trigger = definition.trigger.config;
  if (trigger.kind === "tag_added") tags.push(...trigger.tags);

  for (const step of allSteps(definition.steps)) {
    const c = step.config;
    switch (c.kind) {
      case "add_tag":
      case "remove_tag":
        tags.push(...c.tags);
        break;
      case "assign_user":
      case "internal_notification":
        users.push(...c.users);
        break;
      case "send_email":
        if (c.fromUser) users.push(c.fromUser);
        break;
      case "create_task":
        if (c.assignee) users.push(c.assignee);
        break;
    }
  }
  return { tags, users };
}
