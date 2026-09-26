"use client";

import Link from "next/link";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { differenceInDays } from "date-fns";

import type { Contact, Opportunity, Tag, User } from "@/types";
import { apiNow } from "@/lib/api";
import { Money } from "@/components/common/money";
import { TagBadge } from "@/components/modules/contacts/tag-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { fullName, initials, toDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { isDeadDeal } from "./board-dnd";
import { OpportunityStatusBadge } from "./opportunity-status-badge";

export function DealCardBody({
  opportunity,
  contact,
  owner,
  tags,
  href,
  className,
}: {
  opportunity: Opportunity;
  contact?: Contact;
  owner?: User;
  tags: Tag[];
  href?: string;
  className?: string;
}) {
  // Days-in-stage reads the demo clock, not the wall clock — fixtures are
  // anchored to a fixed reference date and `new Date()` would drift off them.
  const daysInStage = differenceInDays(
    apiNow(),
    toDate(opportunity.stageEnteredAt),
  );
  const isClosed = opportunity.status !== "open";
  // Only a live deal can be overdue — a closed one's date is history.
  const closesIn =
    opportunity.expectedCloseAt && !isClosed
      ? differenceInDays(toDate(opportunity.expectedCloseAt), apiNow())
      : null;

  return (
    <Card
      size="sm"
      className={cn(
        "gap-2 rounded-md p-3 transition-colors hover:border-ring/60",
        isClosed && "opacity-70",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        {href ? (
          // The card container owns the drag listeners, so the title carries
          // the keyboard-reachable link and stops its click from double-firing.
          <Link
            href={href}
            onClick={(event) => event.stopPropagation()}
            className="text-sm leading-snug font-medium hover:underline"
          >
            {opportunity.name}
          </Link>
        ) : (
          <span className="text-sm leading-snug font-medium">
            {opportunity.name}
          </span>
        )}
        {isClosed ? (
          <OpportunityStatusBadge
            status={opportunity.status}
            className="shrink-0 text-[10px]"
          />
        ) : null}
      </div>

      <Money
        cents={opportunity.value}
        currency={opportunity.currency}
        className="text-sm font-semibold"
      />

      {contact ? (
        <span className="truncate text-xs text-muted-foreground">
          {fullName(contact)}
        </span>
      ) : null}

      {tags.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {tags.slice(0, 2).map((tag) => (
            <TagBadge key={tag.id} tag={tag} className="text-[10px]" />
          ))}
          {tags.length > 2 ? (
            <span className="text-[10px] text-muted-foreground">
              +{tags.length - 2}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="text-[11px] text-muted-foreground">
          {daysInStage <= 0 ? "Today" : `${daysInStage}d in stage`}
          {closesIn !== null ? (
            <>
              {" · "}
              <span
                className={cn(closesIn < 0 && "font-medium text-destructive")}
              >
                {closesIn < 0
                  ? `${Math.abs(closesIn)}d overdue`
                  : `closes in ${closesIn}d`}
              </span>
            </>
          ) : null}
        </span>
        {owner ? (
          <Avatar className="size-5">
            <AvatarFallback className="text-[9px]">
              {initials(owner.firstName, owner.lastName)}
            </AvatarFallback>
          </Avatar>
        ) : null}
      </div>
    </Card>
  );
}

/**
 * A draggable board card. The pointer sensor uses a small distance threshold,
 * so a click that never moves opens the deal instead of starting a drag.
 *
 * Dead deals are shown but pinned in place — see `isDeadDeal` for why dragging
 * one would quietly bring it back to life.
 */
export function DealCard({
  opportunity,
  contact,
  owner,
  tags,
  onOpen,
}: {
  opportunity: Opportunity;
  contact?: Contact;
  owner?: User;
  tags: Tag[];
  onOpen: (opportunity: Opportunity) => void;
}) {
  const dead = isDeadDeal(opportunity);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: opportunity.id, disabled: dead });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("touch-none", isDragging && "opacity-40")}
      onClick={() => onOpen(opportunity)}
      {...attributes}
      {...listeners}
    >
      <DealCardBody
        opportunity={opportunity}
        contact={contact}
        owner={owner}
        tags={tags}
        href={`/opportunities/${opportunity.id}`}
        className={dead ? undefined : "cursor-grab active:cursor-grabbing"}
      />
    </div>
  );
}
