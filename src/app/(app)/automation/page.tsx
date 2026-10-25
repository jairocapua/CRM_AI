import { MessageSquarePlusIcon } from "lucide-react";

import { PageHeader } from "@/components/common/page-header";
import { AutomationList } from "@/components/modules/automation/automation-list";
import { LinkButton } from "@/components/ui/button";

export const metadata = { title: "Automation" };

/**
 * `/automation`: the automations a developer has built for this workspace,
 * grouped by folder. They are code, so this page only shows them; asking for
 * a new one goes through `/automation/requests`.
 */
export default function AutomationPage() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <PageHeader
        title="Automation"
        description="Follow-ups that run on their own, built for you by your developer. Need another? Ask for it."
        actions={
          <LinkButton href="/automation/requests">
            <MessageSquarePlusIcon data-icon="inline-start" />
            Request an automation
          </LinkButton>
        }
      />
      <AutomationList />
    </div>
  );
}
