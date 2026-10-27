"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { TargetIcon } from "lucide-react";
import { toast } from "sonner";

import type { Contact, Opportunity, User } from "@/types";
import * as api from "@/lib/api";
import { errorMessage, invalidate, loadErrorOf, useResource } from "@/lib/api";
import { EmptyState } from "@/components/common/empty-state";
import { LoadError } from "@/components/common/load-error";
import { Money } from "@/components/common/money";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/lib/utils";
import {
  boardDragAnnouncements,
  boardDropTarget,
  DEAL_DRAG_INSTRUCTIONS,
} from "./board-dnd";
import { BoardColumn } from "./board-column";
import { BoardToolbar } from "./board-toolbar";
import { DealCardBody } from "./deal-card";
import { OpportunityFormSheet } from "./opportunity-form-sheet";

const NO_DEALS: Opportunity[] = [];

export function OpportunitiesBoard() {
  const router = useRouter();

  const pipelines = useResource("pipelines", () => api.pipelines.list());
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const activePipeline =
    (pipelines.data ?? []).find((p) => p.id === pipelineId) ??
    (pipelines.data ?? []).find((p) => p.isDefault) ??
    pipelines.data?.[0];

  const board = useResource(
    "opportunities",
    () =>
      activePipeline
        ? api.opportunities.listForBoard(activePipeline.id)
        : Promise.resolve(NO_DEALS),
    activePipeline?.id ?? "none",
  );

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 250);
  const [showLost, setShowLost] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  /**
   * The optimistic board order, tagged with the server array it was derived
   * from. When a refetch produces a new array the tag stops matching and the
   * override is dropped — server truth wins without an effect resetting state.
   */
  const [override, setOverride] = useState<{
    from: Opportunity[];
    items: Opportunity[];
  } | null>(null);

  const serverDeals = board.data ?? NO_DEALS;
  const deals = override?.from === serverDeals ? override.items : serverDeals;

  const contactIds = useMemo(
    () => [...new Set(deals.map((d) => d.contactId))].sort(),
    [deals],
  );
  const contacts = useResource(
    "contacts",
    () =>
      contactIds.length > 0
        ? api.contacts.list({ ids: contactIds })
        : Promise.resolve({
            rows: [] as Contact[],
            total: 0,
            page: 1,
            pageSize: 0,
            pageCount: 1,
          }),
    contactIds.join(","),
  );
  const users = useResource("users", () => api.users.list());
  const tags = useResource("tags", () => api.tags.list());
  const tagsError = loadErrorOf(tags);
  const pipelinesError = loadErrorOf(pipelines);
  const boardError = loadErrorOf(board);

  const contactsById = useMemo(
    () => new Map((contacts.data?.rows ?? []).map((c) => [c.id, c])),
    [contacts.data],
  );
  const usersById = useMemo(
    () => new Map((users.data ?? []).map((u) => [u.id, u])),
    [users.data],
  );
  const tagsById = useMemo(
    () => new Map((tags.data ?? []).map((t) => [t.id, t])),
    [tags.data],
  );

  // Search filters what is shown, never what is stored — a drag still commits
  // against the full column ordering below.
  const searched = useMemo(() => {
    const needle = debouncedSearch.trim().toLowerCase();
    if (!needle) return deals;
    return deals.filter((deal) => {
      const contact = contactsById.get(deal.contactId);
      return (
        deal.name.toLowerCase().includes(needle) ||
        (contact
          ? `${contact.firstName} ${contact.lastName}`
              .toLowerCase()
              .includes(needle)
          : false)
      );
    });
  }, [deals, debouncedSearch, contactsById]);

  /**
   * Won deals always show: they live in the pipeline's terminal stage, so
   * hiding them would leave the column the whole funnel aims at permanently
   * empty. Only dead deals — lost and abandoned, which sit in ordinary
   * mid-funnel columns — are hidden by default.
   */
  const visible = useMemo(
    () =>
      showLost
        ? searched
        : searched.filter((d) => !api.opportunities.isDeadDeal(d)),
    [searched, showLost],
  );

  /**
   * The money always describes live pipeline. A dead deal can be displayed,
   * but counting one would mean forecasting business already lost — so the
   * rollups read `live`, not `visible`.
   */
  const live = useMemo(
    () => searched.filter((d) => !api.opportunities.isDeadDeal(d)),
    [searched],
  );

  const stages = useMemo(() => activePipeline?.stages ?? [], [activePipeline]);
  // What a screen reader hears during a drag: the deal, the stage it is
  // over and its position there among the cards shown (board-dnd.ts), so
  // hidden lost deals and deals the search filters out are not counted.
  // The drop itself (handleDragEnd) still computes against every deal.
  const accessibility = useMemo(
    () => ({
      announcements: boardDragAnnouncements(visible, stages),
      screenReaderInstructions: { draggable: DEAL_DRAG_INSTRUCTIONS },
    }),
    [visible, stages],
  );
  const rollups = useMemo(
    () => api.opportunities.rollupByStage(live, stages),
    [live, stages],
  );
  const boardTotal = useMemo(
    () =>
      [...rollups.values()].reduce(
        (acc, r) => ({
          total: acc.total + r.total,
          weighted: acc.weighted + r.weighted,
        }),
        { total: 0, weighted: 0 },
      ),
    [rollups],
  );

  const sensors = useSensors(
    // A small threshold keeps a plain click on a card from starting a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const activeDeal = deals.find((d) => d.id === activeId);

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const dragged = deals.find((d) => d.id === active.id);
    if (!dragged) return;

    // `index` is in `api.opportunities.move`'s terms: it splices into the
    // destination column with the dragged deal already removed, so the
    // optimistic order below is computed the same way.
    const target = boardDropTarget(deals, dragged.id, String(over.id));
    if (!target || target.inPlace) return;
    const { stageId: targetStageId, index: insertAt } = target;
    const column = deals
      .filter((d) => d.stageId === targetStageId && d.id !== dragged.id)
      .sort((a, b) => a.position - b.position);

    const reordered = [...column];
    reordered.splice(insertAt, 0, { ...dragged, stageId: targetStageId });
    const positions = new Map(reordered.map((d, index) => [d.id, index]));

    setOverride({
      from: serverDeals,
      items: deals.map((deal) => {
        if (deal.id === dragged.id) {
          return {
            ...deal,
            stageId: targetStageId,
            position: positions.get(deal.id) ?? insertAt,
          };
        }
        const position = positions.get(deal.id);
        return position === undefined ? deal : { ...deal, position };
      }),
    });

    try {
      await api.opportunities.move(dragged.id, {
        stageId: targetStageId,
        position: insertAt,
      });
    } catch (error) {
      setOverride(null);
      toast.error("Could not move that deal. Put it back where it was.", {
        description: errorMessage(error, "Please try again."),
      });
    }
  }

  if (pipelinesError && !pipelines.isLoading) {
    return (
      <LoadError
        title="Could not load pipelines"
        message={pipelinesError.message}
        onRetry={pipelines.refetch}
        retrying={pipelines.isRefreshing}
      />
    );
  }

  if (pipelines.isLoading || !pipelines.data) {
    return <Skeleton className="h-96 w-full" />;
  }

  if (!activePipeline) {
    return (
      <EmptyState
        icon={TargetIcon}
        title="No pipelines yet"
        description="Create one in Settings, under Pipelines."
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <BoardToolbar
        pipelines={pipelines.data}
        pipelineId={activePipeline.id}
        onPipelineChange={(id) => {
          setPipelineId(id);
          setOverride(null);
        }}
        search={search}
        onSearchChange={setSearch}
        showLost={showLost}
        onShowLostChange={setShowLost}
        onNew={() => setFormOpen(true)}
      />

      <p className="text-sm text-muted-foreground">
        {boardError ? (
          "Live deals and their value show once the deals load."
        ) : (
          <>
            {live.length} live deals ·{" "}
            <Money
              cents={boardTotal.total}
              currency={activePipeline.currency}
              className="font-medium text-foreground"
            />{" "}
            pipeline value ·{" "}
            <Money
              cents={boardTotal.weighted}
              currency={activePipeline.currency}
              className="font-medium text-foreground"
            />{" "}
            weighted forecast
          </>
        )}
      </p>

      {/* The contacts table's rule: only once the board is on screen, never
          above its skeleton. The columns and cards stay, without tags. */}
      {!board.isLoading && !boardError && tagsError ? (
        <LoadError
          title="Could not load tags"
          message={tagsError.message}
          onRetry={() => invalidate("tags")}
          retrying={tags.isRefreshing}
        />
      ) : null}

      {board.isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : boardError ? (
        <LoadError
          title="Could not load deals"
          message={boardError.message}
          onRetry={() => {
            board.refetch();
            // One fault, one alert: the tags alert is hidden while this
            // one shows, so re-read the tags too if they failed.
            if (tagsError) invalidate("tags");
          }}
          retrying={board.isRefreshing}
        />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          accessibility={accessibility}
          onDragStart={handleDragStart}
          onDragEnd={(event) => void handleDragEnd(event)}
          onDragCancel={() => setActiveId(null)}
        >
          {/* Phones snap a column to the left edge (snap-start on each
              column); md and up scroll freely as before. Snap is off while a
              card is dragged: mandatory snap would re-snap every small step
              of dnd-kit's auto-scroll to a whole column. */}
          <div
            className={cn(
              "flex flex-1 gap-3 overflow-x-auto pb-4",
              activeId === null && "snap-x snap-mandatory md:snap-none",
            )}
          >
            {stages.map((stage) => (
              <BoardColumn
                key={stage.id}
                stage={stage}
                opportunities={visible
                  .filter((d) => d.stageId === stage.id)
                  .sort((a, b) => a.position - b.position)}
                rollup={rollups.get(stage.id)}
                currency={activePipeline.currency}
                contactsById={contactsById}
                usersById={usersById}
                tagsById={tagsById}
                onOpen={(opportunity) =>
                  router.push(`/opportunities/${opportunity.id}`)
                }
              />
            ))}
          </div>

          <DragOverlay>
            {activeDeal ? (
              <DealCardBody
                opportunity={activeDeal}
                contact={contactsById.get(activeDeal.contactId)}
                owner={
                  activeDeal.ownerId
                    ? usersById.get(activeDeal.ownerId)
                    : undefined
                }
                tags={activeDeal.tagIds
                  .map((id) => tagsById.get(id))
                  .filter((tag) => tag !== undefined)}
                className="w-72 rotate-2 shadow-lg"
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* The board only creates; editing a deal happens on its detail page. */}
      <OpportunityFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        opportunity={null}
        pipelines={pipelines.data}
        defaultPipelineId={activePipeline.id}
        users={users.data ?? ([] as User[])}
      />
    </div>
  );
}
