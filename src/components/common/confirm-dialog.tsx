"use client";

import type { ComponentProps, ReactNode } from "react";

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
import type { Button } from "@/components/ui/button";

/**
 * The app's shared "are you sure?" question (docs/spec.md, components/common):
 * a title, a sentence on what will happen, a way back and a way on.
 *
 * - The way back comes first in the DOM, so Base UI's default first focus
 *   (the first tabbable element) lands on the safe choice. Escape counts as
 *   the way back; an outside press never dismisses an alert dialog.
 * - Confirming calls `onConfirm`, then closes. The way back only closes.
 * - The dialog stays mounted through its exit animation, so a caller keeps
 *   the content it passes (title, description) while `open` turns false,
 *   rather than clearing it on close.
 * - `finalFocus` is Base UI's own prop, read as the dialog closes: pass it
 *   when the element that opened the dialog may be gone by then.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  cancelLabel = "Cancel",
  confirmLabel,
  confirmVariant = "default",
  onConfirm,
  finalFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  cancelLabel?: string;
  confirmLabel: string;
  confirmVariant?: ComponentProps<typeof Button>["variant"];
  onConfirm: () => void;
  finalFocus?: ComponentProps<typeof AlertDialogContent>["finalFocus"];
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent finalFocus={finalFocus}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            variant={confirmVariant}
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
