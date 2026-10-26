import type { Metadata } from "next";

import { PageHeader } from "@/components/common/page-header";
import { BusinessSettings } from "@/components/modules/settings/business-settings";

export const metadata: Metadata = { title: "Business" };

export default function BusinessSettingsPage() {
  return (
    <>
      <PageHeader
        title="Business"
        description="The business your contacts deal with, and the time zone it works in."
      />
      <BusinessSettings />
    </>
  );
}
