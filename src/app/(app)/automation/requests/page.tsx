import type { Metadata } from "next";
import { MessageSquarePlusIcon } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";

/**
 * Placeholder for the automation list's "Request an automation" link
 * (P8-T03), so neither the link's prefetch nor a click lands on a 404, as for
 * Team settings (DECISIONS P7-T42). P8-T08 replaces it in place with the real
 * request list and form.
 */
export const metadata: Metadata = { title: "Automation requests" };

export default function AutomationRequestsPage() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <PageHeader
        title="Automation requests"
        description="Ask your developer for a new automation."
      />
      <EmptyState
        icon={MessageSquarePlusIcon}
        title="Automation requests are coming soon"
        description="You cannot send a request from here yet."
      />
    </div>
  );
}
