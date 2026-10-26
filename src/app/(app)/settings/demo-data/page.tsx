import type { Metadata } from "next";

import { DemoDataPanel } from "@/components/modules/settings/demo-data-panel";
import { PageHeader } from "@/components/common/page-header";

export const metadata: Metadata = { title: "Demo Data" };

export default function DemoDataPage() {
  return (
    <>
      <PageHeader
        title="Demo data"
        description="Reseed the workspace, check referential integrity, and simulate a slow or failing network."
      />
      <DemoDataPanel />
    </>
  );
}
