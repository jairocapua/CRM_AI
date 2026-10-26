import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/common/page-header";
import { SETTINGS_SECTIONS } from "@/components/modules/settings/settings-sections";

export const metadata: Metadata = { title: "Settings" };

/**
 * The settings overview: every section as a card whose title is its link,
 * with a line about it. The section nav is hidden here (it would list the
 * same links twice).
 */
export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Your profile, the business, the team and how records are organised."
      />
      <ul
        aria-label="Settings sections"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
      >
        {SETTINGS_SECTIONS.map((section) => (
          <li
            key={section.href}
            className="bg-card hover:bg-muted/50 focus-within:ring-ring/50 relative flex gap-3 rounded-lg border p-4 transition-colors focus-within:ring-3"
          >
            <div className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-md">
              <section.icon aria-hidden className="size-4" />
            </div>
            <div className="min-w-0 space-y-1">
              <h2 className="text-sm leading-snug font-medium">
                {/* The link covers the whole card (after:inset-0), so the
                    card is one click target named by the title alone. */}
                <Link
                  href={section.href}
                  className="outline-none after:absolute after:inset-0 after:rounded-lg"
                >
                  {section.title}
                </Link>
              </h2>
              <p className="text-muted-foreground text-sm">
                {section.description}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
