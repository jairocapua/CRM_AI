"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useLeaveGuard } from "@/components/providers/unsaved-changes";
import { cn } from "@/lib/utils";
import { isSectionActive, SETTINGS_SECTIONS } from "./settings-sections";

/**
 * The settings section nav: a column beside the page at `lg`, a row above it
 * that scrolls sideways on smaller screens (kept scrolled to the current
 * section). The current section's link carries `aria-current="page"`.
 *
 * Hidden on the `/settings` overview itself, which lists the same sections
 * with a line about each. Each link asks first while the page has unsaved
 * edits (`useLeaveGuard`), like the sidebar's links.
 */
export function SettingsNav() {
  const pathname = usePathname();
  const guardLeave = useLeaveGuard();
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const list = listRef.current;
    const current = list?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!list || !current || list.scrollWidth <= list.clientWidth) return;
    list.scrollLeft =
      current.offsetLeft - (list.clientWidth - current.offsetWidth) / 2;
  }, [pathname]);

  if (pathname === "/settings") return null;

  return (
    <nav aria-label="Settings sections" className="lg:w-48 lg:shrink-0">
      <ul
        ref={listRef}
        className="relative -mx-4 flex gap-1 overflow-x-auto px-4 pb-1 md:-mx-6 md:px-6 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0"
      >
        {SETTINGS_SECTIONS.map((section) => {
          const active = isSectionActive(pathname, section.href);
          return (
            <li key={section.href} className="shrink-0">
              <Link
                href={section.href}
                aria-current={active ? "page" : undefined}
                onNavigate={guardLeave(section.href)}
                className={cn(
                  "focus-visible:ring-ring/50 flex h-8 items-center gap-2 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3",
                  active
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <section.icon aria-hidden className="size-4 shrink-0" />
                {section.title}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
