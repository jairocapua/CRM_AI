"use client";

import type {
  KeyboardEventHandler,
  PointerEventHandler,
  ReactNode,
} from "react";
import Link from "next/link";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { differenceInDays } from "date-fns";

import type { Contact, Opportunity, Tag, User } from "@/types";
import * as api from "@/lib/api";
import { apiNow } from "@/lib/api";
import { Money } from "@/components/common/money";
import { TagBadge } from "@/components/modules/contacts/tag-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { fullName, initials, toDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { OpportunityStatusBadge } from "./opportunity-status-badge";

export function DealCardBody({
  opportunity,
  contact,
  owner,
  tags,
  href,
  handle,
  className,
}: {
  opportunity: Opportunity;
  contact?: Contact;
  owner?: User;
  tags: Tag[];
  href?: string;
  /** The board card's drag control, laid over the whole card. */
  handle?: ReactNode;
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
        "relative gap-2 rounded-md p-3 transition-colors hover:border-ring/60",
        // Tinted, not faded: opacity took the card's small text under
        // 4.5:1 contrast in dark mode.
        isClosed && "bg-muted/50",
        className,
      )}
    >
      {handle}
      <div className="flex items-start justify-between gap-2">
        {href ? (
          // The title is the card's link, a tab stop of its own after the
          // drag control; it sits above that control (z-10) so a click on it
          // opens the deal, and it stops the click from double-firing.
          <Link
            href={href}
            onClick={(event) => event.stopPropagation()}
            className="relative z-10 text-sm leading-snug font-medium hover:underline"
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
 * Keyboard and screen readers get two separate tab stops, never one control
 * nested in another: first the drag control, a transparent button laid over
 * the whole card (`aria-roledescription="draggable deal"`, named "Move
 * <deal>"), which takes Space or Enter, the arrow keys, and Space, Enter or
 * Escape (dnd-kit's KeyboardSensor); then the deal's title link, which
 * opens it. The pointer listener stays on the whole card, so a mouse drags
 * from anywhere on it, as before.
 *
 * Dead deals are shown but pinned in place. Dragging one into another column
 * would resurrect it: `api.opportunities.move` recomputes `status` from a new
 * destination stage, and since no seeded stage carries `isLost`, every other
 * column reads as "open" (clearing `closedAt` and the `lostReason`). A
 * same-column reorder keeps the status (P7-T64), but the pin stays simple.
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
  const dead = api.opportunities.isDeadDeal(opportunity);
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: opportunity.id, disabled: dead });
  // dnd-kit types its listeners as bare Functions; they are React handlers.
  const onPointerDown = listeners?.onPointerDown as
    PointerEventHandler<HTMLDivElement> | undefined;
  const onKeyDown = listeners?.onKeyDown as
    KeyboardEventHandler<HTMLButtonElement> | undefined;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(!dead && "touch-none", isDragging && "opacity-40")}
      // A mouse click anywhere but the title link opens the deal too; the
      // link is the keyboard's way in.
      onClick={() => onOpen(opportunity)}
      onPointerDown={onPointerDown}
    >
      <DealCardBody
        opportunity={opportunity}
        contact={contact}
        owner={owner}
        tags={tags}
        href={`/opportunities/${opportunity.id}`}
        className={dead ? undefined : "cursor-grab active:cursor-grabbing"}
        handle={
          dead ? null : (
            <button
              type="button"
              ref={setActivatorNodeRef}
              {...attributes}
              aria-roledescription="draggable deal"
              aria-label={`Move ${opportunity.name}`}
              data-deal-drag={opportunity.id}
              onKeyDown={onKeyDown}
              className="absolute inset-0 cursor-[inherit] rounded-[inherit] outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
            />
          )
        }
      />
    </div>
  );
}
