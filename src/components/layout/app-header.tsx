"use client";

import { usePathname } from "next/navigation";

import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { findNavItem } from "@/lib/nav";
import { CommandPalette } from "./command-palette";
import { ModeToggle } from "./mode-toggle";

export function AppHeader() {
  const pathname = usePathname();
  const active = findNavItem(pathname);

  return (
    <header className="bg-background/95 supports-backdrop-filter:bg-background/60 sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b px-4 backdrop-blur">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 h-4" />
      <span className="truncate text-sm font-medium">
        {active?.title ?? "Nimbus"}
      </span>

      <div className="ml-auto flex items-center gap-2">
        <CommandPalette />
        <ModeToggle />
      </div>
    </header>
  );
}
