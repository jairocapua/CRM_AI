"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import * as api from "@/lib/api";
import { useResource } from "@/lib/api";
import { NAV_ITEMS } from "@/lib/nav";
import { LocationSwitcher } from "./location-switcher";
import { NavUser } from "./nav-user";

/** Threads waiting on a reply. Refreshes whenever conversations change. */
function UnreadBadge() {
  const unread = useResource("conversations", () =>
    api.conversations.unreadCount(),
  );
  if (!unread.data) return null;
  return (
    <SidebarMenuBadge aria-label={`${unread.data} unread conversations`}>
      {unread.data > 99 ? "99+" : unread.data}
    </SidebarMenuBadge>
  );
}

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <LocationSwitcher />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => {
                const isActive =
                  pathname === item.url || pathname.startsWith(`${item.url}/`);
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      isActive={isActive}
                      tooltip={item.title}
                      render={<Link href={item.url} />}
                    >
                      <item.icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                    {item.url === "/conversations" ? <UnreadBadge /> : null}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
