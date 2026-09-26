"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import * as api from "@/lib/api";
import { useAction } from "@/lib/api";
import { ContactPicker } from "@/components/modules/opportunities/contact-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";

/** Pick a contact, then open (or start) their thread. */
export function NewConversationDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [contactId, setContactId] = useState("");
  const [start, isStarting] = useAction(api.conversations.openForContact);

  async function handleStart() {
    if (!contactId) return;
    try {
      const conversation = await start(contactId);
      onOpenChange(false);
      setContactId("");
      router.push(`/conversations/${conversation.id}`);
    } catch (error) {
      toast.error(
        error instanceof api.ApiError
          ? error.message
          : "Could not start the conversation.",
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New conversation</DialogTitle>
          <DialogDescription>
            Opens the contact&apos;s existing thread, or starts one.
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="new-conversation-contact">Contact</FieldLabel>
          <ContactPicker
            id="new-conversation-contact"
            value={contactId}
            onChange={setContactId}
          />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleStart()}
            disabled={!contactId || isStarting}
          >
            {isStarting ? "Opening…" : "Open conversation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
