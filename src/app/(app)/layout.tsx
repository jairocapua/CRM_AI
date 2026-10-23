import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppHeader } from "@/components/layout/app-header";
import { DbGate } from "@/components/providers/db-gate";
import { UnsavedChangesProvider } from "@/components/providers/unsaved-changes";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <DbGate>
      {/* Around the sidebar and the page: its links ask before a page with
          unsaved edits is left. */}
      <UnsavedChangesProvider>
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
      </UnsavedChangesProvider>
    </DbGate>
  );
}
