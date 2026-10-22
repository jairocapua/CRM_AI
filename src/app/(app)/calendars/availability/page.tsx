import { Suspense } from "react";

import { PageHeader } from "@/components/common/page-header";
import {
  AvailabilityWorkspace,
  AvailabilityWorkspaceSkeleton,
} from "@/components/modules/calendars/availability-workspace";

export const metadata = { title: "Availability" };

/**
 * `/calendars/availability?calendar=<slug>`: one calendar's weekly hours and
 * booking rules.
 *
 * Like `/calendars`, this page does not read its `searchParams` prop, so the
 * route stays static (prerendered); the workspace reads the calendar on the
 * client with `useSearchParams`, which Next requires inside a `<Suspense>`
 * boundary on a prerendered route (without one, `next build` fails with
 * "Missing Suspense boundary with useSearchParams").
 */
export default function AvailabilityPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
      <PageHeader
        title="Availability"
        description="Weekly hours and booking rules for each calendar."
      />
      <Suspense fallback={<AvailabilityWorkspaceSkeleton />}>
        <AvailabilityWorkspace />
      </Suspense>
    </div>
  );
}
