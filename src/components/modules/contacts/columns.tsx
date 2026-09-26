"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import {
  EyeIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";

import type { Contact, Tag, User } from "@/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatPhone, fullName, initials, toDate } from "@/lib/format";
import { ContactStatusBadge } from "./contact-status-badge";
import { TagBadge } from "./tag-badge";

export function buildContactColumns({
  tagsById,
  usersById,
  onEdit,
  onDelete,
}: {
  tagsById: Map<string, Tag>;
  usersById: Map<string, User>;
  onEdit: (contact: Contact) => void;
  onDelete: (contact: Contact) => void;
}): ColumnDef<Contact>[] {
  return [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          indeterminate={
            table.getIsSomePageRowsSelected() &&
            !table.getIsAllPageRowsSelected()
          }
          onCheckedChange={(checked) =>
            table.toggleAllPageRowsSelected(checked)
          }
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(checked) => row.toggleSelected(checked)}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
    },
    {
      id: "contact",
      accessorFn: (row) => fullName(row),
      header: "Contact",
      enableSorting: false,
      cell: ({ row }) => {
        const contact = row.original;
        return (
          <Link
            href={`/contacts/${contact.id}`}
            className="flex items-center gap-2.5 hover:underline"
          >
            <Avatar size="sm">
              <AvatarImage src={contact.avatarUrl} alt="" />
              <AvatarFallback>
                {initials(contact.firstName, contact.lastName)}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
              <span className="font-medium">{fullName(contact)}</span>
              {contact.companyName ? (
                <span className="text-xs text-muted-foreground">
                  {contact.companyName}
                </span>
              ) : null}
            </div>
          </Link>
        );
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <ContactStatusBadge status={row.original.status} />,
    },
    {
      id: "tags",
      header: "Tags",
      enableSorting: false,
      cell: ({ row }) => {
        const tags = row.original.tagIds
          .map((id) => tagsById.get(id))
          .filter((t): t is Tag => Boolean(t));
        if (tags.length === 0) {
          return <span className="text-muted-foreground">—</span>;
        }
        const shown = tags.slice(0, 2);
        const rest = tags.length - shown.length;
        return (
          <div className="flex items-center gap-1">
            {shown.map((tag) => (
              <TagBadge key={tag.id} tag={tag} />
            ))}
            {rest > 0 ? (
              <span className="text-xs text-muted-foreground">+{rest}</span>
            ) : null}
          </div>
        );
      },
    },
    {
      accessorKey: "phone",
      header: "Phone",
      cell: ({ row }) =>
        formatPhone(row.original.phone) || (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      accessorKey: "email",
      header: "Email",
      cell: ({ row }) =>
        row.original.email || <span className="text-muted-foreground">—</span>,
    },
    {
      id: "owner",
      header: "Owner",
      enableSorting: false,
      cell: ({ row }) => {
        const owner = row.original.ownerId
          ? usersById.get(row.original.ownerId)
          : undefined;
        return owner ? (
          fullName(owner)
        ) : (
          <span className="text-muted-foreground">Unassigned</span>
        );
      },
    },
    {
      accessorKey: "score",
      header: "Score",
      cell: ({ row }) => (
        <span className="tabular-nums">{row.original.score}</span>
      ),
    },
    {
      accessorKey: "lastActivityAt",
      header: "Last activity",
      cell: ({ row }) => {
        const at = row.original.lastActivityAt;
        return at ? (
          formatDistanceToNow(toDate(at), { addSuffix: true })
        ) : (
          <span className="text-muted-foreground">—</span>
        );
      },
    },
    {
      id: "actions",
      enableSorting: false,
      cell: ({ row }) => {
        const contact = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon-sm" />}
            >
              <MoreHorizontalIcon />
              <span className="sr-only">Actions</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem
                  render={<Link href={`/contacts/${contact.id}`} />}
                >
                  <EyeIcon />
                  View
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onEdit(contact)}>
                  <PencilIcon />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => onDelete(contact)}
                >
                  <Trash2Icon />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}
