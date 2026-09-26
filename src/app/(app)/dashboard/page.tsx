import { LayoutDashboardIcon } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";

export const metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <PageHeader
        title="Dashboard"
        description="Pipeline, revenue and activity at a glance."
      />
      <EmptyState
        icon={LayoutDashboardIcon}
        title="No data yet"
        description="Seed the demo workspace to populate KPIs, charts and the activity feed."
      />
    </div>
  );
}
