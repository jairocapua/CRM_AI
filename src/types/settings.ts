import type {
  Address,
  Audited,
  Channel,
  CurrencyCode,
  ID,
  ISODate,
  TagColor,
} from "./common";

export type UserRole = "admin" | "user" | "agency_owner";

export interface User extends Audited {
  id: ID;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  avatarUrl?: string;
  role: UserRole;
  jobTitle?: string;
  timezone: string;
  isActive: boolean;
  lastSeenAt?: ISODate;
}

/** A GoHighLevel "sub-account" — one client workspace. */
export interface Location extends Audited {
  id: ID;
  name: string;
  logoUrl?: string;
  website?: string;
  phone?: string;
  email?: string;
  address?: Address;
  timezone: string;
  currency: CurrencyCode;
  industry?: string;
}

export interface Tag extends Audited {
  id: ID;
  name: string;
  slug: string;
  color: TagColor;
}

export type CustomFieldType =
  | "text"
  | "textarea"
  | "number"
  | "currency"
  | "date"
  | "checkbox"
  | "select"
  | "multiselect"
  | "phone"
  | "email"
  | "url";

export interface CustomField extends Audited {
  id: ID;
  /** Stable machine key, e.g. "budget_range". Values are keyed by this. */
  key: string;
  label: string;
  type: CustomFieldType;
  objectType: "contact" | "opportunity";
  group?: string;
  placeholder?: string;
  helpText?: string;
  required: boolean;
  options?: { value: string; label: string }[];
  position: number;
}

export type CustomFieldValue = string | number | boolean | string[] | null;

export interface MessageTemplate extends Audited {
  id: ID;
  name: string;
  channel: Extract<Channel, "sms" | "email">;
  subject?: string;
  /** Supports merge fields such as {{contact.first_name}}. */
  body: string;
  category?: string;
}

export interface Snippet extends Audited {
  id: ID;
  /** Typed in the composer to expand, e.g. "/pricing". */
  shortcut: string;
  name: string;
  body: string;
}
