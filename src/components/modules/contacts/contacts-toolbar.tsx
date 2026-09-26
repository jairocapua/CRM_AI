"use client";

import { PlusIcon, SearchIcon } from "lucide-react";

import { CONTACT_STATUS_LABELS, type ContactStatus } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TagPicker } from "./tag-picker";

export function ContactsToolbar({
  search,
  onSearchChange,
  status,
  onStatusChange,
  tagIds,
  onTagIdsChange,
  onAddContact,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  status: ContactStatus | "all";
  onStatusChange: (value: ContactStatus | "all") => void;
  tagIds: string[];
  onTagIdsChange: (ids: string[]) => void;
  onAddContact: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-48 flex-1 sm:max-w-64">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search contacts…"
          className="pl-8"
        />
      </div>

      <Select
        value={status}
        onValueChange={(value) =>
          onStatusChange(value as ContactStatus | "all")
        }
      >
        <SelectTrigger className="w-40">
          <SelectValue placeholder="Status">
            {(value: ContactStatus | "all") =>
              value === "all" ? "All statuses" : CONTACT_STATUS_LABELS[value]
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          {Object.entries(CONTACT_STATUS_LABELS).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="w-56">
        <TagPicker value={tagIds} onChange={onTagIdsChange} />
      </div>

      <Button className="ml-auto" onClick={onAddContact}>
        <PlusIcon className="size-4" />
        Add contact
      </Button>
    </div>
  );
}
