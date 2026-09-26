"use client";

import { MessageSquareIcon, PencilIcon, Trash2Icon } from "lucide-react";

import type { Contact } from "@/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { formatPhone, fullName, initials } from "@/lib/format";
import { ContactStatusBadge } from "../contact-status-badge";

export function ContactHeader({
  contact,
  onMessage,
  isOpeningThread = false,
  onEdit,
  onDelete,
}: {
  contact: Contact;
  onMessage: () => void;
  isOpeningThread?: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const subtitle = [
    [contact.jobTitle, contact.companyName].filter(Boolean).join(" at "),
    contact.email,
    contact.phone ? formatPhone(contact.phone) : undefined,
  ].filter(Boolean);

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-center gap-3">
        <Avatar size="lg">
          <AvatarImage src={contact.avatarUrl} alt="" />
          <AvatarFallback>
            {initials(contact.firstName, contact.lastName)}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{fullName(contact)}</h1>
            <ContactStatusBadge status={contact.status} />
          </div>
          {subtitle.length > 0 ? (
            <p className="text-sm text-muted-foreground">
              {subtitle.join(" · ")}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={onMessage} disabled={isOpeningThread}>
          <MessageSquareIcon className="size-4" />
          Message
        </Button>
        <Button variant="outline" onClick={onEdit}>
          <PencilIcon className="size-4" />
          Edit
        </Button>
        <Button variant="destructive" onClick={onDelete}>
          <Trash2Icon className="size-4" />
          Delete
        </Button>
      </div>
    </div>
  );
}
