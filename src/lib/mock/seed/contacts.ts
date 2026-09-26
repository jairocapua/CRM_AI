import type {
  Contact,
  ContactStatus,
  CustomField,
  ID,
  LeadSource,
  Tag,
  User,
} from "@/types";
import { newId } from "../ids";
import { chance, faker, int, pick, pickSome, refPlusDays } from "./rng";
import { maybeAvatar } from "./core";

const STATUS_WEIGHTS: ContactStatus[] = [
  "lead",
  "lead",
  "lead",
  "lead",
  "prospect",
  "prospect",
  "prospect",
  "customer",
  "customer",
  "churned",
];

const SOURCES: LeadSource[] = [
  "website_form",
  "website_form",
  "facebook_ads",
  "facebook_ads",
  "google_ads",
  "referral",
  "referral",
  "cold_outreach",
  "import",
  "manual",
  "chat_widget",
  "phone_call",
];

const INDUSTRIES = [
  "Dental",
  "Home Services",
  "Real Estate",
  "Fitness",
  "Med Spa",
  "Legal",
  "Automotive",
  "Roofing",
  "Chiropractic",
  "Insurance",
  "SaaS",
  "E-commerce",
];

const LEAD_MAGNETS = [
  "Free Website Audit",
  "2026 Ads Playbook",
  "ROI Calculator",
  "Local SEO Checklist",
  "Webinar: Scaling to $1M",
  "Case Study Pack",
];

const TIMEZONES = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
];

export function seedContacts(
  count: number,
  tags: Tag[],
  users: User[],
  customFields: CustomField[],
): Contact[] {
  const byKey = (key: string) => customFields.find((f) => f.key === key);
  const budget = byKey("budget_range");
  const size = byKey("company_size");
  const preferred = byKey("preferred_contact");
  const contacts: Contact[] = [];

  for (let i = 0; i < count; i++) {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const companyName = faker.company.name();
    const status = pick(STATUS_WEIGHTS);

    // Older contacts skew further into the funnel, so timelines read plausibly.
    const createdDaysAgo =
      status === "customer" || status === "churned"
        ? int(90, 400)
        : status === "prospect"
          ? int(20, 180)
          : int(0, 90);

    const lastActivityDaysAgo = Math.min(createdDaysAgo, int(0, 45));

    const domain = companyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 18);

    const contact: Contact = {
      id: newId("con"),
      firstName,
      lastName,
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${domain}.com`,
      phone: `+1${int(200, 989)}555${String(int(0, 9999)).padStart(4, "0")}`,
      avatarUrl: maybeAvatar(`${firstName}${lastName}`),
      companyName,
      jobTitle: faker.person.jobTitle(),
      address: {
        city: faker.location.city(),
        state: faker.location.state({ abbreviated: true }),
        postalCode: faker.location.zipCode("#####"),
        country: "US",
      },
      timezone: pick(TIMEZONES),
      status,
      source: pick(SOURCES),
      ownerId: chance(0.85) ? pick(users).id : undefined,
      tagIds: pickSome(tags, 0, 4).map((t) => t.id),
      customFields: {
        [budget?.key ?? "budget_range"]: chance(0.6)
          ? pick(budget?.options ?? []).value
          : null,
        [size?.key ?? "company_size"]: chance(0.55)
          ? pick(size?.options ?? []).value
          : null,
        industry: pick(INDUSTRIES),
        website: `https://${domain}.com`,
        lead_magnet: chance(0.5) ? pick(LEAD_MAGNETS) : null,
        [preferred?.key ?? "preferred_contact"]: chance(0.7)
          ? pick(preferred?.options ?? []).value
          : null,
        newsletter_opt_in: chance(0.45),
        last_audit_date: chance(0.3) ? refPlusDays(-int(10, 200)) : null,
        notes_internal: null,
      },
      dnd: {
        all: false,
        email: chance(0.06),
        sms: chance(0.08),
        call: chance(0.05),
      },
      score:
        status === "customer"
          ? int(70, 100)
          : status === "prospect"
            ? int(40, 85)
            : status === "churned"
              ? int(0, 40)
              : int(5, 70),
      lastActivityAt: refPlusDays(-lastActivityDaysAgo, int(8, 18), int(0, 59)),
      lastContactedAt: chance(0.8)
        ? refPlusDays(-int(lastActivityDaysAgo, createdDaysAgo), int(8, 18))
        : undefined,
      followers: chance(0.2) ? [pick(users).id] : [],
      createdAt: refPlusDays(-createdDaysAgo, int(7, 20), int(0, 59)),
      updatedAt: refPlusDays(-lastActivityDaysAgo, int(8, 18), int(0, 59)),
    };

    contacts.push(contact);
  }

  return contacts;
}

/** Contacts most likely to carry deals: further down the funnel. */
export function dealCandidates(contacts: Contact[]): ID[] {
  return contacts
    .filter((c) => c.status !== "lead" || c.score > 55)
    .map((c) => c.id);
}
