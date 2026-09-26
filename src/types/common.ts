/**
 * An ISO-8601 UTC timestamp.
 *
 * Every persisted date in this app is a string, never a `Date`. The mock DB
 * round-trips through JSON: `JSON.stringify` turns a Date into a string and
 * `JSON.parse` never turns it back, so a `Date`-typed field silently becomes a
 * string after a refresh — working in dev and crashing for anyone who reloads.
 * TypeScript cannot catch that, so the rule is structural: parse at the render
 * edge with `toDate()`, write with `nowIso()`.
 */
export type ISODate = string & { readonly __iso?: unique symbol };

export type ID = string;

/** Money as integer cents. Never a float. */
export type Cents = number;

export type CurrencyCode = "USD" | "EUR" | "GBP" | "CAD" | "AUD" | "PHP";

export interface Address {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export interface Audited {
  createdAt: ISODate;
  updatedAt: ISODate;
  createdBy?: ID;
}

export type Channel =
  | "sms"
  | "email"
  | "messenger"
  | "instagram"
  | "whatsapp"
  | "livechat"
  | "call"
  | "voicemail";

export type LeadSource =
  | "website_form"
  | "facebook_ads"
  | "google_ads"
  | "referral"
  | "cold_outreach"
  | "import"
  | "manual"
  | "chat_widget"
  | "phone_call";

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  website_form: "Website Form",
  facebook_ads: "Facebook Ads",
  google_ads: "Google Ads",
  referral: "Referral",
  cold_outreach: "Cold Outreach",
  import: "Import",
  manual: "Manual",
  chat_widget: "Chat Widget",
  phone_call: "Phone Call",
};

export type TagColor =
  | "slate"
  | "red"
  | "orange"
  | "amber"
  | "green"
  | "teal"
  | "sky"
  | "indigo"
  | "violet"
  | "pink";
