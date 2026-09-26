import { SettingsIcon } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";

export const metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <PageHeader
        title="Settings"
        description="Team, custom fields, pipelines and tags."
      />
      <EmptyState
        icon={SettingsIcon}
        title="Settings coming up"
        description="Profile, team, fields, pipelines and tags land in Phase 9."
      />
    </div>
  );
}
