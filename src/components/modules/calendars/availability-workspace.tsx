"use client";

import { useRef, useState, type ComponentProps, type Ref } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeftIcon, CalendarXIcon } from "lucide-react";

import * as api from "@/lib/api";
import { useResource } from "@/lib/api";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { LoadError } from "@/components/common/load-error";
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

/** Where a guarded control was taking the viewer. */
type LeaveTarget =
  { kind: "calendar"; slug: string; name: string } | { kind: "back" };

/** The question asked before unsaved edits are dropped: whose edits, and
 *  where the viewer was going. */
interface LeaveQuestion {
  open: boolean;
  from: string;
  to: LeaveTarget;
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
  const unsaved = `Your changes to ${from} have not been saved.`;
  return to.kind === "calendar"
    ? `${unsaved} Switching to ${to.name} will discard them.`
    : `${unsaved} Leaving this page will discard them.`;
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
 * unsaved changes (`onDirtyChange`), switching calendars or following Back to
 * calendars opens a `ConfirmDialog` instead: Keep editing (or Escape) changes
 * nothing and puts focus back on the control used; Discard changes goes
 * ahead. A clean form (just loaded, saved or discarded) never asks. Not
 * guarded: the sidebar's links, the browser's back and forward, and a reload
 * or a closed tab still drop unsaved edits.
 *
 * When the list fails to load and there is none to show, the page keeps its
 * way back and shows a `LoadError` whose Retry calls `refetch()`; while that
 * retry runs, the alert stays with its button busy. A refetch that fails
 * while the editor is open keeps the editor. "No calendars" is only for a
 * list that loaded empty.
 */
export function AvailabilityWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const slug = searchParams.get("calendar");
  const calendars = useResource("calendars", () => api.calendars.list());
  // Whether the editor has unsaved changes, as it last reported.
  const [dirty, setDirty] = useState(false);
  // Kept after the dialog closes (only `open` turns false), so its text stays
  // put through the exit animation.
  const [leave, setLeave] = useState<LeaveQuestion | null>(null);
  // Where focus goes when the question closes: the control that asked it.
  // Explicit, because the Select's chosen option, the element focused when
  // the dialog opened, is gone by then.
  const triggerRef = useRef<HTMLButtonElement>(null);
  const backRef = useRef<HTMLAnchorElement>(null);

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

  // Sorted by name by the API.
  const list = calendars.data ?? [];
  const selected = list.find((c) => c.slug === slug) ?? list[0];

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
        <BackLink
          ref={backRef}
          onNavigate={(event) => {
            if (!dirty) return;
            event.preventDefault();
            setLeave({ open: true, from: selected.name, to: { kind: "back" } });
          }}
        />
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
                to: {
                  kind: "calendar",
                  slug: value,
                  name: target?.name ?? value,
                },
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
        open={leave?.open ?? false}
        onOpenChange={(open) =>
          setLeave((prev) => (prev ? { ...prev, open } : prev))
        }
        title="Discard unsaved changes?"
        description={leave ? leaveDescription(leave) : null}
        cancelLabel="Keep editing"
        confirmLabel="Discard changes"
        confirmVariant="destructive"
        finalFocus={leave?.to.kind === "back" ? backRef : triggerRef}
        onConfirm={() => {
          if (!leave) return;
          // The new calendar's form mounts clean (it is keyed on the id).
          if (leave.to.kind === "calendar") showCalendar(leave.to.slug);
          else router.push("/calendars");
        }}
      />
    </div>
  );
}

/**
 * The way back to the calendars page, shown above the editor or the error.
 * `onNavigate` is Next's own Link prop: it runs for a client-side navigation
 * only (not a Ctrl/Cmd-click into a new tab), and `preventDefault()` there
 * cancels it.
 */
function BackLink({
  ref,
  onNavigate,
}: {
  ref?: Ref<HTMLAnchorElement>;
  onNavigate?: ComponentProps<typeof LinkButton>["onNavigate"];
}) {
  return (
    <LinkButton
      ref={ref}
      href="/calendars"
      onNavigate={onNavigate}
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
