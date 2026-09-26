import {
  CalendarDays,
  LayoutDashboard,
  MessagesSquare,
  Settings,
  Target,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  /** Shown in the command palette to disambiguate similar entries. */
  description: string;
}

/**
 * Single source of truth for navigation — the sidebar, the command palette and
 * breadcrumb titles all read from here, so a route is never named twice.
 */
export const NAV_ITEMS: NavItem[] = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: LayoutDashboard,
    description: "Pipeline, revenue and activity at a glance",
  },
  {
    title: "Conversations",
    url: "/conversations",
    icon: MessagesSquare,
    description: "Unified inbox across every channel",
  },
  {
    title: "Contacts",
    url: "/contacts",
    icon: Users,
    description: "People, smart lists and segments",
  },
  {
    title: "Opportunities",
    url: "/opportunities",
    icon: Target,
    description: "Deals moving through your pipelines",
  },
  {
    title: "Calendars",
    url: "/calendars",
    icon: CalendarDays,
    description: "Appointments and availability",
  },
  {
    title: "Automation",
    url: "/automation",
    icon: Workflow,
    description: "Workflows that run themselves",
  },
  {
    title: "Settings",
    url: "/settings",
    icon: Settings,
    description: "Team, fields, pipelines and tags",
  },
];

/** Longest-prefix match, so /contacts/abc still highlights Contacts. */
export function findNavItem(pathname: string): NavItem | undefined {
  return NAV_ITEMS.filter(
    (item) => pathname === item.url || pathname.startsWith(`${item.url}/`),
  ).sort((a, b) => b.url.length - a.url.length)[0];
}
