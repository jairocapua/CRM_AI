import { WorkflowIcon } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";

export const metadata = { title: "Automation" };

export default function AutomationPage() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <PageHeader
        title="Automation"
        description="Workflows that follow up so you do not have to."
      />
      <EmptyState
        icon={WorkflowIcon}
        title="No workflows yet"
        description="Build a workflow on the drag-and-drop canvas."
      />
    </div>
  );
}
