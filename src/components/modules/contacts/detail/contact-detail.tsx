"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, UserXIcon } from "lucide-react";
import { toast } from "sonner";

import * as api from "@/lib/api";
import { useAction, useResource } from "@/lib/api";
import { EmptyState } from "@/components/common/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ContactFormSheet } from "../contact-form-sheet";
import { DeleteContactDialog } from "../delete-contact-dialog";
import { ContactActivityPanel } from "./contact-activity-panel";
import { ContactHeader } from "./contact-header";
import { ContactInfoPanel } from "./contact-info-panel";
import { ContactNotesPanel } from "./contact-notes-panel";
import { ContactOpportunitiesPanel } from "./contact-opportunities-panel";
import { ContactTasksPanel } from "./contact-tasks-panel";

export function ContactDetail({ id }: { id: string }) {
  const router = useRouter();
  const contact = useResource("contacts", () => api.contacts.get(id), id);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [openThread, isOpeningThread] = useAction(
    api.conversations.openForContact,
  );

  async function handleMessage() {
    try {
      const conversation = await openThread(id);
      router.push(`/conversations/${conversation.id}`);
    } catch (error) {
      toast.error(
        error instanceof api.ApiError
          ? error.message
          : "Could not open the conversation.",
      );
    }
  }

  const backLink = (
    <Link
      href="/contacts"
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeftIcon className="size-4" />
      Contacts
    </Link>
  );

  if (contact.error?.status === 404) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        {backLink}
        <EmptyState
          icon={UserXIcon}
          title="Contact not found"
          description="It may have been deleted."
        />
      </div>
    );
  }

  if (contact.isLoading || !contact.data) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
        {backLink}
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const record = contact.data;

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
      {backLink}
      <ContactHeader
        contact={record}
        onMessage={() => void handleMessage()}
        isOpeningThread={isOpeningThread}
        onEdit={() => setEditOpen(true)}
        onDelete={() => setDeleteOpen(true)}
      />

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <ContactInfoPanel contact={record} />

        <div className="flex flex-col gap-4">
          <ContactOpportunitiesPanel contactId={record.id} />

          <Tabs defaultValue="activity">
            <TabsList>
              <TabsTrigger value="activity">Activity</TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
              <TabsTrigger value="tasks">Tasks</TabsTrigger>
            </TabsList>
            <TabsContent value="activity">
              <ContactActivityPanel contactId={record.id} />
            </TabsContent>
            <TabsContent value="notes">
              <ContactNotesPanel contactId={record.id} />
            </TabsContent>
            <TabsContent value="tasks">
              <ContactTasksPanel contactId={record.id} />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <ContactFormSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        contact={record}
      />
      <DeleteContactDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        contactIds={[record.id]}
        onDeleted={() => router.push("/contacts")}
      />
    </div>
  );
}
