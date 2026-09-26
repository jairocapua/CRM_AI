"use client";

import { toast } from "sonner";

import * as api from "@/lib/api";
import { useAction } from "@/lib/api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { pluralize } from "@/lib/format";

export function DeleteContactDialog({
  open,
  onOpenChange,
  contactIds,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactIds: string[];
  onDeleted?: () => void;
}) {
  const [remove, isDeleting] = useAction(async () => {
    const result = await api.contacts.remove(contactIds);
    toast.success(`${pluralize(result.deleted, "contact")} deleted`);
    onDeleted?.();
  });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete {pluralize(contactIds.length, "contact")}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This also removes their notes, tasks, opportunities, conversations
            and activity history. This can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={isDeleting}
            onClick={() => void remove().then(() => onOpenChange(false))}
          >
            {isDeleting ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
