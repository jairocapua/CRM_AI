import type { Address, Audited, ID, ISODate, LeadSource } from "./common";
import type { CustomFieldValue } from "./settings";
import type { FilterGroup, SortSpec } from "./filter";

export type ContactStatus = "lead" | "prospect" | "customer" | "churned";

export const CONTACT_STATUS_LABELS: Record<ContactStatus, string> = {
  lead: "Lead",
  prospect: "Prospect",
  customer: "Customer",
  churned: "Churned",
};

export interface Contact extends Audited {
  id: ID;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  avatarUrl?: string;
  companyName?: string;
  jobTitle?: string;
  address?: Address;
  timezone: string;
  status: ContactStatus;
  source: LeadSource;
  ownerId?: ID;
  tagIds: ID[];
  /** Keyed by CustomField.key, not by id, so keys stay readable in storage. */
  customFields: Record<string, CustomFieldValue>;
  dnd: { all: boolean; email: boolean; sms: boolean; call: boolean };
  /** 0–100. Drives the "hot lead" chip. */
  score: number;
  lastActivityAt?: ISODate;
  lastContactedAt?: ISODate;
  followers: ID[];
}

export interface Note extends Audited {
  id: ID;
  contactId: ID;
  authorId: ID;
  body: string;
  pinned: boolean;
}

export type TaskPriority = "low" | "medium" | "high";

export interface Task extends Audited {
  id: ID;
  title: string;
  description?: string;
  dueAt?: ISODate;
  completedAt?: ISODate;
  assigneeId?: ID;
  contactId?: ID;
  opportunityId?: ID;
  priority: TaskPriority;
}

/** A saved filter. Shares the FilterGroup engine with workflow if/else. */
export interface SmartList extends Audited {
  id: ID;
  name: string;
  objectType: "contact" | "opportunity";
  filter: FilterGroup;
  sort?: SortSpec[];
  visibleColumns?: string[];
  isPinned: boolean;
  /** undefined = shared with the whole team. */
  ownerId?: ID;
}
