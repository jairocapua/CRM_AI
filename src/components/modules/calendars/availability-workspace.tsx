"use client";

import { useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeftIcon, CalendarXIcon } from "lucide-react";

import * as api from "@/lib/api";
import { useResource } from "@/lib/api";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { LoadError } from "@/components/common/load-error";
import {
  DISCARD_QUESTION,
  useLeaveGuard,
  useUnsavedChanges,
} from "@/components/providers/unsaved-changes";
import { LinkButton } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { AvailabilityForm } from "./availability-form";
import { CalendarName } from "./calendar-name";

const SELECT_ID = "availability-calendar";

/** The question asked before a calendar switch drops unsaved edits: whose
 *  edits, and which calendar the viewer chose. */
interface LeaveQuestion {
  open: boolean;
  from: string;
  to: { slug: string; name: string };
}

/** Shows another calendar's editor by rewriting `?calendar=` in place. */
function showCalendar(slug: string) {
  window.history.replaceState(
    null,
    "",
    `?calendar=${encodeURIComponent(slug)}`,
  );
}

function leaveDescription({ from, to }: LeaveQuestion): string {
  return `Your changes to ${from} have not been saved. Switching to ${to.name} will discard them.`;
}

/**
 * The availability page body: a way back to the calendars, a calendar picker
 * and that calendar's editor.
 *
 * The calendar is chosen by its slug in `?calendar=`, read with
 * `useSearchParams` (the page wraps this in `<Suspense>`, which Next requires
 * on a prerendered route) and written with `history.replaceState`, which
 * Next 16 syncs into `useSearchParams`. Slugs, not ids: seeded ids change on
 * every reseed and would rot in a bookmarked URL. A missing or unknown slug
 * falls back to the first calendar by name and is not rewritten into the URL.
 * Inactive calendars are listed too: their hours can be set before they take
 * bookings.
 *
 * The editor is keyed on the calendar's id, so switching calendars starts
 * from that calendar's saved values. A skeleton shows only on the first
 * load, never while a save's invalidation refetches the list.
 *
 * Unsaved edits are not dropped without asking. While the form reports
 * unsaved changes (`onDirtyChange`), choosing another calendar opens this
 * component's `ConfirmDialog`: Keep editing (or Escape) changes nothing and
 * puts focus back on the select; Discard changes switches. Every way out of
 * the page asks through `UnsavedChangesProvider` instead, which this
 * component feeds with the calendar's name while the form is dirty: Back to
 * calendars, the sidebar's links and the user menu's links ask with the same
 * question, and a reload or a closed tab gets the browser's own prompt. A
 * clean form (just loaded, saved or discarded) never asks. The browser's
 * back and forward are still not guarded.
 *
 * When the list fails to load and there is none to show, the page keeps its
 * way back and shows a `LoadError` whose Retry calls `refetch()`; while that
 * retry runs, the alert stays with its button busy. A refetch that fails
 * while the editor is open keeps the editor. "No calendars" is only for a
 * list that loaded empty.
 */
export function AvailabilityWorkspace() {
  const searchParams = useSearchParams();
  const slug = searchParams.get("calendar");
  const calendars = useResource("calendars", () => api.calendars.list());
  // Whether the editor has unsaved changes, as it last reported.
  const [dirty, setDirty] = useState(false);
  // Kept after the dialog closes (only `open` turns false), so its text stays
  // put through the exit animation.
  const [leave, setLeave] = useState<LeaveQuestion | null>(null);
  // Where focus goes when the question closes: the Calendar select.
  // Explicit, because the Select's chosen option, the element focused when
  // the dialog opened, is gone by then.
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Sorted by name by the API.
  const list = calendars.data ?? [];
  const selected = list.find((c) => c.slug === slug) ?? list[0];
  // Every link out of the page, and a reload or a closed tab, asks first
  // while the form is dirty.
  useUnsavedChanges(dirty ? (selected?.name ?? null) : null);

  if (calendars.isLoading) return <AvailabilityWorkspaceSkeleton />;

  if (calendars.data === undefined && calendars.error) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <BackLink />
        </div>
        <LoadError
          title="Could not load calendars"
          message={calendars.error.message}
          onRetry={calendars.refetch}
          retrying={calendars.isRefreshing}
        />
      </div>
    );
  }

  if (!selected) {
    return (
      <EmptyState
        icon={CalendarXIcon}
        title="No calendars"
        description="There is no calendar to set hours for."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <BackLink />
        <Field orientation="horizontal" className="w-auto">
          <FieldLabel htmlFor={SELECT_ID}>Calendar</FieldLabel>
          <Select
            // Controlled: while the question is open, it stays on the
            // calendar being edited.
            value={selected.slug}
            onValueChange={(value: string | null) => {
              if (!value || value === selected.slug) return;
              if (!dirty) {
                showCalendar(value);
                return;
              }
              const target = list.find((c) => c.slug === value);
              setLeave({
                open: true,
                from: selected.name,
                to: { slug: value, name: target?.name ?? value },
              });
            }}
          >
            <SelectTrigger ref={triggerRef} id={SELECT_ID} className="w-56">
              <SelectValue>
                {(value: string | null) => {
                  const chosen = list.find((c) => c.slug === value);
                  return chosen ? <CalendarName calendar={chosen} /> : null;
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {list.map((c) => (
                  <SelectItem key={c.id} value={c.slug}>
                    <CalendarName calendar={c} />
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <AvailabilityForm
        key={selected.id}
        calendar={selected}
        onDirtyChange={setDirty}
      />
      <ConfirmDialog
        {...DISCARD_QUESTION}
        open={leave?.open ?? false}
        onOpenChange={(open) =>
          setLeave((prev) => (prev ? { ...prev, open } : prev))
        }
        description={leave ? leaveDescription(leave) : null}
        finalFocus={triggerRef}
        onConfirm={() => {
          // The new calendar's form mounts clean (it is keyed on the id).
          if (leave) showCalendar(leave.to.slug);
        }}
      />
    </div>
  );
}

/**
 * The way back to the calendars page, shown above the editor or the error.
 * While the editor has unsaved edits it asks first, through
 * `UnsavedChangesProvider`'s question (`useLeaveGuard`, passed as Next's own
 * Link `onNavigate`, which runs for a client-side navigation only, not a
 * Ctrl/Cmd-click into a new tab).
 */
function BackLink() {
  const guardLeave = useLeaveGuard();
  return (
    <LinkButton
      href="/calendars"
      onNavigate={guardLeave("/calendars")}
      variant="outline"
    >
      <ArrowLeftIcon data-icon="inline-start" />
      Back to calendars
    </LinkButton>
  );
}

/** The page's `<Suspense>` fallback and first-load state. */
export function AvailabilityWorkspaceSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-8 w-72" />
      </div>
      <Skeleton className="h-96 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}
