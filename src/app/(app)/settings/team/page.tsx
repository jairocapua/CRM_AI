import type { Metadata } from "next";

import { PageHeader } from "@/components/common/page-header";
import { InviteTeammateDialog } from "@/components/modules/settings/invite-teammate-dialog";
import { TeamSettings } from "@/components/modules/settings/team-settings";

export const metadata: Metadata = { title: "Team settings" };

export default function TeamSettingsPage() {
  return (
    <>
      <PageHeader
        title="Team settings"
        description="Who is on the team, their roles and who has not signed in yet."
        actions={<InviteTeammateDialog />}
      />
      <TeamSettings />
    </>
  );
}
