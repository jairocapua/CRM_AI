import { PageHeader } from "@/components/common/page-header";
import { OpportunitiesBoard } from "@/components/modules/opportunities/opportunities-board";

export const metadata = { title: "Opportunities" };

export default function OpportunitiesPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
      <PageHeader
        title="Opportunities"
        description="Deals moving through your pipelines."
      />
      <OpportunitiesBoard />
    </div>
  );
}
