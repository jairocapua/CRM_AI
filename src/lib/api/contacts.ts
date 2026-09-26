import type { Activity, Contact, ID, Note } from "@/types";
import { db } from "@/lib/mock/db";
import { applyQuery } from "@/lib/mock/query-engine";
import { newId } from "@/lib/mock/ids";
import { cascadeContactDelete } from "@/lib/mock/cascade";
import { invalidate } from "./cache";
import {
  ApiError,
  notFound,
  nowIso,
  simulate,
  type ListQuery,
  type Page,
} from "./http";

const SEARCH_FIELDS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "companyName",
  "jobTitle",
];

function pushActivity(activity: Omit<Activity, "id">) {
  const record: Activity = { ...activity, id: newId("act") };
  db.setState((s) => ({
    activities: { ...s.activities, [record.id]: record },
  }));
}

export async function list(query: ListQuery = {}): Promise<Page<Contact>> {
  return simulate(
    () =>
      applyQuery(Object.values(db.getState().contacts), query, {
        searchFields: SEARCH_FIELDS,
        defaultSort: [{ field: "updatedAt", desc: true }],
      }),
    { canFail: false },
  );
}

export async function get(id: ID): Promise<Contact> {
  return simulate(() => db.getState().contacts[id] ?? notFound("Contact", id), {
    canFail: false,
  });
}

export type ContactDraft = Partial<Contact> &
  Pick<Contact, "firstName" | "lastName">;

export async function create(draft: ContactDraft): Promise<Contact> {
  const contact = await simulate(
    () => {
      const at = nowIso();
      const record: Contact = {
        id: newId("con"),
        tagIds: [],
        customFields: {},
        followers: [],
        status: "lead",
        source: "manual",
        score: 0,
        timezone:
          db.getState().locations[db.getState().locationId]?.timezone ??
          "America/Los_Angeles",
        dnd: { all: false, email: false, sms: false, call: false },
        lastActivityAt: at,
        createdAt: at,
        updatedAt: at,
        ...draft,
      };
      db.setState((s) => ({
        contacts: { ...s.contacts, [record.id]: record },
      }));
      pushActivity({
        type: "contact.created",
        at,
        contactId: record.id,
        actorId: db.getState().currentUserId,
        summary: `${record.firstName} ${record.lastName} was created`,
      });
      return record;
    },
    { ms: 380 },
  );

  invalidate("contacts", "activities", "analytics");
  return contact;
}

export async function update(
  id: ID,
  patch: Partial<Contact>,
): Promise<Contact> {
  const contact = await simulate(() => {
    const prev = db.getState().contacts[id] ?? notFound("Contact", id);
    const next: Contact = { ...prev, ...patch, id, updatedAt: nowIso() };
    db.setState((s) => ({ contacts: { ...s.contacts, [id]: next } }));
    return next;
  });

  invalidate("contacts", "activities");
  return contact;
}

export async function remove(ids: ID[]): Promise<{ deleted: number }> {
  const result = await simulate(
    () => {
      // Only count what was actually there — deleting the same row twice must
      // not report two deletions.
      const existing = ids.filter((id) => db.getState().contacts[id]);
      // Notes, tasks, appointments and the activity feed all hang off the
      // contact too; see @/lib/mock/cascade for why they are swept together.
      db.setState((s) => cascadeContactDelete(s, existing));
      return { deleted: existing.length };
    },
    { ms: 420 },
  );

  invalidate(
    "contacts",
    "opportunities",
    "conversations",
    "notes",
    "tasks",
    "appointments",
    "activities",
    "analytics",
  );
  return result;
}

export async function addTags(ids: ID[], tagIds: ID[]): Promise<void> {
  await simulate(() => {
    db.setState((s) => {
      const contacts = { ...s.contacts };
      for (const id of ids) {
        const contact = contacts[id];
        if (!contact) continue;
        contacts[id] = {
          ...contact,
          tagIds: [...new Set([...contact.tagIds, ...tagIds])],
          updatedAt: nowIso(),
        };
      }
      return { contacts };
    });
  });
  invalidate("contacts", "tags");
}

export async function removeTags(ids: ID[], tagIds: ID[]): Promise<void> {
  await simulate(() => {
    db.setState((s) => {
      const contacts = { ...s.contacts };
      for (const id of ids) {
        const contact = contacts[id];
        if (!contact) continue;
        contacts[id] = {
          ...contact,
          tagIds: contact.tagIds.filter((t) => !tagIds.includes(t)),
          updatedAt: nowIso(),
        };
      }
      return { contacts };
    });
  });
  invalidate("contacts", "tags");
}

export async function assignOwner(ids: ID[], ownerId?: ID): Promise<void> {
  await simulate(() => {
    db.setState((s) => {
      const contacts = { ...s.contacts };
      for (const id of ids) {
        const contact = contacts[id];
        if (!contact) continue;
        contacts[id] = { ...contact, ownerId, updatedAt: nowIso() };
      }
      return { contacts };
    });
  });
  invalidate("contacts");
}

export async function listNotes(contactId: ID): Promise<Note[]> {
  return simulate(
    () =>
      Object.values(db.getState().notes)
        .filter((n) => n.contactId === contactId)
        .sort(
          (a, b) =>
            Number(b.pinned) - Number(a.pinned) ||
            b.createdAt.localeCompare(a.createdAt),
        ),
    { canFail: false },
  );
}

export async function addNote(contactId: ID, body: string): Promise<Note> {
  const note = await simulate(() => {
    const at = nowIso();
    const record: Note = {
      id: newId("note"),
      contactId,
      authorId: db.getState().currentUserId,
      body,
      pinned: false,
      createdAt: at,
      updatedAt: at,
    };
    db.setState((s) => ({ notes: { ...s.notes, [record.id]: record } }));
    pushActivity({
      type: "note.added",
      at,
      contactId,
      actorId: record.authorId,
      summary: "Note added",
    });
    return record;
  });

  invalidate("notes", "activities");
  return note;
}

/** Builds a CSV of the current query result, for the export button. */
export async function exportCsv(query: ListQuery = {}): Promise<Blob> {
  const columns: [string, (c: Contact) => string][] = [
    ["First Name", (c) => c.firstName],
    ["Last Name", (c) => c.lastName],
    ["Email", (c) => c.email ?? ""],
    ["Phone", (c) => c.phone ?? ""],
    ["Company", (c) => c.companyName ?? ""],
    ["Status", (c) => c.status],
    ["Source", (c) => c.source],
    ["Score", (c) => String(c.score)],
    ["Created", (c) => c.createdAt],
  ];

  const page = await simulate(
    () =>
      applyQuery(
        Object.values(db.getState().contacts),
        { ...query, pageSize: undefined },
        {
          searchFields: SEARCH_FIELDS,
        },
      ),
    { canFail: false, ms: 300 },
  );

  const escape = (value: string) =>
    /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

  const lines = [
    columns.map(([header]) => header).join(","),
    ...page.rows.map((row) =>
      columns.map(([, read]) => escape(read(row))).join(","),
    ),
  ];

  return new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
}

/** Used by the import wizard to commit a parsed batch. */
export async function importMany(drafts: ContactDraft[]): Promise<number> {
  if (drafts.length === 0) {
    throw new ApiError("Nothing to import.", 400, "EMPTY_IMPORT");
  }
  const count = await simulate(
    () => {
      const at = nowIso();
      db.setState((s) => {
        const contacts = { ...s.contacts };
        for (const draft of drafts) {
          const record: Contact = {
            id: newId("con"),
            tagIds: [],
            customFields: {},
            followers: [],
            status: "lead",
            source: "import",
            score: 0,
            timezone: "America/Los_Angeles",
            dnd: { all: false, email: false, sms: false, call: false },
            createdAt: at,
            updatedAt: at,
            ...draft,
          };
          contacts[record.id] = record;
        }
        return { contacts };
      });
      return drafts.length;
    },
    { ms: 700 },
  );

  invalidate("contacts", "activities", "analytics");
  return count;
}
