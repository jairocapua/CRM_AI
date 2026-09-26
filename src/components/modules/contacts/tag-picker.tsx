"use client";

import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { toast } from "sonner";

import * as api from "@/lib/api";
import { useAction, useResource } from "@/lib/api";
import type { TagColor } from "@/types";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor,
} from "@/components/ui/combobox";
import { TAG_COLORS, TAG_DOT_CLASSES } from "@/lib/constants";
import { cn } from "@/lib/utils";

type TagRecord = Awaited<ReturnType<typeof api.tags.list>>[number];
type CreatableOption = {
  id: string;
  name: string;
  color: TagColor;
  creatable: string;
};
type TagOption = TagRecord | CreatableOption;

function isCreatable(option: TagOption): option is CreatableOption {
  return "creatable" in option;
}

/** Multi-select tag picker with inline "create a new tag" support. */
export function TagPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: string[];
  onChange: (tagIds: string[]) => void;
  disabled?: boolean;
}) {
  const tags = useResource("tags", () => api.tags.list());
  const [query, setQuery] = useState("");
  const anchor = useComboboxAnchor();

  const [createTag] = useAction(async (name: string) => {
    const color =
      TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)] ?? "slate";
    const tag = await api.tags.create({ name, color });
    toast.success(`Tag "${tag.name}" created`);
    return tag;
  });

  const allTags = tags.data ?? [];
  const selected = allTags.filter((t) => value.includes(t.id));

  const trimmed = query.trim();
  const exactMatch = allTags.some(
    (t) => t.name.toLowerCase() === trimmed.toLowerCase(),
  );
  const itemsForView: TagOption[] =
    trimmed !== "" && !exactMatch
      ? [
          ...allTags,
          {
            id: `create:${trimmed}`,
            name: `Create "${trimmed}"`,
            color: "slate",
            creatable: trimmed,
          },
        ]
      : allTags;

  return (
    <Combobox<TagOption, true>
      items={itemsForView}
      multiple
      disabled={disabled}
      value={selected}
      isItemEqualToValue={(a, b) => a.id === b.id}
      itemToStringLabel={(item) => item.name}
      inputValue={query}
      onInputValueChange={setQuery}
      onValueChange={(next) => {
        const creatable = next.find(isCreatable);
        if (creatable) {
          void createTag(creatable.creatable).then((tag) => {
            onChange([...value, tag.id]);
          });
          setQuery("");
          return;
        }
        onChange(next.map((t) => t.id));
        setQuery("");
      }}
    >
      <ComboboxChips ref={anchor}>
        {selected.map((tag) => (
          <ComboboxChip key={tag.id}>
            <span
              className={cn(
                "size-1.5 rounded-full",
                TAG_DOT_CLASSES[tag.color],
              )}
            />
            {tag.name}
          </ComboboxChip>
        ))}
        <ComboboxChipsInput placeholder={selected.length ? "" : "Add tags…"} />
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxList>
          {(item: TagOption) =>
            isCreatable(item) ? (
              <ComboboxItem key={item.id} value={item}>
                <PlusIcon className="size-4" />
                Create &ldquo;{item.creatable}&rdquo;
              </ComboboxItem>
            ) : (
              <ComboboxItem key={item.id} value={item}>
                <span
                  className={cn(
                    "size-2 rounded-full",
                    TAG_DOT_CLASSES[item.color],
                  )}
                />
                {item.name}
              </ComboboxItem>
            )
          }
        </ComboboxList>
        <ComboboxEmpty>No tags found.</ComboboxEmpty>
      </ComboboxContent>
    </Combobox>
  );
}
