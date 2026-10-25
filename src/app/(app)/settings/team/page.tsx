import type { Metadata } from "next";
import { UsersIcon } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";

/**
 * Placeholder for the user menu's Team settings link (P7-T42), so neither the
 * link's prefetch nor a click lands on a 404. P9-T03 replaces it in place with
 * the real team list.
 */
export const metadata: Metadata = { title: "Team settings" };

export default function TeamSettingsPage() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <PageHeader
        title="Team settings"
        description="Team members, roles and invites."
      />
      <EmptyState
        icon={UsersIcon}
        title="Team settings coming up"
        description="The team list, roles and invites land in Phase 9."
      />
    </div>
  );
}
