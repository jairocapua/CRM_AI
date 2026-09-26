"use client";

import { useState } from "react";

import type { Contact } from "@/types";
import * as api from "@/lib/api";
import { useResource } from "@/lib/api";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { fullName } from "@/lib/format";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

const PAGE_SIZE = 20;

/**
 * Single-select contact search. The list is server-queried rather than loaded
 * whole — there are hundreds of contacts and only the matches are needed.
 */
export function ContactPicker({
  id,
  value,
  onChange,
  disabled = false,
}: {
  id?: string;
  value: string;
  onChange: (contactId: string) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query, 250);

  const results = useResource(
    "contacts",
    () =>
      api.contacts.list({
        q: debounced.trim() || undefined,
        pageSize: PAGE_SIZE,
      }),
    debounced,
  );

  // The selected contact may not be in the current result page, so it is
  // fetched on its own and merged in — otherwise the input would blank out
  // as soon as the search narrowed past it.
  const selected = useResource(
    "contacts",
    () => (value ? api.contacts.get(value) : Promise.resolve(undefined)),
    value || "none",
  );

  const rows = results.data?.rows ?? [];
  const current = selected.data;
  const items: Contact[] =
    current && !rows.some((row) => row.id === current.id)
      ? [current, ...rows]
      : rows;

  return (
    <Combobox<Contact, false>
      items={items}
      disabled={disabled}
      value={current ?? null}
      isItemEqualToValue={(a, b) => a.id === b.id}
      itemToStringLabel={(item) => fullName(item)}
      // `inputValue` is deliberately uncontrolled: controlling it would pin the
      // input to the search term and blank out the selected contact's name when
      // editing an existing deal. Listening is enough to drive the query.
      onInputValueChange={setQuery}
      onValueChange={(next) => onChange(next?.id ?? "")}
    >
      <ComboboxInput id={id} placeholder="Search contacts…" />
      <ComboboxContent>
        <ComboboxList>
          {(item: Contact) => (
            <ComboboxItem key={item.id} value={item}>
              <span className="flex flex-col">
                <span>{fullName(item)}</span>
                {item.companyName ? (
                  <span className="text-xs text-muted-foreground">
                    {item.companyName}
                  </span>
                ) : null}
              </span>
            </ComboboxItem>
          )}
        </ComboboxList>
        <ComboboxEmpty>No contacts found.</ComboboxEmpty>
      </ComboboxContent>
    </Combobox>
  );
}
