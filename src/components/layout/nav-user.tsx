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

import * as api from "@/lib/api";
import { useResource } from "@/lib/api";
import { fullName, initials } from "@/lib/format";
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
import { Skeleton } from "@/components/ui/skeleton";

/** What the trigger reads when the current user could not be read. */
const NEUTRAL_LABEL = "Your account";

/**
 * The sidebar footer's user menu: the current user (`api.users.me()`, the
 * same read as the inbox's thread view), so a profile save shows here at
 * once (`users.update` invalidates "users").
 *
 * Skeleton text only on the first load. When the read fails the trigger
 * reads "Your account", with no alert of its own: the page in view owns any
 * error message (the profile page shows the alert for this same read). The
 * menu's links still work.
 */
export function NavUser() {
  const { state, setOpenMobile } = useSidebar();
  const me = useResource("users", () => api.users.me(), "me");
  // Held in state through a callback ref: it is handed to guardLeave during
  // render, which a ref object must not be.
  const [trigger, setTrigger] = useState<HTMLElement | null>(null);
  // Each link asks first while a page has unsaved edits. The menu item that
  // asked is gone once the question closes, so focus comes back to the
  // menu's trigger; and a link that really navigates closes the phone Sheet.
  const guardLeave = useLeaveGuard();
  const leave = { onLeave: () => setOpenMobile(false), returnFocus: trigger };

  const loading = me.isLoading && me.data === undefined;
  const user = me.data;
  const name = user ? fullName(user) : NEUTRAL_LABEL;

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
                {user ? (
                  initials(user.firstName, user.lastName)
                ) : (
                  <UserIcon aria-hidden className="size-4" />
                )}
              </AvatarFallback>
            </Avatar>
            {loading ? (
              <div className="grid flex-1 gap-1.5">
                <span className="sr-only">{NEUTRAL_LABEL}</span>
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-3 w-32" />
              </div>
            ) : (
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate font-medium">{name}</span>
                {user ? (
                  <span className="text-muted-foreground truncate text-xs">
                    {user.email}
                  </span>
                ) : null}
              </div>
            )}
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
                  <span className="truncate font-medium">{name}</span>
                  {user ? (
                    <span className="text-muted-foreground truncate text-xs">
                      {user.email}
                    </span>
                  ) : null}
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                render={
                  <Link
                    href="/settings/profile"
                    onNavigate={guardLeave("/settings/profile", leave)}
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
