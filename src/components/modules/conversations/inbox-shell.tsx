"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { useParams } from "next/navigation";
import { useDefaultLayout } from "react-resizable-panels";

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { ContactPanel } from "./contact-panel";
import {
  DEFAULT_INBOX_FILTERS,
  InboxList,
  type InboxFilters,
} from "./inbox-list";

interface InboxContextValue {
  isMobile: boolean;
  detailsOpen: boolean;
  toggleDetails: () => void;
}

const InboxContext = createContext<InboxContextValue | null>(null);

export function useInbox(): InboxContextValue {
  const value = useContext(InboxContext);
  if (!value) throw new Error("useInbox must be used inside <InboxShell>.");
  return value;
}

/**
 * The conversations frame: inbox list | thread | contact details.
 *
 * It lives in the route's layout, so moving between threads swaps only the
 * middle pane — the list keeps its scroll position. Inbox filters live here
 * too, so they also survive the list unmounting (mobile, breakpoint changes).
 *
 * Pane sizes persist through `useDefaultLayout`, which reads localStorage while
 * rendering. That is safe only because `DbGate` never renders the app subtree
 * on the server; if that ever changes, this needs a cookie-backed storage.
 * The details pane is conditional, so `panelIds` tells the hook which layout
 * to restore for each combination.
 *
 * Below `md` there is no room for panes: the route decides the one screen
 * shown (list at /conversations, thread at /conversations/[id]) and details
 * open in a sheet.
 */
export function InboxShell({ children }: { children: React.ReactNode }) {
  const params = useParams<{ id?: string }>();
  const selectedId = typeof params.id === "string" ? params.id : undefined;
  const isMobile = useIsMobile();
  const [filters, setFilters] = useState<InboxFilters>(DEFAULT_INBOX_FILTERS);

  // Unset until toggled: open beside the thread on desktop, closed on mobile
  // (where it is a sheet that would otherwise cover the thread on arrival).
  const [showDetails, setShowDetails] = useState<boolean | null>(null);
  const detailsOpen = Boolean(selectedId) && (showDetails ?? !isMobile);
  const toggleDetails = useCallback(
    () => setShowDetails(!detailsOpen),
    [detailsOpen],
  );
  const panelIds = useMemo(
    () => (detailsOpen ? ["inbox", "thread", "details"] : ["inbox", "thread"]),
    [detailsOpen],
  );
  const layout = useDefaultLayout({ id: "nimbus-inbox", panelIds });

  const context = useMemo(
    () => ({ isMobile, detailsOpen, toggleDetails }),
    [isMobile, detailsOpen, toggleDetails],
  );

  if (isMobile) {
    return (
      <InboxContext.Provider value={context}>
        <div className="flex h-[calc(100svh-3.5rem)] min-h-0 flex-col">
          {selectedId ? (
            children
          ) : (
            <InboxList
              selectedId={undefined}
              filters={filters}
              onFiltersChange={setFilters}
            />
          )}
        </div>
        <Sheet open={detailsOpen} onOpenChange={(open) => setShowDetails(open)}>
          <SheetContent side="right" className="w-full max-w-sm p-0">
            <SheetHeader className="border-b">
              <SheetTitle>Contact details</SheetTitle>
            </SheetHeader>
            {selectedId ? <ContactPanel conversationId={selectedId} /> : null}
          </SheetContent>
        </Sheet>
      </InboxContext.Provider>
    );
  }

  return (
    <InboxContext.Provider value={context}>
      {/*
        The shell must be exactly viewport-tall (minus the 3.5rem header) and
        clip, so the thread scrolls inside its pane rather than growing the
        page. An explicit-height wrapper around the group (which is `h-full`)
        is the arrangement verified to hold in the browser.
      */}
      <div className="h-[calc(100svh-3.5rem)] min-h-0 overflow-hidden">
        <ResizablePanelGroup
          orientation="horizontal"
          defaultLayout={layout.defaultLayout}
          onLayoutChanged={layout.onLayoutChanged}
        >
          <ResizablePanel
            id="inbox"
            defaultSize="340px"
            minSize="260px"
            maxSize="480px"
          >
            <InboxList
              selectedId={selectedId}
              filters={filters}
              onFiltersChange={setFilters}
            />
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel id="thread" minSize="360px">
            {children}
          </ResizablePanel>
          {detailsOpen && selectedId ? (
            <>
              <ResizableHandle />
              <ResizablePanel
                id="details"
                defaultSize="300px"
                minSize="240px"
                maxSize="420px"
              >
                <ContactPanel conversationId={selectedId} />
              </ResizablePanel>
            </>
          ) : null}
        </ResizablePanelGroup>
      </div>
    </InboxContext.Provider>
  );
}
