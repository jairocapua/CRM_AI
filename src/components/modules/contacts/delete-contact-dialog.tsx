"use client";

import { toast } from "sonner";

import * as api from "@/lib/api";
import { errorMessage, useAction } from "@/lib/api";
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
    let deleted: number;
    try {
      ({ deleted } = await api.contacts.remove(contactIds));
    } catch (error) {
      // The dialog stays open, to try again or cancel.
      toast.error(errorMessage(error, "Could not delete the contacts."));
      return;
    }
    toast.success(`${pluralize(deleted, "contact")} deleted`);
    onDeleted?.();
    onOpenChange(false);
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
            focusableWhenDisabled
            className="data-disabled:opacity-50"
            onClick={() => void remove()}
          >
            {isDeleting ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
