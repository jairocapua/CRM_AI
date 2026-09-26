import type { Metadata } from "next";

import { DemoDataPanel } from "@/components/modules/settings/demo-data-panel";
import { PageHeader } from "@/components/common/page-header";

export const metadata: Metadata = { title: "Demo Data" };

export default function DemoDataPage() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <PageHeader
        title="Demo data"
        description="Reseed the workspace, check referential integrity, and simulate a slow or failing network."
      />
      <DemoDataPanel />
    </div>
  );
}
