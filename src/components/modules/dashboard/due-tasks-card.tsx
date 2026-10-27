"use client";

import { useState } from "react";
import Link from "next/link";
import { CircleCheckIcon } from "lucide-react";
import { isBefore, parseISO, startOfDay } from "date-fns";
import { toast } from "sonner";

import * as api from "@/lib/api";
import { ApiError, apiNow, loadErrorOf, useResource } from "@/lib/api";
import { LoadError } from "@/components/common/load-error";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelative } from "@/lib/format";
import { REGION_FOCUS, useCardRegion } from "./card-region";

/**
 * Open tasks due today or earlier. Ticking one completes it through the API,
 * which invalidates `tasks`, so it leaves the list on the refetch. The box
 * shows ticked while the call is in flight and unticks if it fails.
 */
export function DueTasksCard() {
  const tasks = useResource("tasks", () => api.tasks.listDue(8));
  const loadError = loadErrorOf(tasks);
  const region = useCardRegion();
  const [completing, setCompleting] = useState<ReadonlySet<string>>(new Set());

  async function complete(id: string) {
    setCompleting((prev) => new Set(prev).add(id));
    try {
      await api.tasks.setCompleted(id, true);
      toast.success("Task completed");
      // Stays ticked on success: the row leaves when the refetch lands, and
      // clearing it here would untick it for a moment first.
    } catch (error) {
      setCompleting((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      toast.error(
        error instanceof ApiError ? error.message : "Could not complete task",
      );
    }
  }

  const now = apiNow();
  const today = startOfDay(now);
  const rows = tasks.data ?? [];

  return (
    <Card {...region.regionProps} className={REGION_FOCUS}>
      <CardHeader>
        <CardTitle id={region.titleId}>Due today</CardTitle>
        <CardDescription>Open tasks due today or overdue.</CardDescription>
      </CardHeader>
      <CardContent>
        {tasks.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : loadError ? (
          <LoadError
            title="Could not load tasks"
            message={loadError.message}
            onRetry={tasks.refetch}
            retrying={tasks.isRefreshing}
            focusTarget={region.ref}
          />
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
            <CircleCheckIcon className="size-5" aria-hidden />
            All caught up.
          </div>
        ) : (
          <ul className="flex flex-col gap-1">
            {rows.map((task) => {
              const overdue =
                task.dueAt && isBefore(parseISO(task.dueAt), today);
              return (
                <li
                  key={task.id}
                  className="flex items-start gap-2.5 rounded-lg px-1 py-1.5"
                >
                  <Checkbox
                    className="mt-0.5"
                    aria-label={`Complete "${task.title}"`}
                    checked={completing.has(task.id)}
                    disabled={completing.has(task.id)}
                    onCheckedChange={(checked) => {
                      if (checked) void complete(task.id);
                    }}
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    {task.contactId ? (
                      <Link
                        href={`/contacts/${task.contactId}`}
                        className="truncate text-sm hover:underline"
                      >
                        {task.title}
                      </Link>
                    ) : (
                      <span className="truncate text-sm">{task.title}</span>
                    )}
                    {task.dueAt ? (
                      <span className="text-xs text-muted-foreground">
                        Due {formatRelative(task.dueAt, now)}
                      </span>
                    ) : null}
                  </div>
                  {overdue ? (
                    <Badge variant="outline" className="shrink-0">
                      Overdue
                    </Badge>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
