"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import type {
  Contact,
  CurrencyCode,
  Opportunity,
  PipelineStage,
  Tag,
  User,
} from "@/types";
import type { StageRollup } from "@/lib/api";
import { Money } from "@/components/common/money";
import { TAG_DOT_CLASSES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { stageDroppableId } from "./board-dnd";
import { DealCard } from "./deal-card";

export function BoardColumn({
  stage,
  opportunities,
  rollup,
  currency,
  contactsById,
  usersById,
  tagsById,
  onOpen,
}: {
  stage: PipelineStage;
  opportunities: Opportunity[];
  rollup: StageRollup | undefined;
  currency: CurrencyCode;
  contactsById: Map<string, Contact>;
  usersById: Map<string, User>;
  tagsById: Map<string, Tag>;
  onOpen: (opportunity: Opportunity) => void;
}) {
  // The column is a drop target in its own right, so an empty stage still
  // accepts a card — `SortableContext` alone only registers the items.
  const { setNodeRef, isOver } = useDroppable({
    id: stageDroppableId(stage.id),
  });

  return (
    <section
      className="flex w-72 shrink-0 flex-col gap-2"
      aria-label={`${stage.name} stage`}
    >
      <header className="flex flex-col gap-1 rounded-md border bg-muted/40 px-3 py-2">
        <div className="flex items-center gap-2">
          <span
            className={cn("size-2 rounded-full", TAG_DOT_CLASSES[stage.color])}
          />
          <h2 className="truncate text-sm font-medium">{stage.name}</h2>
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">
            {rollup?.count ?? 0}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <Money
            cents={rollup?.total ?? 0}
            currency={currency}
            compact
            className="text-sm font-semibold"
          />
          <span
            className="text-[11px] text-muted-foreground"
            title={`Weighted at ${stage.probability}% probability`}
          >
            <Money
              cents={rollup?.weighted ?? 0}
              currency={currency}
              compact
              className="text-[11px]"
            />{" "}
            @ {stage.probability}%
          </span>
        </div>
      </header>

      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-24 flex-1 flex-col gap-2 rounded-md p-1 transition-colors",
          isOver && "bg-accent/60 ring-1 ring-ring/40",
        )}
      >
        <SortableContext
          items={opportunities.map((o) => o.id)}
          strategy={verticalListSortingStrategy}
        >
          {opportunities.map((opportunity) => (
            <DealCard
              key={opportunity.id}
              opportunity={opportunity}
              contact={contactsById.get(opportunity.contactId)}
              owner={
                opportunity.ownerId
                  ? usersById.get(opportunity.ownerId)
                  : undefined
              }
              tags={opportunity.tagIds
                .map((id) => tagsById.get(id))
                .filter((tag): tag is Tag => Boolean(tag))}
              onOpen={onOpen}
            />
          ))}
        </SortableContext>

        {opportunities.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            No deals here.
          </p>
        ) : null}
      </div>
    </section>
  );
}
