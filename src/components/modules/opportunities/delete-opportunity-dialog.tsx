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

export function DeleteOpportunityDialog({
  open,
  onOpenChange,
  opportunityIds,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunityIds: string[];
  onDeleted?: () => void;
}) {
  const [remove, isDeleting] = useAction(async () => {
    // `opportunities.remove` resolves to void, unlike `contacts.remove`, so the
    // toast counts what was asked for rather than what came back.
    await api.opportunities.remove(opportunityIds);
    toast.success(`${pluralize(opportunityIds.length, "deal")} deleted`);
    onDeleted?.();
  });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete {pluralize(opportunityIds.length, "deal")}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This also removes the deal&apos;s timeline entries and detaches its
            tasks. This can&apos;t be undone.
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
