import { format, parseISO } from "date-fns";

import type { ID, MessageTemplate, Snippet } from "@/types";
import { db } from "@/lib/mock/db";
import { newId } from "@/lib/mock/ids";
import { invalidate } from "./cache";
import { nowIso, simulate } from "./http";

export async function listTemplates(
  channel?: MessageTemplate["channel"],
): Promise<MessageTemplate[]> {
  return simulate(
    () =>
      Object.values(db.getState().templates)
        .filter((t) => !channel || t.channel === channel)
        .sort((a, b) => a.name.localeCompare(b.name)),
    { canFail: false },
  );
}

export async function listSnippets(): Promise<Snippet[]> {
  return simulate(
    () =>
      Object.values(db.getState().snippets).sort((a, b) =>
        a.shortcut.localeCompare(b.shortcut),
      ),
    { canFail: false },
  );
}

export async function createTemplate(
  draft: Omit<MessageTemplate, "id" | "createdAt" | "updatedAt">,
): Promise<MessageTemplate> {
  const template = await simulate(() => {
    const at = nowIso();
    const record: MessageTemplate = {
      ...draft,
      id: newId("tpl"),
      createdAt: at,
      updatedAt: at,
    };
    db.setState((s) => ({
      templates: { ...s.templates, [record.id]: record },
    }));
    return record;
  });
  invalidate("templates");
  return template;
}

export async function removeTemplate(id: ID): Promise<void> {
  await simulate(() => {
    db.setState((s) => {
      const templates = { ...s.templates };
      delete templates[id];
      return { templates };
    });
  });
  invalidate("templates");
}

const MERGE_TOKEN = /\{\{\s*([\w.]+)\s*\}\}/g;

/**
 * Fills {{contact.first_name}}-style merge fields. Unknown tokens are left as
 * written rather than blanked, so a typo shows up instead of silently
 * disappearing from the message.
 */
export function renderMergeFields(
  body: string,
  values: Record<string, string | undefined>,
): string {
  return body.replace(
    MERGE_TOKEN,
    (match, token: string) => values[token] ?? match,
  );
}

/** Merge tokens still present in a text, e.g. `["calendar.link"]`. */
export function findMergeTokens(text: string): string[] {
  return [...new Set([...text.matchAll(MERGE_TOKEN)].map((m) => m[1]!))];
}

function siteUrl(location: { name: string; website?: string }): string {
  if (location.website) return location.website.replace(/\/+$/, "");
  const slug = location.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `https://${slug}.nimbus.site`;
}

/**
 * Renders a template or snippet for one contact, the way a real backend would
 * merge it at send time. Values come from the contact, the signed-in user, the
 * active location, the contact's next confirmed appointment and the user's
 * booking calendar. `unresolved` lists tokens that had no value, so the
 * composer can flag them before anything goes out.
 */
export async function render(
  body: string,
  ctx: { contactId: ID },
): Promise<{ text: string; unresolved: string[] }> {
  return simulate(
    () => {
      const state = db.getState();
      const contact = state.contacts[ctx.contactId];
      const user = state.users[state.currentUserId];
      const location = state.locations[state.locationId];
      const now = nowIso();

      const nextAppointment = Object.values(state.appointments)
        .filter(
          (a) =>
            a.contactId === ctx.contactId &&
            a.status === "confirmed" &&
            a.startAt >= now,
        )
        .sort((a, b) => a.startAt.localeCompare(b.startAt))[0];

      const calendars = Object.values(state.calendars).filter(
        (c) => c.isActive,
      );
      const calendar =
        calendars.find((c) => c.teamMemberIds.includes(state.currentUserId)) ??
        calendars[0];

      const site = location ? siteUrl(location) : undefined;

      const values: Record<string, string | undefined> = {
        "contact.first_name": contact?.firstName,
        "contact.last_name": contact?.lastName,
        "contact.name": contact
          ? `${contact.firstName} ${contact.lastName}`.trim()
          : undefined,
        "contact.email": contact?.email,
        "contact.phone": contact?.phone,
        "contact.company_name": contact?.companyName,
        "user.first_name": user?.firstName,
        "user.last_name": user?.lastName,
        "user.name": user ? `${user.firstName} ${user.lastName}` : undefined,
        "user.email": user?.email,
        "user.phone": user?.phone,
        "location.name": location?.name,
        "location.phone": location?.phone,
        "location.email": location?.email,
        "location.website": site,
        "calendar.link":
          site && calendar ? `${site}/book/${calendar.slug}` : undefined,
        "review.link": site ? `${site}/review` : undefined,
        "appointment.time": nextAppointment
          ? format(parseISO(nextAppointment.startAt), "EEE, MMM d 'at' h:mm a")
          : undefined,
      };

      const text = renderMergeFields(body, values);
      return { text, unresolved: findMergeTokens(text) };
    },
    { ms: 60, canFail: false },
  );
}
