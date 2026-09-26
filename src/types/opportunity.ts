import type {
  Audited,
  Cents,
  CurrencyCode,
  ID,
  ISODate,
  LeadSource,
  TagColor,
} from "./common";
import type { CustomFieldValue } from "./settings";

export interface PipelineStage {
  id: ID;
  name: string;
  position: number;
  color: TagColor;
  /** 0–100. Drives the weighted forecast. */
  probability: number;
  isWon?: boolean;
  isLost?: boolean;
}

export interface Pipeline extends Audited {
  id: ID;
  name: string;
  position: number;
  stages: PipelineStage[];
  isDefault: boolean;
  currency: CurrencyCode;
}

export type OpportunityStatus = "open" | "won" | "lost" | "abandoned";

export const OPPORTUNITY_STATUS_LABELS: Record<OpportunityStatus, string> = {
  open: "Open",
  won: "Won",
  lost: "Lost",
  abandoned: "Abandoned",
};

export interface Opportunity extends Audited {
  id: ID;
  name: string;
  contactId: ID;
  pipelineId: ID;
  stageId: ID;
  /** Order within the stage column. */
  position: number;
  value: Cents;
  currency: CurrencyCode;
  status: OpportunityStatus;
  source: LeadSource;
  ownerId?: ID;
  tagIds: ID[];
  customFields: Record<string, CustomFieldValue>;
  expectedCloseAt?: ISODate;
  closedAt?: ISODate;
  lostReason?: string;
  /** Powers the "N days in stage" badge. */
  stageEnteredAt: ISODate;
}
