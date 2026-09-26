import { CalendarDaysIcon } from "lucide-react";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";

export const metadata = { title: "Calendars" };

export default function CalendarsPage() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      <PageHeader
        title="Calendars"
        description="Appointments, availability and booking links."
      />
      <EmptyState
        icon={CalendarDaysIcon}
        title="No appointments yet"
        description="Bookings will show up across month, week and day views."
      />
    </div>
  );
}
