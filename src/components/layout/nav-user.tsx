"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BellIcon,
  ChevronsUpDownIcon,
  LogOutIcon,
  SettingsIcon,
  UserIcon,
} from "lucide-react";

import { useLeaveGuard } from "@/components/providers/unsaved-changes";
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
  const { state, setOpenMobile } = useSidebar();
  // Held in state through a callback ref: it is handed to guardLeave during
  // render, which a ref object must not be.
  const [trigger, setTrigger] = useState<HTMLElement | null>(null);
  // Each link asks first while a page has unsaved edits. The menu item that
  // asked is gone once the question closes, so focus comes back to the
  // menu's trigger; and a link that really navigates closes the phone Sheet.
  const guardLeave = useLeaveGuard();
  const leave = { onLeave: () => setOpenMobile(false), returnFocus: trigger };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            ref={setTrigger}
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
              <DropdownMenuItem
                render={
                  <Link
                    href="/settings"
                    onNavigate={guardLeave("/settings", leave)}
                  />
                }
              >
                <UserIcon className="size-4" />
                My profile
              </DropdownMenuItem>
              <DropdownMenuItem
                render={
                  <Link
                    href="/settings/team"
                    onNavigate={guardLeave("/settings/team", leave)}
                  />
                }
              >
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
