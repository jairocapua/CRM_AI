import type {
  Channel,
  ContactStatus,
  OpportunityStatus,
  TagColor,
} from "@/types";

export const APP_NAME = "Nimbus CRM";

/** Conversation channels, in the order they appear in composer/filter UI. */
export const CHANNELS: { value: Channel; label: string }[] = [
  { value: "sms", label: "SMS" },
  { value: "email", label: "Email" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "messenger", label: "Messenger" },
  { value: "instagram", label: "Instagram DM" },
  { value: "livechat", label: "Live Chat" },
  { value: "call", label: "Call" },
  { value: "voicemail", label: "Voicemail" },
];

export const CHANNEL_LABELS = Object.fromEntries(
  CHANNELS.map((c) => [c.value, c.label]),
) as Record<Channel, string>;

/**
 * Tag colours resolve to Tailwind palette classes rather than CSS variables:
 * ten themed token pairs would be a lot of CSS for a decorative scale, and the
 * literal class strings here are what Tailwind's content scan needs to see.
 */
export const TAG_COLOR_CLASSES: Record<TagColor, string> = {
  slate:
    "bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300 border-slate-200 dark:border-slate-800",
  red: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 border-red-200 dark:border-red-900",
  orange:
    "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300 border-orange-200 dark:border-orange-900",
  amber:
    "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-900",
  green:
    "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300 border-green-200 dark:border-green-900",
  teal: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300 border-teal-200 dark:border-teal-900",
  sky: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300 border-sky-200 dark:border-sky-900",
  indigo:
    "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 border-indigo-200 dark:border-indigo-900",
  violet:
    "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300 border-violet-200 dark:border-violet-900",
  pink: "bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300 border-pink-200 dark:border-pink-900",
};

export const TAG_COLORS = Object.keys(TAG_COLOR_CLASSES) as TagColor[];

/** Solid swatch, for stage headers and calendar dots. */
export const TAG_DOT_CLASSES: Record<TagColor, string> = {
  slate: "bg-slate-500",
  red: "bg-red-500",
  orange: "bg-orange-500",
  amber: "bg-amber-500",
  green: "bg-green-500",
  teal: "bg-teal-500",
  sky: "bg-sky-500",
  indigo: "bg-indigo-500",
  violet: "bg-violet-500",
  pink: "bg-pink-500",
};

/** Same literal-class-string reasoning as TAG_COLOR_CLASSES, for the opportunity status badge. */
export const OPPORTUNITY_STATUS_CLASSES: Record<OpportunityStatus, string> = {
  open: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300 border-sky-200 dark:border-sky-900",
  won: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300 border-green-200 dark:border-green-900",
  lost: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 border-red-200 dark:border-red-900",
  abandoned:
    "bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300 border-slate-200 dark:border-slate-800",
};

/** Same literal-class-string reasoning as TAG_COLOR_CLASSES, for the contact status badge. */
export const CONTACT_STATUS_CLASSES: Record<ContactStatus, string> = {
  lead: "bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300 border-slate-200 dark:border-slate-800",
  prospect:
    "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300 border-sky-200 dark:border-sky-900",
  customer:
    "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300 border-green-200 dark:border-green-900",
  churned:
    "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 border-red-200 dark:border-red-900",
};
