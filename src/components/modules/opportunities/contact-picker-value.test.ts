import { describe, expect, it } from "vitest";

import { pickerValue } from "./contact-picker-value";

/**
 * Which contact the ContactPicker hands its combobox as the value in one
 * render: the held one (a pick, or the first fetched copy of a value set from
 * outside), or the one `contacts.get` fetched for `value`. The helper is
 * generic over anything with an id, so plain literals stand in for contacts.
 * Every expectation is a specific object, compared by reference (`toBe`),
 * because Base UI compares the value that way too. What is held across
 * renders is useHeldValue's job: contact-picker-value.hook.test.ts.
 */

const A = { id: "a", name: "Ada Lovelace" };
/** The same contact as A, as a second fetch returns it: a new object. */
const A2 = { id: "a", name: "Ada Lovelace" };
/** Another contact, the one held before. */
const Z = { id: "z", name: "Zora Neale" };

describe("pickerValue", () => {
  it("uses the held contact at once, before its own fetch lands", () => {
    // A was just picked; contacts.get(a) is still in flight.
    expect(pickerValue("a", A, undefined)).toBe(A);
    // useResource still holds the previous id's contact while a loads.
    expect(pickerValue("a", A, Z)).toBe(A);
  });

  it("keeps the held object when the fetch for the same id lands", () => {
    // A2 is equal to A but not the same object. Handing it over would count
    // as a change of value, and Base UI would write the label back into the
    // input over whatever was typed since the pick. The same rule keeps a
    // held fetched copy over a later refetch of it.
    expect(pickerValue("a", A, A2)).toBe(A);
  });

  it("uses the fetched contact for a value set from outside", () => {
    // Nothing is held yet: editing a deal, or booking from a contact.
    expect(pickerValue("a", null, A2)).toBe(A2);
    // A held contact that the value has since moved away from is ignored.
    expect(pickerValue("a", Z, A2)).toBe(A2);
  });

  it("shows nothing while the value's own fetch is in flight, or once cleared", () => {
    // The value moved to b; useResource still holds a until b lands.
    expect(pickerValue("b", null, A)).toBeNull();
    expect(pickerValue("b", Z, A)).toBeNull();
    // Cleared: the held contact and its fetch no longer count.
    expect(pickerValue("", A, A)).toBeNull();
  });
});
