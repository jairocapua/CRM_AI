import { format, parseISO } from "date-fns";
import { z } from "zod";

import { isCalendarDay, parseCalendarDay } from "@/lib/dates";
import {
  LEAD_SOURCE_LABELS,
  OPPORTUNITY_STATUS_LABELS,
  type CustomField,
  type ISODate,
  type LeadSource,
  type OpportunityStatus,
} from "@/types";
import { buildCustomFieldsSchema } from "./custom-fields";

// Money conversion lives in one place; re-exported so form code has a single
// import for the schema and the converters it needs alongside it.
export { centsToInput, parseCents } from "@/lib/format";

const OPPORTUNITY_STATUS_VALUES = Object.keys(OPPORTUNITY_STATUS_LABELS) as [
  OpportunityStatus,
  ...OpportunityStatus[],
];
const LEAD_SOURCE_VALUES = Object.keys(LEAD_SOURCE_LABELS) as [
  LeadSource,
  ...LeadSource[],
];

export function buildOpportunityFormSchema(customFields: CustomField[]) {
  return z.object({
    name: z.string().trim().min(1, "Deal name is required."),
    contactId: z.string().min(1, "Pick a contact."),
    pipelineId: z.string().min(1, "Pick a pipeline."),
    stageId: z.string().min(1, "Pick a stage."),
    value: z
      .string()
      .trim()
      .refine((v) => v === "" || !Number.isNaN(Number(v)), "Enter an amount.")
      .refine((v) => v === "" || Number(v) >= 0, "Amount can't be negative."),
    status: z.enum(OPPORTUNITY_STATUS_VALUES),
    source: z.enum(LEAD_SOURCE_VALUES),
    ownerId: z.string(),
    tagIds: z.array(z.string()),
    // The same day rule `dateInputToIso` applies, so a day it would drop is
    // reported here instead of saving as "no date".
    expectedCloseAt: z
      .string()
      .refine((v) => v === "" || isCalendarDay(v), "Enter a valid date."),
    lostReason: z.string().trim(),
    customFields: buildCustomFieldsSchema(customFields),
  });
}

/**
 * Hand-written rather than `z.infer`'d, for the same reason as
 * `ContactFormValues`: the `customFields` shape is built from a runtime field
 * list, so zod can only infer it back down to an index signature.
 */
export interface OpportunityFormValues {
  name: string;
  contactId: string;
  pipelineId: string;
  stageId: string;
  /** Dollars, as typed. Converted to `Cents` on submit — see `toCents`. */
  value: string;
  status: OpportunityStatus;
  source: LeadSource;
  ownerId: string;
  tagIds: string[];
  /** `<input type="date">` format, "YYYY-MM-DD". Empty means no date. */
  expectedCloseAt: string;
  lostReason: string;
  customFields: Record<string, string | number | boolean | string[]>;
}

/**
 * `<input type="date">` speaks "YYYY-MM-DD" while the store holds `ISODate`.
 * Both directions use the *local* calendar date, because that is what every
 * screen displays. Reading the UTC date instead shifted a seeded 17:00 UTC
 * close back a day east of Greenwich — each save of the form moved it again.
 *
 * A day is valid by the shared rule in `@/lib/dates`, the same one the booking
 * form and the calendars use. An empty or refused value gives undefined ("no
 * date"); the form schema reports a refused value before submit, so a day the
 * user typed is never silently cleared.
 */
export function dateInputToIso(value: string): ISODate | undefined {
  if (!isCalendarDay(value)) return undefined;
  const { year, month, day } = parseCalendarDay(value);
  // `isCalendarDay` refuses years 0000-0099, so `new Date` cannot read a
  // two-digit year here as 1900-1999.
  return new Date(year, month - 1, day).toISOString();
}

export function isoToDateInput(iso: ISODate | undefined): string {
  return iso ? format(parseISO(iso), "yyyy-MM-dd") : "";
}
