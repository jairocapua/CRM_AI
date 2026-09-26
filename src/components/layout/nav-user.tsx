"use client";

import Link from "next/link";
import {
  BellIcon,
  ChevronsUpDownIcon,
  LogOutIcon,
  SettingsIcon,
  UserIcon,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

/** Phase 1 placeholder; Phase 2 points this at api.users.me(). */
const CURRENT_USER = {
  name: "Jordan Reyes",
  email: "jordan@northwind.studio",
  initials: "JR",
};

export function NavUser() {
  const { state } = useSidebar();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent"
              />
            }
          >
            <Avatar className="size-8 rounded-md">
              <AvatarFallback className="rounded-md text-xs">
                {CURRENT_USER.initials}
              </AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left leading-tight">
              <span className="truncate font-medium">{CURRENT_USER.name}</span>
              <span className="text-muted-foreground truncate text-xs">
                {CURRENT_USER.email}
              </span>
            </div>
            <ChevronsUpDownIcon className="ml-auto size-4 shrink-0" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            side={state === "collapsed" ? "right" : "top"}
            className="min-w-56"
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="font-normal">
                <div className="grid leading-tight">
                  <span className="truncate font-medium">
                    {CURRENT_USER.name}
                  </span>
                  <span className="text-muted-foreground truncate text-xs">
                    {CURRENT_USER.email}
                  </span>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem render={<Link href="/settings" />}>
                <UserIcon className="size-4" />
                My profile
              </DropdownMenuItem>
              <DropdownMenuItem render={<Link href="/settings/team" />}>
                <SettingsIcon className="size-4" />
                Team settings
              </DropdownMenuItem>
              <DropdownMenuItem>
                <BellIcon className="size-4" />
                Notifications
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <LogOutIcon className="size-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
