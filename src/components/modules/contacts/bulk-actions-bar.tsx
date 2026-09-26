"use client";

import { useState } from "react";
import { TagIcon, Trash2Icon, UserIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import * as api from "@/lib/api";
import { useAction, useResource } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fullName, pluralize } from "@/lib/format";
import { DeleteContactDialog } from "./delete-contact-dialog";
import { TagPicker } from "./tag-picker";

export function BulkActionsBar({
  selectedIds,
  onClearSelection,
}: {
  selectedIds: string[];
  onClearSelection: () => void;
}) {
  const [pendingTagIds, setPendingTagIds] = useState<string[]>([]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const users = useResource("users", () => api.users.list());

  const [addTags, isAddingTags] = useAction(async () => {
    await api.contacts.addTags(selectedIds, pendingTagIds);
    toast.success("Tags added");
    setPendingTagIds([]);
  });

  const [removeTags, isRemovingTags] = useAction(async () => {
    await api.contacts.removeTags(selectedIds, pendingTagIds);
    toast.success("Tags removed");
    setPendingTagIds([]);
  });

  const [assignOwner, isAssigningOwner] = useAction(async (next: string) => {
    await api.contacts.assignOwner(
      selectedIds,
      next === "unassigned" ? undefined : next,
    );
    toast.success(next === "unassigned" ? "Owner cleared" : "Owner assigned");
  });

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2">
      <span className="text-sm font-medium">
        {pluralize(selectedIds.length, "contact")} selected
      </span>

      <Popover>
        <PopoverTrigger render={<Button variant="outline" size="sm" />}>
          <TagIcon className="size-4" />
          Tags
        </PopoverTrigger>
        <PopoverContent>
          <TagPicker value={pendingTagIds} onChange={setPendingTagIds} />
          <div className="mt-2 flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={pendingTagIds.length === 0 || isRemovingTags}
              onClick={() => void removeTags()}
            >
              Remove
            </Button>
            <Button
              size="sm"
              disabled={pendingTagIds.length === 0 || isAddingTags}
              onClick={() => void addTags()}
            >
              Add
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger render={<Button variant="outline" size="sm" />}>
          <UserIcon className="size-4" />
          Owner
        </PopoverTrigger>
        <PopoverContent>
          <Select<string>
            disabled={isAssigningOwner}
            onValueChange={(value) => {
              if (value) void assignOwner(value);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Assign owner">
                {(value: string) => {
                  if (value === "unassigned") return "Unassigned";
                  const user = (users.data ?? []).find((u) => u.id === value);
                  return user ? fullName(user) : value;
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {(users.data ?? []).map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {fullName(user)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </PopoverContent>
      </Popover>

      <Button
        variant="destructive"
        size="sm"
        onClick={() => setDeleteOpen(true)}
      >
        <Trash2Icon className="size-4" />
        Delete
      </Button>

      <Button
        variant="ghost"
        size="icon-sm"
        className="ml-auto"
        onClick={onClearSelection}
      >
        <XIcon className="size-4" />
        <span className="sr-only">Clear selection</span>
      </Button>

      <DeleteContactDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        contactIds={selectedIds}
        onDeleted={onClearSelection}
      />
    </div>
  );
}
