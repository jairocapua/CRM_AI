import type {
  CustomField,
  Location,
  MessageTemplate,
  Snippet,
  Tag,
  TagColor,
  User,
} from "@/types";
import { newId } from "../ids";
import { REF_DATE, chance, int, refPlusDays } from "./rng";

const created = {
  createdAt: refPlusDays(-420),
  updatedAt: REF_DATE.toISOString(),
};

export function seedLocations(): Location[] {
  return [
    {
      id: "loc_northwind",
      name: "Northwind Studio",
      website: "https://northwind.studio",
      phone: "+14155550142",
      email: "hello@northwind.studio",
      timezone: "America/Los_Angeles",
      currency: "USD",
      industry: "Marketing Agency",
      address: {
        line1: "1100 Mission St",
        city: "San Francisco",
        state: "CA",
        postalCode: "94103",
        country: "US",
      },
      ...created,
    },
    {
      id: "loc_harbor",
      name: "Harbor Dental",
      timezone: "America/New_York",
      currency: "USD",
      industry: "Healthcare",
      ...created,
    },
    {
      id: "loc_peak",
      name: "Peak Fitness Co.",
      timezone: "America/Denver",
      currency: "USD",
      industry: "Fitness",
      ...created,
    },
  ];
}

const TEAM: {
  id: string;
  firstName: string;
  lastName: string;
  role: User["role"];
  jobTitle: string;
}[] = [
  {
    id: "usr_jordan",
    firstName: "Jordan",
    lastName: "Reyes",
    role: "agency_owner",
    jobTitle: "Founder",
  },
  {
    id: "usr_priya",
    firstName: "Priya",
    lastName: "Nair",
    role: "admin",
    jobTitle: "Head of Sales",
  },
  {
    id: "usr_marcus",
    firstName: "Marcus",
    lastName: "Bell",
    role: "user",
    jobTitle: "Account Executive",
  },
  {
    id: "usr_lena",
    firstName: "Lena",
    lastName: "Okafor",
    role: "user",
    jobTitle: "Account Executive",
  },
  {
    id: "usr_sam",
    firstName: "Sam",
    lastName: "Whitfield",
    role: "user",
    jobTitle: "SDR",
  },
  {
    id: "usr_aiko",
    firstName: "Aiko",
    lastName: "Tanaka",
    role: "admin",
    jobTitle: "Customer Success",
  },
];

export function seedUsers(): User[] {
  return TEAM.map((member, i) => ({
    ...member,
    email: `${member.firstName.toLowerCase()}@northwind.studio`,
    phone: `+1415555${String(1000 + i * 7).slice(-4)}`,
    timezone: "America/Los_Angeles",
    isActive: true,
    lastSeenAt: refPlusDays(0, 8 + i, int(0, 59)),
    ...created,
  }));
}

const TAG_SEED: [string, TagColor][] = [
  ["Hot Lead", "red"],
  ["Warm", "orange"],
  ["Cold", "slate"],
  ["Newsletter", "sky"],
  ["Webinar Attendee", "violet"],
  ["Demo Booked", "indigo"],
  ["Proposal Sent", "amber"],
  ["Negotiating", "pink"],
  ["Enterprise", "teal"],
  ["SMB", "sky"],
  ["Agency", "violet"],
  ["Referral Partner", "green"],
  ["Facebook Ads", "indigo"],
  ["Google Ads", "amber"],
  ["Trade Show", "orange"],
  ["Past Client", "teal"],
  ["Do Not Call", "red"],
  ["VIP", "pink"],
  ["Needs Follow Up", "orange"],
  ["Onboarding", "sky"],
  ["Churn Risk", "red"],
  ["Advocate", "green"],
  ["Newsletter Unsub", "slate"],
  ["Partner Intro", "green"],
];

export function seedTags(): Tag[] {
  return TAG_SEED.map(([name, color]) => ({
    id: newId("tag"),
    name,
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    color,
    ...created,
  }));
}

type FieldSeed = Omit<CustomField, "id" | "createdAt" | "updatedAt">;

const CONTACT_FIELDS: FieldSeed[] = [
  {
    key: "budget_range",
    label: "Budget Range",
    type: "select",
    objectType: "contact",
    group: "Qualification",
    required: false,
    position: 0,
    options: [
      { value: "under_5k", label: "Under $5k" },
      { value: "5k_15k", label: "$5k - $15k" },
      { value: "15k_50k", label: "$15k - $50k" },
      { value: "50k_plus", label: "$50k+" },
    ],
  },
  {
    key: "company_size",
    label: "Company Size",
    type: "select",
    objectType: "contact",
    group: "Firmographics",
    required: false,
    position: 1,
    options: [
      { value: "1_10", label: "1-10" },
      { value: "11_50", label: "11-50" },
      { value: "51_200", label: "51-200" },
      { value: "200_plus", label: "200+" },
    ],
  },
  {
    key: "industry",
    label: "Industry",
    type: "text",
    objectType: "contact",
    group: "Firmographics",
    required: false,
    position: 2,
  },
  {
    key: "website",
    label: "Website",
    type: "url",
    objectType: "contact",
    group: "Firmographics",
    required: false,
    position: 3,
  },
  {
    key: "lead_magnet",
    label: "Lead Magnet",
    type: "text",
    objectType: "contact",
    group: "Attribution",
    required: false,
    position: 4,
  },
  {
    key: "preferred_contact",
    label: "Preferred Contact Method",
    type: "select",
    objectType: "contact",
    group: "Preferences",
    required: false,
    position: 5,
    options: [
      { value: "email", label: "Email" },
      { value: "phone", label: "Phone" },
      { value: "sms", label: "SMS" },
    ],
  },
  {
    key: "newsletter_opt_in",
    label: "Newsletter Opt-In",
    type: "checkbox",
    objectType: "contact",
    group: "Preferences",
    required: false,
    position: 6,
  },
  {
    key: "last_audit_date",
    label: "Last Audit Date",
    type: "date",
    objectType: "contact",
    group: "Qualification",
    required: false,
    position: 7,
  },
  {
    key: "notes_internal",
    label: "Internal Notes",
    type: "textarea",
    objectType: "contact",
    group: "Qualification",
    required: false,
    position: 8,
  },
];

const OPPORTUNITY_FIELDS: FieldSeed[] = [
  {
    key: "decision_maker",
    label: "Decision Maker Identified",
    type: "checkbox",
    objectType: "opportunity",
    group: "Deal",
    required: false,
    position: 0,
  },
  {
    key: "contract_length",
    label: "Contract Length (months)",
    type: "number",
    objectType: "opportunity",
    group: "Deal",
    required: false,
    position: 1,
  },
  {
    key: "competitor",
    label: "Competitor",
    type: "text",
    objectType: "opportunity",
    group: "Deal",
    required: false,
    position: 2,
  },
  {
    key: "monthly_retainer",
    label: "Monthly Retainer",
    type: "currency",
    objectType: "opportunity",
    group: "Deal",
    required: false,
    position: 3,
  },
  {
    key: "proposal_link",
    label: "Proposal Link",
    type: "url",
    objectType: "opportunity",
    group: "Deal",
    required: false,
    position: 4,
  },
];

export function seedCustomFields(): CustomField[] {
  return [...CONTACT_FIELDS, ...OPPORTUNITY_FIELDS].map((f) => ({
    ...f,
    id: newId("cf"),
    ...created,
  }));
}

type TemplateSeed = Omit<MessageTemplate, "id" | "createdAt" | "updatedAt">;

const TEMPLATES: TemplateSeed[] = [
  {
    name: "Discovery follow-up",
    channel: "email",
    category: "Sales",
    subject: "Great speaking with you, {{contact.first_name}}",
    body: "Hi {{contact.first_name}},\n\nThanks for the time today. Here is a recap of what we covered, plus the next steps we agreed on.\n\nBest,\n{{user.first_name}}",
  },
  {
    name: "Proposal sent",
    channel: "email",
    category: "Sales",
    subject: "Your proposal is ready",
    body: "Hi {{contact.first_name}},\n\nYour proposal is attached. Happy to walk through it whenever suits you.\n\n{{user.first_name}}",
  },
  {
    name: "Appointment reminder",
    channel: "sms",
    category: "Scheduling",
    body: "Hi {{contact.first_name}}, quick reminder about our call tomorrow at {{appointment.time}}. Reply R to reschedule.",
  },
  {
    name: "No-show follow-up",
    channel: "sms",
    category: "Scheduling",
    body: "Sorry we missed you, {{contact.first_name}}. Want to grab another time? {{calendar.link}}",
  },
  {
    name: "Review request",
    channel: "sms",
    category: "Retention",
    body: "Thanks for working with us, {{contact.first_name}}! Would you mind leaving a quick review? {{review.link}}",
  },
  {
    name: "Re-engagement",
    channel: "email",
    category: "Nurture",
    subject: "Still thinking it over?",
    body: "Hi {{contact.first_name}},\n\nChecking in on the proposal - any questions I can answer?\n\n{{user.first_name}}",
  },
];

export function seedTemplates(): MessageTemplate[] {
  return TEMPLATES.map((t) => ({ ...t, id: newId("tpl"), ...created }));
}

type SnippetSeed = Omit<Snippet, "id" | "createdAt" | "updatedAt">;

const SNIPPETS: SnippetSeed[] = [
  {
    shortcut: "/pricing",
    name: "Pricing overview",
    body: "Our retainers start at $3,500/mo and scale with ad spend. Happy to send a full breakdown.",
  },
  {
    shortcut: "/calendar",
    name: "Booking link",
    body: "Here is my calendar - grab any slot that works: {{calendar.link}}",
  },
  {
    shortcut: "/thanks",
    name: "Thanks",
    body: "Thanks so much, {{contact.first_name}} - really appreciate it!",
  },
  {
    shortcut: "/onboard",
    name: "Onboarding steps",
    body: "Next steps: 1) sign the agreement, 2) complete the intake form, 3) kickoff call.",
  },
];

export function seedSnippets(): Snippet[] {
  return SNIPPETS.map((s) => ({ ...s, id: newId("snip"), ...created }));
}

/**
 * Deterministic placeholder avatars. Only some contacts get one so the UI has
 * to handle initials fallbacks, which is the realistic case.
 */
export function maybeAvatar(seedKey: string): string | undefined {
  return chance(0.4)
    ? `https://avatar.vercel.sh/${encodeURIComponent(seedKey)}.svg`
    : undefined;
}
