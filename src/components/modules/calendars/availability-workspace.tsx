"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeftIcon, CalendarXIcon } from "lucide-react";

import * as api from "@/lib/api";
import { useResource } from "@/lib/api";
import { EmptyState } from "@/components/common/empty-state";
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
 */
export function AvailabilityWorkspace() {
  const searchParams = useSearchParams();
  const slug = searchParams.get("calendar");
  const calendars = useResource("calendars", () => api.calendars.list());

  if (calendars.isLoading) return <AvailabilityWorkspaceSkeleton />;

  // Sorted by name by the API.
  const list = calendars.data ?? [];
  const selected = list.find((c) => c.slug === slug) ?? list[0];

  if (!selected) {
    return (
      <EmptyState
        icon={CalendarXIcon}
        title={calendars.error ? "Could not load calendars" : "No calendars"}
        description={
          calendars.error
            ? calendars.error.message
            : "There is no calendar to set hours for."
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {/* A link styled as a button: Base UI's Button would give it
            role="button". */}
        <Link
          href="/calendars"
          className={buttonVariants({ variant: "outline" })}
        >
          <ArrowLeftIcon data-icon="inline-start" />
          Back to calendars
        </Link>
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
