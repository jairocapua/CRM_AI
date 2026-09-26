import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { DbGate } from "@/components/providers/db-gate";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <DbGate>
      <SidebarProvider>
        <AppSidebar />
        {/* min-w-0: a wide descendant must scroll inside, not widen the page. */}
        <SidebarInset className="min-w-0">
          <AppHeader />
          {/*
            min-h-0 matters: descendants such as the conversations three-pane
            and the workflow canvas size themselves against this flex column,
            and a missing min-h-0 anywhere in the chain silently collapses them
            to zero height.
          */}
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </DbGate>
  );
}
