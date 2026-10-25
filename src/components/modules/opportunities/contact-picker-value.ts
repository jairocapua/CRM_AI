import { useState } from "react";

/**
 * The contact the ContactPicker hands its combobox as the value.
 *
 * - `held` is the contact the picker holds: the one just chosen from the
 *   list, or the first fetched copy of a value set from outside (editing a
 *   deal, booking from a contact's page); `useHeldValue` keeps it. A pick is
 *   used at once: `contacts.get` for the new id takes a simulated round trip,
 *   and until it lands the combobox would otherwise hold no value (or the
 *   previous one).
 * - `fetched`, what `contacts.get(value)` returned, is used only when its id
 *   is `value`: `useResource` keeps the previous key's data while the next
 *   key loads, so it can still hold the contact chosen before, or one that
 *   has since been cleared.
 * - `held` wins over a fetched copy with the same id. Base UI compares the
 *   value by reference (`useValueChanged(selectedValue, …)` in
 *   AriaCombobox.mjs): any new object counts as a new selection, and with
 *   `inputValue` uncontrolled Base UI then writes the label into the input,
 *   over anything typed since. The mock returns the store's own record, the
 *   same object the list gave, so today a refetched copy differs only after
 *   a write to that contact; once `http.ts` moves to `fetch()`, every
 *   response is a new object, and every invalidation refetches.
 *
 * Limit: a held contact keeps the name it had when it was picked or first
 * fetched, so a rename made elsewhere while the picker stays mounted does
 * not show in it. There is no refresh because nothing needs one: every
 * consumer (the deal sheet, the booking dialog, the new-conversation dialog)
 * unmounts the picker when its sheet or dialog closes (Base UI's dialog
 * popup is not kept mounted, and BookingForm is also keyed per open), and
 * the next open fetches afresh. A consumer that keeps the picker mounted
 * across opens would need one.
 */
export function pickerValue<T extends { id: string }>(
  value: string,
  held: T | null,
  fetched: T | undefined,
): T | null {
  if (held !== null && held.id === value) return held;
  return fetched !== undefined && fetched.id === value ? fetched : null;
}

/**
 * Holds the ContactPicker's value between renders, per `pickerValue`:
 * returns the value for this render and the setter a pick calls.
 *
 * A fetched copy that becomes the value (a value set from outside, or the
 * value moved to another id) is adopted as the held contact, so later
 * refetches of the same id, new objects, never replace it. The adoption is a
 * state update during render, guarded so it settles in one extra pass
 * (React's "storing information from previous renders"): an effect would
 * commit a frame with each new object first, and a ref cannot be read
 * during render.
 */
export function useHeldValue<T extends { id: string }>(
  value: string,
  fetched: T | undefined,
): readonly [T | null, (next: T | null) => void] {
  const [held, setHeld] = useState<T | null>(null);
  const current = pickerValue(value, held, fetched);
  // Adopt the first fetched copy for this id. On the extra pass `current` is
  // `held`, so the guard stops it.
  if (current !== null && current !== held) setHeld(current);
  return [current, setHeld] as const;
}
