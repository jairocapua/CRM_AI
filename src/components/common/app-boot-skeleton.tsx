import { Skeleton } from "@/components/ui/skeleton";

/**
 * Rendered on the server and on the first client render, identically, while the
 * mock database rehydrates. Mirrors the real shell's proportions so the layout
 * does not jump when content arrives.
 */
export function AppBootSkeleton() {
  return (
    <div className="flex min-h-svh" aria-busy="true" aria-label="Loading">
      <div className="bg-sidebar hidden w-64 shrink-0 flex-col gap-6 border-r p-3 md:flex">
        <Skeleton className="h-12 w-full rounded-md" />
        <div className="flex flex-col gap-1.5">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full rounded-md" />
          ))}
        </div>
        <Skeleton className="mt-auto h-12 w-full rounded-md" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
          <Skeleton className="size-7 rounded-md" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="ml-auto h-8 w-40 rounded-md" />
        </div>
        <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-80" />
          <Skeleton className="mt-2 h-64 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}
