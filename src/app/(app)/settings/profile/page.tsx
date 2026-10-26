import type { Metadata } from "next";

import { PageHeader } from "@/components/common/page-header";
import { ProfileSettings } from "@/components/modules/settings/profile-settings";

export const metadata: Metadata = { title: "Profile" };

export default function ProfileSettingsPage() {
  return (
    <>
      <PageHeader
        title="Profile"
        description="Your name, contact details and time zone."
      />
      <ProfileSettings />
    </>
  );
}
