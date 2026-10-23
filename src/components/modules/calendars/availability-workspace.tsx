"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeftIcon, CalendarXIcon } from "lucide-react";

import * as api from "@/lib/api";
import { useResource } from "@/lib/api";
import { EmptyState } from "@/components/common/empty-state";
import { LoadError } from "@/components/common/load-error";
import { buttonVariants } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import { AvailabilityForm } from "./availability-form";
import { CalendarName } from "./calendar-name";

const SELECT_ID = "availability-calendar";

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
 * from that calendar's saved values (unsaved edits to the previous one are
 * dropped). A skeleton shows only on the first load, never while a save's
 * invalidation refetches the list.
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
        <BackLink />
        <Field orientation="horizontal" className="w-auto">
          <FieldLabel htmlFor={SELECT_ID}>Calendar</FieldLabel>
          <Select
            value={selected.slug}
            onValueChange={(value: string | null) => {
              if (value && value !== selected.slug) {
                window.history.replaceState(
                  null,
                  "",
                  `?calendar=${encodeURIComponent(value)}`,
                );
              }
            }}
          >
            <SelectTrigger id={SELECT_ID} className="w-56">
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
      <AvailabilityForm key={selected.id} calendar={selected} />
    </div>
  );
}

/** The way back to the calendars page, shown above the editor or the error. */
function BackLink() {
  // A link styled as a button: Base UI's Button would give it role="button".
  // cn() merges the variant classes as Button does, or the outline border is
  // lost.
  return (
    <Link
      href="/calendars"
      className={cn(buttonVariants({ variant: "outline" }))}
    >
      <ArrowLeftIcon data-icon="inline-start" />
      Back to calendars
    </Link>
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
