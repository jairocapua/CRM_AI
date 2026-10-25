import type { Metadata } from "next";
import { TextCursorInputIcon } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";

/**
 * Placeholder for the settings section nav's Custom fields link (P9-T02, as
 * [P7-T42]), so neither a prefetch nor a click lands on a 404. P9-T04
 * replaces it in place with the custom fields manager.
 */
export const metadata: Metadata = { title: "Custom fields" };

export default function CustomFieldsSettingsPage() {
  return (
    <>
      <PageHeader
        title="Custom fields"
        description="Extra fields on contacts and deals."
      />
      <EmptyState
        icon={TextCursorInputIcon}
        title="Custom fields coming up"
        description="Adding, ordering and removing fields lands in Phase 9."
      />
    </>
  );
}
