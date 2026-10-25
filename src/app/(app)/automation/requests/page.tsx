import type { Metadata } from "next";

import { PageHeader } from "@/components/common/page-header";
import { AutomationRequestForm } from "@/components/modules/automation/automation-request-form";
import { AutomationRequestList } from "@/components/modules/automation/automation-request-list";

/**
 * `/automation/requests`, linked from the automation list's "Request an
 * automation". Staff ask the developer for an automation here and follow
 * each request's status and reply. The developer owns status: nothing on
 * this page changes it.
 */
export const metadata: Metadata = { title: "Automation requests" };

export default function AutomationRequestsPage() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <PageHeader
        title="Automation requests"
        description="Ask your developer for a new automation, and see where each request stands."
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <AutomationRequestForm />
        <AutomationRequestList />
      </div>
    </div>
  );
}
