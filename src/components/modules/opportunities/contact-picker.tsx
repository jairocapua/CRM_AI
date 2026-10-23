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
import { pickerValue } from "./contact-picker-value";

const PAGE_SIZE = 20;

/**
 * Single-select contact search. The list is server-queried rather than loaded
 * whole — there are hundreds of contacts and only the matches are needed.
 *
 * Results are shown as the server returns them (`filter={null}`): the server
 * has already matched the full name, email, phone, company and job title, and
 * Base UI's default filter would match those rows again against their label
 * (the name) alone, dropping every hit by email, phone, company or title.
 *
 * A pick is held in local state and is the combobox value at once, without
 * waiting for its own fetch. The fetched contact serves a value set from
 * outside (editing a deal, booking from a contact's page), and is used only
 * when its id is `value`. See `pickerValue` for why the pick wins over a
 * fetched copy of itself.
 *
 * The selected contact is added to the list only while the input is empty or
 * shows that contact's name; see `showCurrent` below.
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
  // The contact last chosen from the list, the value until `value` moves on.
  const [picked, setPicked] = useState<Contact | null>(null);

  const results = useResource(
    "contacts",
    () =>
      api.contacts.list({
        q: debounced.trim() || undefined,
        pageSize: PAGE_SIZE,
      }),
    debounced,
  );

  // A value set from outside may not be in the current result page, so it is
  // fetched on its own. After a pick the picked contact is the value at once,
  // and this fetch is used only for a value nothing here picked (and only
  // once its id matches: useResource keeps the previous id's contact while
  // the next one loads).
  const selected = useResource(
    "contacts",
    () => (value ? api.contacts.get(value) : Promise.resolve(undefined)),
    value || "none",
  );

  const rows = results.data?.rows ?? [];
  const current: Contact | null = pickerValue(value, picked, selected.data);
  // It is added to the list only while the input is empty or shows its name,
  // so it can be found there, ticked, when it is not on this page of results.
  // Under any other search it would sit above the server's results and hide
  // "No contacts found." when nothing matched.
  const term = debounced.trim();
  const showCurrent =
    current !== null &&
    (term === "" || term.toLowerCase() === fullName(current).toLowerCase());
  const items: Contact[] =
    showCurrent && !rows.some((row) => row.id === current.id)
      ? [current, ...rows]
      : rows;

  return (
    <Combobox<Contact, false>
      items={items}
      // The server has already searched; show its rows as returned.
      filter={null}
      disabled={disabled}
      value={current}
      isItemEqualToValue={(a, b) => a.id === b.id}
      itemToStringLabel={(item) => fullName(item)}
      // `inputValue` is deliberately uncontrolled: controlling it would pin the
      // input to the search term and blank out the selected contact's name when
      // editing an existing deal. Listening is enough to drive the query.
      onInputValueChange={setQuery}
      onValueChange={(next) => {
        setPicked(next);
        onChange(next?.id ?? "");
      }}
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
