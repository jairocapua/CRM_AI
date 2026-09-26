"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

import * as api from "@/lib/api";
import { useAction, useResource } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ContactTasksPanel({ contactId }: { contactId: string }) {
  const tasks = useResource(
    "tasks",
    () => api.tasks.listForContact(contactId),
    contactId,
  );
  const [title, setTitle] = useState("");

  const [createTask, isCreating] = useAction(async () => {
    const text = title.trim();
    if (!text) return;
    await api.tasks.create({ title: text, contactId });
    setTitle("");
    toast.success("Task added");
  });

  const [toggleTask] = useAction(async (id: string, done: boolean) => {
    await api.tasks.setCompleted(id, done);
  });

  const [deleteTask] = useAction(async (id: string) => {
    await api.tasks.remove(id);
    toast.success("Task deleted");
  });

  return (
    <div className="flex flex-col gap-3 pt-3">
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void createTask();
        }}
      >
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Add a task…"
        />
        <Button
          type="submit"
          size="icon"
          disabled={isCreating || title.trim() === ""}
        >
          <PlusIcon className="size-4" />
          <span className="sr-only">Add task</span>
        </Button>
      </form>

      {tasks.isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : (tasks.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No tasks yet.</p>
      ) : (
        <div className="flex flex-col gap-1">
          {(tasks.data ?? []).map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-2 rounded-lg border px-3 py-2"
            >
              <Checkbox
                checked={Boolean(task.completedAt)}
                onCheckedChange={(checked) => void toggleTask(task.id, checked)}
              />
              <div className="flex flex-1 flex-col">
                <span
                  className={cn(
                    "text-sm",
                    task.completedAt && "text-muted-foreground line-through",
                  )}
                >
                  {task.title}
                </span>
                {task.dueAt ? (
                  <span className="text-xs text-muted-foreground">
                    Due{" "}
                    {formatDistanceToNow(toDate(task.dueAt), {
                      addSuffix: true,
                    })}
                  </span>
                ) : null}
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => void deleteTask(task.id)}
              >
                <Trash2Icon className="size-4" />
                <span className="sr-only">Delete task</span>
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
