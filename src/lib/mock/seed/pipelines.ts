import type {
  Contact,
  Opportunity,
  Pipeline,
  PipelineStage,
  TagColor,
  User,
} from "@/types";
import { newId } from "../ids";
import { chance, int, pick, pickSome, refPlusDays } from "./rng";

type StageSeed = [name: string, probability: number, color: TagColor];

const SALES_STAGES: StageSeed[] = [
  ["New Lead", 10, "slate"],
  ["Contacted", 25, "sky"],
  ["Discovery Booked", 45, "indigo"],
  ["Proposal Sent", 65, "amber"],
  ["Negotiation", 80, "orange"],
  ["Closed Won", 100, "green"],
];

const ONBOARDING_STAGES: StageSeed[] = [
  ["Agreement Signed", 20, "sky"],
  ["Intake Form", 40, "indigo"],
  ["Kickoff Call", 60, "violet"],
  ["Assets Received", 80, "teal"],
  ["Campaign Live", 100, "green"],
];

const RENEWAL_STAGES: StageSeed[] = [
  ["Upcoming Renewal", 30, "sky"],
  ["Renewal Conversation", 55, "amber"],
  ["Terms Agreed", 85, "teal"],
  ["Renewed", 100, "green"],
];

function buildStages(seeds: StageSeed[]): PipelineStage[] {
  return seeds.map(([name, probability, color], position) => ({
    id: newId("stg"),
    name,
    position,
    color,
    probability,
    isWon: probability === 100,
    isLost: false,
  }));
}

export function seedPipelines(): Pipeline[] {
  const created = {
    createdAt: refPlusDays(-400),
    updatedAt: refPlusDays(-30),
  };
  return [
    {
      id: newId("pipe"),
      name: "Sales Pipeline",
      position: 0,
      stages: buildStages(SALES_STAGES),
      isDefault: true,
      currency: "USD",
      ...created,
    },
    {
      id: newId("pipe"),
      name: "Client Onboarding",
      position: 1,
      stages: buildStages(ONBOARDING_STAGES),
      isDefault: false,
      currency: "USD",
      ...created,
    },
    {
      id: newId("pipe"),
      name: "Renewals",
      position: 2,
      stages: buildStages(RENEWAL_STAGES),
      isDefault: false,
      currency: "USD",
      ...created,
    },
  ];
}

const DEAL_SUFFIXES = [
  "Growth Retainer",
  "Paid Ads Management",
  "Website Rebuild",
  "SEO Programme",
  "Brand Refresh",
  "Lead Gen Sprint",
  "Full Funnel Build",
  "Content Engine",
  "CRM Implementation",
  "Local SEO Package",
];

const LOST_REASONS = [
  "Went with a competitor",
  "Budget cut",
  "No response",
  "Timing not right",
  "Decided to build in-house",
];

export function seedOpportunities(
  pipelines: Pipeline[],
  contacts: Contact[],
  users: User[],
  tagIds: string[],
): Opportunity[] {
  const opportunities: Opportunity[] = [];
  // Position counters per stage, so board columns have a stable order.
  const positions = new Map<string, number>();

  const eligible = contacts.filter((c) => c.status !== "lead" || c.score > 50);

  const perPipeline: [Pipeline, number][] = [
    [pipelines[0]!, 46],
    [pipelines[1]!, 22],
    [pipelines[2]!, 17],
  ];

  let cursor = 0;

  for (const [pipeline, count] of perPipeline) {
    for (let i = 0; i < count; i++) {
      const contact = eligible[cursor % eligible.length]!;
      cursor += 1;

      const stage = pick(pipeline.stages);
      const key = `${pipeline.id}:${stage.id}`;
      const position = positions.get(key) ?? 0;
      positions.set(key, position + 1);

      const won = stage.isWon === true;
      // A small share of deals are explicitly lost, so the board and the
      // dashboard both have a realistic loss rate to report.
      const lost = !won && chance(0.12);

      const createdDaysAgo = int(5, 240);
      const stageDaysAgo = Math.min(createdDaysAgo, int(0, 40));

      opportunities.push({
        id: newId("opp"),
        name: `${contact.companyName ?? "Account"} - ${pick(DEAL_SUFFIXES)}`,
        contactId: contact.id,
        pipelineId: pipeline.id,
        stageId: stage.id,
        position,
        // Cents. Retainers cluster around round monthly numbers.
        value: int(15, 480) * 25_000,
        currency: "USD",
        status: won ? "won" : lost ? "lost" : "open",
        source: contact.source,
        ownerId: contact.ownerId ?? pick(users).id,
        tagIds: pickSome(tagIds, 0, 2),
        customFields: {
          decision_maker: chance(0.55),
          contract_length: pick([3, 6, 6, 12, 12, 24]),
          competitor: chance(0.3)
            ? pick(["HubSpot", "Keap", "ActiveCampaign", "In-house"])
            : null,
          monthly_retainer: int(15, 120) * 25_000,
          proposal_link: null,
        },
        expectedCloseAt: refPlusDays(int(-20, 75), 17),
        closedAt: won || lost ? refPlusDays(-stageDaysAgo, 16) : undefined,
        lostReason: lost ? pick(LOST_REASONS) : undefined,
        stageEnteredAt: refPlusDays(-stageDaysAgo, int(9, 17), int(0, 59)),
        createdAt: refPlusDays(-createdDaysAgo, int(8, 18)),
        updatedAt: refPlusDays(-stageDaysAgo, int(9, 18)),
      });
    }
  }

  return opportunities;
}
