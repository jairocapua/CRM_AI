"use client";

import { useEffect, useRef, useState } from "react";
import { PlusIcon, RotateCwIcon } from "lucide-react";
import { toast } from "sonner";

import * as api from "@/lib/api";
import { invalidate, loadErrorOf, useAction, useResource } from "@/lib/api";
import type { TagColor } from "@/types";
import { LoadError } from "@/components/common/load-error";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
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

/**
 * Multi-select tag picker with inline "create a new tag" support.
 *
 * When its tags read has failed with no tags to show (`loadErrorOf`), the
 * list says "Could not load tags." instead of "No tags found." and offers
 * nothing, not even Create: without the list there is no way to tell whether
 * a tag with that name already exists, so creating one could make a
 * duplicate. A failed re-read with tags on screen keeps them.
 *
 * That error state offers Retry (busy while in flight), so the form sheets
 * and the bulk Tags popover, which have no page-level tags alert, can
 * recover. Retry calls `invalidate("tags")`, so it re-reads every tags reader
 * on the page, not only this picker's.
 *
 * That in-list Retry is mouse-only: the list is portaled, and Tab from the
 * chips input closes it. So the same error also shows as a `LoadError` (an
 * alert with Retry) in normal DOM order below the input, where Tab from the
 * input reaches it. When a Retry from that alert succeeds, the alert unmounts
 * with focus on its button; focus goes back to the input rather than dropping
 * to `<body>`. Pass `inlineLoadError={false}` where the page already shows a
 * tags `LoadError` (the contacts toolbar's filter).
 */
export function TagPicker({
  id,
  "aria-label": ariaLabel,
  value,
  onChange,
  disabled = false,
  inlineLoadError = true,
}: {
  /** Id for the text input, so a `<label htmlFor>` names it. */
  id?: string;
  /** Names the text input where no `<label htmlFor>` can (toolbars, popovers). */
  "aria-label"?: string;
  value: string[];
  onChange: (tagIds: string[]) => void;
  disabled?: boolean;
  /**
   * Shows a failed tags read as an alert with Retry below the input, the
   * keyboard path to Retry (default). Pass false only where the page already
   * shows a tags `LoadError`.
   */
  inlineLoadError?: boolean;
}) {
  const tags = useResource("tags", () => api.tags.list());
  const [query, setQuery] = useState("");
  const anchor = useComboboxAnchor();
  // Whether focus is inside the inline alert. Chromium fires no blur when a
  // focused element is removed, so after a successful Retry unmounts the
  // alert this is still true, and the effect below puts focus back on the
  // input instead of leaving it on <body>. A blur to another element clears
  // it; the activeElement check covers a browser that does fire that blur.
  const retryHadFocus = useRef(false);

  const [createTag] = useAction(async (name: string) => {
    const color =
      TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)] ?? "slate";
    const tag = await api.tags.create({ name, color });
    toast.success(`Tag "${tag.name}" created`);
    return tag;
  });

  const tagsError = loadErrorOf(tags);

  useEffect(() => {
    if (tagsError || !retryHadFocus.current) return;
    retryHadFocus.current = false;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    anchor.current
      ?.querySelector<HTMLInputElement>('[data-slot="combobox-chip-input"]')
      ?.focus();
  }, [tagsError, anchor]);
  const allTags = tags.data ?? [];
  const selected = allTags.filter((t) => value.includes(t.id));

  const trimmed = query.trim();
  const exactMatch = allTags.some(
    (t) => t.name.toLowerCase() === trimmed.toLowerCase(),
  );
  const itemsForView: TagOption[] = tagsError
    ? []
    : trimmed !== "" && !exactMatch
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
    // Combobox's root renders no element: this div holds the inline alert
    // below the chips.
    <div className="flex flex-col gap-2">
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
          <ComboboxChipsInput
            id={id}
            aria-label={ariaLabel}
            placeholder={selected.length ? "" : "Add tags…"}
          />
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
          {tagsError ? (
            <ComboboxEmpty className="flex-col items-center gap-2">
              <span>Could not load tags.</span>
              <Button
                size="xs"
                variant="outline"
                onClick={() => invalidate("tags")}
                // Keeps focus in the chips input, so the list stays open.
                onMouseDown={(event) => event.preventDefault()}
                disabled={tags.isRefreshing}
                focusableWhenDisabled
                className="data-disabled:opacity-50"
              >
                {tags.isRefreshing ? (
                  <Spinner aria-hidden data-icon="inline-start" />
                ) : (
                  <RotateCwIcon data-icon="inline-start" />
                )}
                Retry
              </Button>
            </ComboboxEmpty>
          ) : (
            <ComboboxEmpty>No tags found.</ComboboxEmpty>
          )}
        </ComboboxContent>
      </Combobox>
      {tagsError && inlineLoadError ? (
        <div
          onFocus={() => {
            retryHadFocus.current = true;
          }}
          onBlur={(event) => {
            if (event.relatedTarget) retryHadFocus.current = false;
          }}
        >
          <LoadError
            title="Could not load tags"
            message={tagsError.message}
            onRetry={() => invalidate("tags")}
            retrying={tags.isRefreshing}
          />
        </div>
      ) : null}
    </div>
  );
}
