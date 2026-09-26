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
import { useResource } from "@/lib/api";
import { EmptyState } from "@/components/common/empty-state";
import { Money } from "@/components/common/money";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { isDeadDeal, stageIdFromDroppable } from "./board-dnd";
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
    () => (showLost ? searched : searched.filter((d) => !isDeadDeal(d))),
    [searched, showLost],
  );

  /**
   * The money always describes live pipeline. A dead deal can be displayed,
   * but counting one would mean forecasting business already lost — so the
   * rollups read `live`, not `visible`.
   */
  const live = useMemo(
    () => searched.filter((d) => !isDeadDeal(d)),
    [searched],
  );

  const stages = useMemo(() => activePipeline?.stages ?? [], [activePipeline]);
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

    const overId = String(over.id);
    const overDeal = deals.find((d) => d.id === overId);
    const targetStageId = stageIdFromDroppable(overId) ?? overDeal?.stageId;
    if (!targetStageId) return;

    // Mirror `api.opportunities.move` exactly: it splices into the destination
    // column with the dragged deal already removed, so compute the index the
    // same way or the optimistic order and the stored order disagree.
    const column = deals
      .filter((d) => d.stageId === targetStageId && d.id !== dragged.id)
      .sort((a, b) => a.position - b.position);
    const overIndex = overDeal
      ? column.findIndex((d) => d.id === overDeal.id)
      : -1;
    const insertAt = overIndex < 0 ? column.length : overIndex;

    if (dragged.stageId === targetStageId && dragged.position === insertAt) {
      return;
    }

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
    } catch {
      setOverride(null);
      toast.error("Could not move that deal. Put it back where it was.");
    }
  }

  if (pipelines.isLoading || !pipelines.data) {
    return <Skeleton className="h-96 w-full" />;
  }

  if (!activePipeline) {
    return (
      <EmptyState
        icon={TargetIcon}
        title="No pipelines yet"
        description="Pipeline management isn't built yet — the seeded workspace ships with three."
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
      </p>

      {board.isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={(event) => void handleDragEnd(event)}
          onDragCancel={() => setActiveId(null)}
        >
          <div className="flex flex-1 gap-3 overflow-x-auto pb-4">
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
