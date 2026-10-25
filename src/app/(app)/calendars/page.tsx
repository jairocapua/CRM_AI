import { Suspense } from "react";

import { PageHeader } from "@/components/common/page-header";
import {
  CalendarsWorkspace,
  CalendarsWorkspaceSkeleton,
} from "@/components/modules/calendars/calendars-workspace";

export const metadata = { title: "Calendars" };

/**
 * `/calendars?view=month|week|day&date=YYYY-MM-DD`.
 *
 * This page does not read its `searchParams` prop, so the route stays static
 * (prerendered). The view and date are read on the client with
 * `useSearchParams`, and Next requires a `<Suspense>` boundary around that on
 * a prerendered route: without one, `next build` fails with "Missing Suspense
 * boundary with useSearchParams". Reading them here instead would make every
 * step a server render, and "today" comes from the demo clock, which exists
 * only on the client.
 */
export default function CalendarsPage() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
      <PageHeader
        title="Calendars"
        description="Appointments, availability and booking links."
      />
      <Suspense fallback={<CalendarsWorkspaceSkeleton />}>
        <CalendarsWorkspace />
      </Suspense>
    </div>
  );
}
