import { z } from "zod";

import {
  CONTACT_STATUS_LABELS,
  LEAD_SOURCE_LABELS,
  type ContactStatus,
  type CustomField,
  type LeadSource,
} from "@/types";
import { buildCustomFieldsSchema } from "./custom-fields";

const CONTACT_STATUS_VALUES = Object.keys(CONTACT_STATUS_LABELS) as [
  ContactStatus,
  ...ContactStatus[],
];
const LEAD_SOURCE_VALUES = Object.keys(LEAD_SOURCE_LABELS) as [
  LeadSource,
  ...LeadSource[],
];

const addressSchema = z.object({
  line1: z.string(),
  line2: z.string(),
  city: z.string(),
  state: z.string(),
  postalCode: z.string(),
  country: z.string(),
});

const dndSchema = z.object({
  all: z.boolean(),
  email: z.boolean(),
  sms: z.boolean(),
  call: z.boolean(),
});

export function buildContactFormSchema(customFields: CustomField[]) {
  return z.object({
    firstName: z.string().trim().min(1, "First name is required."),
    lastName: z.string().trim().min(1, "Last name is required."),
    email: z
      .string()
      .trim()
      .refine(
        (v) => v === "" || z.string().email().safeParse(v).success,
        "Enter a valid email.",
      ),
    phone: z.string().trim(),
    companyName: z.string().trim(),
    jobTitle: z.string().trim(),
    address: addressSchema,
    timezone: z.string().trim(),
    status: z.enum(CONTACT_STATUS_VALUES),
    source: z.enum(LEAD_SOURCE_VALUES),
    ownerId: z.string(),
    tagIds: z.array(z.string()),
    dnd: dndSchema,
    customFields: buildCustomFieldsSchema(customFields),
  });
}

/**
 * Written by hand rather than derived with `z.infer`: the schema's
 * `customFields` shape is built from a runtime field list, so zod can only
 * infer it back down to an index signature anyway. Keeping this explicit
 * keeps the form's generic stable across re-renders as `fields` changes.
 */
export interface ContactFormValues {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  companyName: string;
  jobTitle: string;
  address: {
    line1: string;
    line2: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  timezone: string;
  status: ContactStatus;
  source: LeadSource;
  ownerId: string;
  tagIds: string[];
  dnd: { all: boolean; email: boolean; sms: boolean; call: boolean };
  customFields: Record<string, string | number | boolean | string[]>;
}
