"use client";

import { BuildingIcon, CheckIcon, ChevronsUpDownIcon } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { APP_NAME } from "@/lib/constants";

/**
 * GoHighLevel's sub-account switcher. Phase 1 renders a fixed list; Phase 2
 * points it at api.settings.listLocations().
 */
const LOCATIONS = [
  { id: "loc_1", name: "Northwind Studio", industry: "Marketing Agency" },
  { id: "loc_2", name: "Harbor Dental", industry: "Healthcare" },
  { id: "loc_3", name: "Peak Fitness Co.", industry: "Fitness" },
];

export function LocationSwitcher() {
  const { state } = useSidebar();
  const active = LOCATIONS[0]!;

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
            <div className="bg-brand text-brand-foreground flex aspect-square size-8 shrink-0 items-center justify-center rounded-md">
              <BuildingIcon className="size-4" />
            </div>
            <div className="grid flex-1 text-left leading-tight">
              <span className="truncate font-medium">{active.name}</span>
              <span className="text-muted-foreground truncate text-xs">
                {APP_NAME}
              </span>
            </div>
            <ChevronsUpDownIcon className="ml-auto size-4 shrink-0" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            side={state === "collapsed" ? "right" : "bottom"}
            className="min-w-56"
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-muted-foreground text-xs">
                Sub-accounts
              </DropdownMenuLabel>
              {LOCATIONS.map((loc) => (
                <DropdownMenuItem key={loc.id} className="gap-2">
                  <BuildingIcon className="text-muted-foreground size-4" />
                  <div className="grid flex-1">
                    <span className="truncate">{loc.name}</span>
                    <span className="text-muted-foreground truncate text-xs">
                      {loc.industry}
                    </span>
                  </div>
                  {loc.id === active.id ? (
                    <CheckIcon className="size-4" />
                  ) : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
