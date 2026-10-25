import type { Metadata } from "next";
import { SquareKanbanIcon } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";

/**
 * Placeholder for the settings section nav's Pipelines link (P9-T02, as
 * [P7-T42]), so neither a prefetch nor a click lands on a 404. P9-T05
 * replaces it in place with the pipelines and stages manager.
 */
export const metadata: Metadata = { title: "Pipelines" };

export default function PipelinesSettingsPage() {
  return (
    <>
      <PageHeader
        title="Pipelines"
        description="Deal pipelines and their stages."
      />
      <EmptyState
        icon={SquareKanbanIcon}
        title="Pipelines coming up"
        description="Creating pipelines and arranging their stages lands in Phase 9."
      />
    </>
  );
}
