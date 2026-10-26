import {
  Building2Icon,
  DatabaseIcon,
  SquareKanbanIcon,
  TagIcon,
  TextCursorInputIcon,
  UserIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";

export interface SettingsSection {
  title: string;
  href: string;
  /** One line, shown on the `/settings` overview. */
  description: string;
  icon: LucideIcon;
}

/**
 * The settings sections, in order: the section nav in the settings layout
 * and the `/settings` overview both read this list, so a section is never
 * named twice. Each `href` is a real page.
 */
export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  {
    title: "Profile",
    href: "/settings/profile",
    description: "Your name, contact details and time zone.",
    icon: UserIcon,
  },
  {
    title: "Business",
    href: "/settings/business",
    description: "The business name, contact details and time zone.",
    icon: Building2Icon,
  },
  {
    title: "Team",
    href: "/settings/team",
    description: "Team members, roles and invites.",
    icon: UsersIcon,
  },
  {
    title: "Custom fields",
    href: "/settings/custom-fields",
    description: "Extra fields on contacts and deals.",
    icon: TextCursorInputIcon,
  },
  {
    title: "Pipelines",
    href: "/settings/pipelines",
    description: "Deal pipelines and their stages.",
    icon: SquareKanbanIcon,
  },
  {
    title: "Tags",
    href: "/settings/tags",
    description: "The tags on contacts and deals, and merging them.",
    icon: TagIcon,
  },
  {
    title: "Demo data",
    href: "/settings/demo-data",
    description:
      "Reseed the workspace, check its integrity, and simulate a slow or failing network.",
    icon: DatabaseIcon,
  },
];

/** Whether `pathname` is `href`'s page or a page under it. */
export function isSectionActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
