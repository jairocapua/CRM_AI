"use client";

import { BuildingIcon, CheckIcon, ChevronsUpDownIcon } from "lucide-react";

import * as api from "@/lib/api";
import { useResource } from "@/lib/api";
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
import { Skeleton } from "@/components/ui/skeleton";
import { APP_NAME } from "@/lib/constants";

/** What the trigger reads when the active location could not be read. */
const NEUTRAL_LABEL = "Your business";

/**
 * GoHighLevel's sub-account switcher. The trigger shows the active location
 * (`api.settings.activeLocation()`, the business page's read, so a rename
 * there shows here at once: `updateLocation` invalidates "settings") and the
 * menu lists `api.settings.listLocations()`. Picking another one does
 * nothing yet: switching is not wired.
 *
 * Skeleton text only on the first load. A failed read shows a neutral label
 * (or no list), with no alert of its own: the page in view owns any error
 * message.
 */
export function LocationSwitcher() {
  const { state } = useSidebar();
  const active = useResource(
    "settings",
    () => api.settings.activeLocation(),
    "active-location",
  );
  const locations = useResource(
    "settings",
    () => api.settings.listLocations(),
    "locations",
  );

  const loading = active.isLoading && active.data === undefined;

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
              {loading ? (
                <>
                  <span className="sr-only">{NEUTRAL_LABEL}</span>
                  <Skeleton className="my-0.5 h-3.5 w-28" />
                </>
              ) : (
                <span className="truncate font-medium">
                  {active.data?.name ?? NEUTRAL_LABEL}
                </span>
              )}
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
              {(locations.data ?? []).map((loc) => (
                <DropdownMenuItem key={loc.id} className="gap-2">
                  <BuildingIcon className="text-muted-foreground size-4" />
                  <div className="grid flex-1">
                    <span className="truncate">{loc.name}</span>
                    {loc.industry ? (
                      <span className="text-muted-foreground truncate text-xs">
                        {loc.industry}
                      </span>
                    ) : null}
                  </div>
                  {loc.id === active.data?.id ? (
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
