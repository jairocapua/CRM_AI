import type { Metadata } from "next";
import { TagIcon } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";

/**
 * Placeholder for the settings section nav's Tags link (P9-T02, as
 * [P7-T42]), so neither a prefetch nor a click lands on a 404. P9-T06
 * replaces it in place with the tags manager.
 */
export const metadata: Metadata = { title: "Tags" };

export default function TagsSettingsPage() {
  return (
    <>
      <PageHeader
        title="Tags"
        description="The tags that sort your contacts."
      />
      <EmptyState
        icon={TagIcon}
        title="Tags coming up"
        description="Renaming, recolouring and merging tags lands in Phase 9."
      />
    </>
  );
}
