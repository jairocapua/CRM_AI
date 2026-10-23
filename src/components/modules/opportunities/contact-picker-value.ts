/**
 * The contact the ContactPicker hands its combobox as the value.
 *
 * - `picked`, the contact just chosen from the list, is used at once:
 *   `contacts.get` for the new id takes a simulated round trip, and until it
 *   lands the combobox would otherwise hold no value (or the previous one).
 * - `fetched`, what `contacts.get(value)` returned, is used only when its id
 *   is `value`: `useResource` keeps the previous key's data while the next
 *   key loads, so it can still hold the contact chosen before, or one that
 *   has since been cleared.
 * - `picked` wins over a fetched copy with the same id. Base UI compares the
 *   value by reference (`useValueChanged(selectedValue, …)` in
 *   AriaCombobox.mjs): any new object counts as a new selection, and with
 *   `inputValue` uncontrolled Base UI then writes the label into the input,
 *   over anything typed after the pick. The mock returns the store's own
 *   record, the same object the list gave, so today the copy differs only
 *   after a write to that contact; once `http.ts` moves to `fetch()`, every
 *   response is a new object.
 *
 * A value set from outside (editing a deal, booking from a contact's page)
 * has nothing picked for it, so it shows once its fetch lands.
 */
export function pickerValue<T extends { id: string }>(
  value: string,
  picked: T | null,
  fetched: T | undefined,
): T | null {
  if (picked !== null && picked.id === value) return picked;
  return fetched !== undefined && fetched.id === value ? fetched : null;
}
