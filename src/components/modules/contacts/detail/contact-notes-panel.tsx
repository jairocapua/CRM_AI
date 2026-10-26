"use client";

import { useState } from "react";
import { toast } from "sonner";

import * as api from "@/lib/api";
import {
  apiNow,
  errorMessage,
  loadErrorOf,
  useAction,
  useResource,
} from "@/lib/api";
import { LoadError } from "@/components/common/load-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { formatRelative } from "@/lib/format";

export function ContactNotesPanel({ contactId }: { contactId: string }) {
  const notes = useResource(
    "notes",
    () => api.contacts.listNotes(contactId),
    contactId,
  );
  const [body, setBody] = useState("");

  const [addNote, isAdding] = useAction(async () => {
    const text = body.trim();
    if (!text) return;
    try {
      await api.contacts.addNote(contactId, text);
    } catch (error) {
      // The note stays in the box, to send again.
      toast.error(errorMessage(error, "Could not add the note."));
      return;
    }
    setBody("");
    toast.success("Note added");
  });

  return (
    <div className="flex flex-col gap-3 pt-3">
      <div className="flex flex-col gap-2">
        <Textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Write a note…"
        />
        <Button
          className="self-end"
          size="sm"
          disabled={isAdding || body.trim() === ""}
          onClick={() => void addNote()}
        >
          {isAdding ? "Adding…" : "Add note"}
        </Button>
      </div>

      {notes.isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : loadErrorOf(notes) ? (
        <LoadError
          title="Could not load notes"
          message={loadErrorOf(notes)?.message ?? ""}
          onRetry={notes.refetch}
          retrying={notes.isRefreshing}
        />
      ) : (notes.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No notes yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {(notes.data ?? []).map((note) => (
            <Card key={note.id} size="sm">
              <CardContent className="flex flex-col gap-1 text-sm">
                <p className="whitespace-pre-wrap">{note.body}</p>
                <span className="text-xs text-muted-foreground">
                  {formatRelative(note.createdAt, apiNow())}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
