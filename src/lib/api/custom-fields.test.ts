import { describe, expect, it } from "vitest";

import type { CustomField, CustomFieldValue } from "@/types";
import { seededWorld, settle } from "@/lib/mock/testing";

/**
 * Removing a custom field also removes the values stored under its key, on
 * the records of its own object type only (P9-T01). Creating, editing,
 * reordering and the removal preview (P9-T04).
 */

async function world() {
  const { db } = await seededWorld();
  const customFields = await import("./custom-fields");
  const settings = await import("./settings");
  const cache = await import("./cache");
  const http = await import("./http");
  const field = (objectType: CustomField["objectType"], key: string) =>
    Object.values(db.getState().customFields).find(
      (f) => f.objectType === objectType && f.key === key,
    )!;
  /** One object type's fields, in position order. */
  const ordered = (objectType: CustomField["objectType"]) =>
    Object.values(db.getState().customFields)
      .filter((f) => f.objectType === objectType)
      .sort((a, b) => a.position - b.position);
  const report = () => settle(settings.integrityReport());
  /** Stores `value` under `key` on the first `n` contacts. */
  const giveContacts = (key: string, value: CustomFieldValue, n: number) => {
    const ids = Object.keys(db.getState().contacts).slice(0, n);
    db.setState((s) => ({
      contacts: {
        ...s.contacts,
        ...Object.fromEntries(
          ids.map((id) => [
            id,
            {
              ...s.contacts[id]!,
              customFields: { ...s.contacts[id]!.customFields, [key]: value },
            },
          ]),
        ),
      },
    }));
    return ids;
  };
  return {
    db,
    customFields,
    cache,
    http,
    field,
    ordered,
    report,
    giveContacts,
  };
}

describe("customFields.remove()", () => {
  it("removes a contact field's values from contacts, and only from contacts", async () => {
    const w = await world();
    const budget = w.field("contact", "budget_range");
    // A deal field with the same key: its values must survive.
    const dealBudget = await settle(
      w.customFields.create({
        key: "budget_range",
        label: "Deal budget",
        type: "text",
        objectType: "opportunity",
        required: false,
      }),
    );
    const deals = Object.values(w.db.getState().opportunities).slice(0, 3);
    w.db.setState((s) => ({
      opportunities: {
        ...s.opportunities,
        ...Object.fromEntries(
          deals.map((o) => [
            o.id,
            { ...o, customFields: { ...o.customFields, budget_range: "10k" } },
          ]),
        ),
      },
    }));
    const holding = Object.values(w.db.getState().contacts).filter(
      (c) => "budget_range" in c.customFields,
    );
    // Not vacuous: seeded contacts hold the key, and the deals hold it now.
    expect(holding.length).toBeGreaterThan(0);
    expect(await w.report()).toEqual([]);
    const before = {
      customFields: w.cache.revisionOf("customFields"),
      contacts: w.cache.revisionOf("contacts"),
    };

    await settle(w.customFields.remove(budget.id));

    const s = w.db.getState();
    expect(s.customFields[budget.id]).toBeUndefined();
    expect(s.customFields[dealBudget.id]).toBeDefined();
    expect(
      Object.values(s.contacts).filter((c) => "budget_range" in c.customFields),
    ).toEqual([]);
    // The contacts' other values are kept.
    for (const contact of holding) {
      expect(s.contacts[contact.id]!.customFields).toEqual(
        Object.fromEntries(
          Object.entries(contact.customFields).filter(
            ([key]) => key !== "budget_range",
          ),
        ),
      );
    }
    for (const deal of deals) {
      expect(s.opportunities[deal.id]!.customFields.budget_range).toBe("10k");
    }
    expect(w.cache.revisionOf("customFields")).toBeGreaterThan(
      before.customFields,
    );
    expect(w.cache.revisionOf("contacts")).toBeGreaterThan(before.contacts);
    expect(await w.report()).toEqual([]);
  });

  it("removes a deal field's values from deals and leaves contacts alone", async () => {
    const w = await world();
    const competitor = w.field("opportunity", "competitor");
    expect(
      Object.values(w.db.getState().opportunities).filter(
        (o) => "competitor" in o.customFields,
      ).length,
    ).toBeGreaterThan(0);
    const contacts = w.db.getState().contacts;
    const before = w.cache.revisionOf("opportunities");

    await settle(w.customFields.remove(competitor.id));

    const s = w.db.getState();
    expect(
      Object.values(s.opportunities).filter(
        (o) => "competitor" in o.customFields,
      ),
    ).toEqual([]);
    expect(s.contacts).toBe(contacts);
    expect(w.cache.revisionOf("opportunities")).toBeGreaterThan(before);
    expect(await w.report()).toEqual([]);
  });

  it("refuses an unknown field with a 404 and writes nothing", async () => {
    const w = await world();
    const before = w.db.getState();

    await expect(
      settle(w.customFields.remove("cf_nope")),
    ).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });

    expect(w.db.getState()).toBe(before);
  });
});

describe("customFields.create()", () => {
  it("saves a field with a key from its label, at the end of its object type", async () => {
    const w = await world();
    const siblings = w.ordered("contact").length;
    const dealFields = w.db.getState().customFields;
    expect(siblings).toBeGreaterThan(0);
    const before = w.cache.revisionOf("customFields");

    const created = await settle(
      w.customFields.create({
        objectType: "contact",
        label: "  Referral Code ",
        type: "text",
        required: true,
        placeholder: " R-123 ",
        helpText: "",
        options: [{ label: "dropped" }],
        // Not the form's: ignored.
        ...({ id: "cf_mine", position: 0, group: "Mine" } as object),
      }),
    );

    expect(created).toEqual({
      id: expect.stringMatching(/^cf_/),
      key: "referral_code",
      label: "Referral Code",
      type: "text",
      objectType: "contact",
      required: true,
      placeholder: "R-123",
      position: siblings,
      createdAt: expect.any(String),
      updatedAt: created.createdAt,
    });
    expect(created.id).not.toBe("cf_mine");
    expect(w.db.getState().customFields[created.id]).toEqual(created);
    expect(w.ordered("contact").at(-1)).toEqual(created);
    // The deal fields are untouched.
    for (const f of Object.values(dealFields)) {
      expect(w.db.getState().customFields[f.id]).toBe(f);
    }
    expect(w.cache.revisionOf("customFields")).toBeGreaterThan(before);
    expect(await w.report()).toEqual([]);
  });

  it("gives each option a value from its name, unique within the field", async () => {
    const w = await world();
    const created = await settle(
      w.customFields.create({
        objectType: "opportunity",
        label: "Tier",
        type: "multiselect",
        required: false,
        options: [
          // A sent value is not the API's to take on create.
          { label: "Gold", value: "silver" },
          { label: "Gold+" },
          { label: "€" },
        ],
      }),
    );
    expect(created.options).toEqual([
      { value: "gold", label: "Gold" },
      { value: "gold_2", label: "Gold+" },
      { value: "option", label: "€" },
    ]);
    expect(await w.report()).toEqual([]);
  });

  it.each([
    ["an empty label", { label: " ", type: "text" }, "label", "Enter a label."],
    [
      "a label with no letter or number",
      { label: "!!!", type: "text" },
      "label",
      "Use at least one letter from A to Z or a number.",
    ],
    [
      "a dropdown with no options",
      { label: "Tier", type: "select", options: [] },
      "options",
      "Add at least one option.",
    ],
    [
      "two options with one name",
      {
        label: "Tier",
        type: "select",
        options: [{ label: "Gold" }, { label: "GOLD" }],
      },
      "options.1.label",
      "GOLD is already an option.",
    ],
    [
      "an unknown type",
      { label: "Tier", type: "colour" },
      "type",
      "Choose a type from the list.",
    ],
  ])(
    "refuses %s with a 422 on the field and writes nothing",
    async (_, draft, field, message) => {
      const w = await world();
      const before = w.db.getState();
      await expect(
        settle(
          w.customFields.create({
            objectType: "contact",
            required: false,
            ...(draft as { label: string; type: CustomField["type"] }),
          }),
        ),
      ).rejects.toMatchObject({
        status: 422,
        code: "INVALID_CUSTOM_FIELD",
        field,
        message,
      });
      expect(w.db.getState()).toBe(before);
    },
  );

  it("refuses an object type other than contacts or deals", async () => {
    const w = await world();
    const before = w.db.getState();
    await expect(
      settle(
        w.customFields.create({
          objectType: "task" as CustomField["objectType"],
          label: "Effort",
          type: "number",
          required: false,
        }),
      ),
    ).rejects.toMatchObject({
      status: 422,
      code: "INVALID_CUSTOM_FIELD",
      field: "objectType",
    });
    expect(w.db.getState()).toBe(before);
  });

  it("refuses a key that is not snake_case", async () => {
    const w = await world();
    const before = w.db.getState();
    for (const key of ["Bad Key", "", "budget-range", "_"]) {
      await expect(
        settle(
          w.customFields.create({
            objectType: "contact",
            key,
            label: "Budget",
            type: "text",
            required: false,
          }),
        ),
      ).rejects.toMatchObject({
        status: 422,
        code: "INVALID_CUSTOM_FIELD",
        field: "key",
      });
    }
    expect(w.db.getState()).toBe(before);
  });

  it("refuses a label whose key a field of the same object type has, on the label", async () => {
    const w = await world();
    expect(w.field("contact", "budget_range").label).toBe("Budget Range");
    expect(w.field("opportunity", "competitor").label).toBe("Competitor");
    const before = w.db.getState();

    await expect(
      settle(
        w.customFields.create({
          objectType: "contact",
          label: "budget-RANGE",
          type: "text",
          required: false,
        }),
      ),
    ).rejects.toMatchObject({
      status: 409,
      code: "KEY_TAKEN",
      field: "label",
      message: "A contact field named Budget Range already exists.",
    });
    await expect(
      settle(
        w.customFields.create({
          objectType: "opportunity",
          label: "Competitor",
          type: "text",
          required: false,
        }),
      ),
    ).rejects.toMatchObject({
      status: 409,
      code: "KEY_TAKEN",
      field: "label",
      message: "A deal field named Competitor already exists.",
    });
    expect(w.db.getState()).toBe(before);

    // A deal field may share a contact field's key.
    const deal = await settle(
      w.customFields.create({
        objectType: "opportunity",
        label: "Budget Range",
        type: "text",
        required: false,
      }),
    );
    expect(deal.key).toBe("budget_range");
    expect(await w.report()).toEqual([]);
  });
});

describe("customFields.update()", () => {
  it("relabels a field and keeps its key, so stored values survive", async () => {
    const w = await world();
    const budget = w.field("contact", "budget_range");
    const holding = Object.values(w.db.getState().contacts).filter(
      (c) => "budget_range" in c.customFields,
    );
    expect(holding.length).toBeGreaterThan(0);
    const before = w.cache.revisionOf("customFields");

    const saved = await settle(
      w.customFields.update(budget.id, {
        label: " Budget ",
        required: true,
        helpText: " Monthly spend ",
      }),
    );

    expect(saved).toEqual({
      ...budget,
      label: "Budget",
      required: true,
      helpText: "Monthly spend",
      updatedAt: expect.any(String),
    });
    expect(saved.updatedAt >= budget.updatedAt).toBe(true);
    expect(w.db.getState().customFields[budget.id]).toEqual(saved);
    for (const contact of holding) {
      expect(w.db.getState().contacts[contact.id]).toBe(contact);
    }
    expect(w.cache.revisionOf("customFields")).toBeGreaterThan(before);
    expect(await w.report()).toEqual([]);
  });

  it("ignores the key, object type, type, position, id, timestamps and unknown keys", async () => {
    const w = await world();
    const budget = w.field("contact", "budget_range");
    expect(budget.type).toBe("select");

    const saved = await settle(
      w.customFields.update(budget.id, {
        label: "Budget",
        ...({
          key: "budget",
          objectType: "opportunity",
          type: "number",
          position: 7,
          id: "cf_other",
          createdAt: "2000-01-01T00:00:00.000Z",
          group: "Mine",
          colour: "red",
        } as object),
      }),
    );

    expect(saved).toEqual({
      ...budget,
      label: "Budget",
      updatedAt: saved.updatedAt,
    });
    expect(Object.keys(w.db.getState().customFields)).toContain(budget.id);
    expect(w.db.getState().customFields.cf_other).toBeUndefined();
    expect(await w.report()).toEqual([]);
  });

  it("keeps a relabelled option's value, gives a new one a fresh value and drops a removed one, leaving stored values alone", async () => {
    const w = await world();
    const budget = w.field("contact", "budget_range");
    expect(budget.options?.map((o) => o.value)).toEqual([
      "under_5k",
      "5k_15k",
      "15k_50k",
      "50k_plus",
    ]);
    // A contact holds the option about to be removed.
    const [holder] = w.giveContacts("budget_range", "50k_plus", 1);

    const saved = await settle(
      w.customFields.update(budget.id, {
        options: [
          { value: "under_5k", label: "Under $5,000" },
          { value: "5k_15k", label: "$5k - $15k" },
          { value: "15k_50k", label: "$15k - $50k" },
          // New, named like an existing value.
          { label: "Under 5k" },
          // An unknown value is a new option.
          { value: "made_up", label: "Enterprise" },
        ],
      }),
    );

    expect(saved.options).toEqual([
      { value: "under_5k", label: "Under $5,000" },
      { value: "5k_15k", label: "$5k - $15k" },
      { value: "15k_50k", label: "$15k - $50k" },
      { value: "under_5k_2", label: "Under 5k" },
      { value: "enterprise", label: "Enterprise" },
    ]);
    expect(w.db.getState().contacts[holder!]!.customFields.budget_range).toBe(
      "50k_plus",
    );
    expect(await w.report()).toEqual([]);
  });

  it("empties a placeholder by removing it", async () => {
    const w = await world();
    const budget = w.field("contact", "budget_range");
    const withOne = await settle(
      w.customFields.update(budget.id, { placeholder: "Pick a range" }),
    );
    expect(withOne.placeholder).toBe("Pick a range");
    const without = await settle(
      w.customFields.update(budget.id, { placeholder: "  " }),
    );
    expect("placeholder" in without).toBe(false);
  });

  it.each([
    [{ label: "" }, "label", "Enter a label."],
    [{ options: [] }, "options", "Add at least one option."],
    [
      { options: [{ value: "under_5k", label: "" }] },
      "options.0.label",
      "Enter a name for this option.",
    ],
  ])(
    "refuses %j with a 422 on the field and writes nothing",
    async (patch, field, message) => {
      const w = await world();
      const budget = w.field("contact", "budget_range");
      const before = w.db.getState();
      await expect(
        settle(w.customFields.update(budget.id, patch)),
      ).rejects.toMatchObject({
        status: 422,
        code: "INVALID_CUSTOM_FIELD",
        field,
        message,
      });
      expect(w.db.getState()).toBe(before);
    },
  );

  it("refuses an unknown field with a 404 and writes nothing", async () => {
    const w = await world();
    const before = w.db.getState();
    await expect(
      settle(w.customFields.update("cf_nope", { label: "X" })),
    ).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    expect(w.db.getState()).toBe(before);
  });
});

describe("customFields.reorder()", () => {
  it("stores one object type's order as positions 0..n-1", async () => {
    const w = await world();
    const contactIds = w.ordered("contact").map((f) => f.id);
    const deals = w.ordered("opportunity");
    expect(contactIds.length).toBeGreaterThan(2);
    const reversed = [...contactIds].reverse();
    const before = w.cache.revisionOf("customFields");

    await settle(w.customFields.reorder("contact", reversed));

    expect(w.ordered("contact").map((f) => f.id)).toEqual(reversed);
    expect(w.ordered("contact").map((f) => f.position)).toEqual(
      reversed.map((_, i) => i),
    );
    expect(await settle(w.customFields.list("contact"))).toEqual(
      w.ordered("contact"),
    );
    for (const deal of deals) {
      expect(w.db.getState().customFields[deal.id]).toBe(deal);
    }
    expect(w.cache.revisionOf("customFields")).toBeGreaterThan(before);
    expect(await w.report()).toEqual([]);
  });

  it.each([
    ["one missing", (ids: string[]) => ids.slice(1)],
    ["an unknown id", (ids: string[]) => [...ids, "cf_nope"]],
    ["one twice", (ids: string[]) => [...ids.slice(0, -1), ids[0]!]],
    [
      "a deal field in place of a contact field",
      (ids: string[], deal: string) => [...ids.slice(0, -1), deal],
    ],
    ["a deal field added", (ids: string[], deal: string) => [...ids, deal]],
  ])(
    "refuses an order with %s with a 422 and writes nothing",
    async (_, make) => {
      const w = await world();
      const ids = w.ordered("contact").map((f) => f.id);
      const deal = w.ordered("opportunity")[0]!.id;
      const before = w.db.getState();

      await expect(
        settle(w.customFields.reorder("contact", make(ids, deal))),
      ).rejects.toMatchObject({ status: 422, code: "INVALID_ORDER" });

      expect(w.db.getState()).toBe(before);
    },
  );
});

describe("customFields.removalPreview()", () => {
  it("counts the records remove() deletes a value from", async () => {
    const w = await world();
    const budget = w.field("contact", "budget_range");
    // Two contacts hold an empty value, as a saved form leaves one: remove()
    // deletes the key, but there is no value to count.
    const empty = w.giveContacts("budget_range", null, 2);
    const holding = Object.values(w.db.getState().contacts).filter(
      (c) =>
        c.customFields.budget_range !== undefined &&
        c.customFields.budget_range !== null,
    );
    expect(holding.length).toBeGreaterThan(0);

    const preview = await settle(w.customFields.removalPreview(budget.id));
    expect(preview).toEqual({ count: holding.length });

    const valuesBefore = new Map(
      Object.values(w.db.getState().contacts).map((c) => [
        c.id,
        c.customFields.budget_range,
      ]),
    );
    await settle(w.customFields.remove(budget.id));
    const lost = [...valuesBefore].filter(
      ([id, value]) =>
        value !== undefined &&
        value !== null &&
        !("budget_range" in w.db.getState().contacts[id]!.customFields),
    );
    expect(lost.length).toBe(preview.count);
    for (const id of empty) {
      expect("budget_range" in w.db.getState().contacts[id]!.customFields).toBe(
        false,
      );
    }
    expect(await w.report()).toEqual([]);
  });

  it("counts a deal field's values on deals, and none for a new field", async () => {
    const w = await world();
    const competitor = w.field("opportunity", "competitor");
    const holding = Object.values(w.db.getState().opportunities).filter(
      (o) => typeof o.customFields.competitor === "string",
    );
    expect(holding.length).toBeGreaterThan(0);
    expect(await settle(w.customFields.removalPreview(competitor.id))).toEqual({
      count: holding.length,
    });

    const fresh = await settle(
      w.customFields.create({
        objectType: "contact",
        label: "Referral Code",
        type: "text",
        required: false,
      }),
    );
    expect(await settle(w.customFields.removalPreview(fresh.id))).toEqual({
      count: 0,
    });
  });

  it("is a read: it never fails on the failure rate, and 404s an unknown field", async () => {
    const w = await world();
    const budget = w.field("contact", "budget_range");
    w.http.setTuning({ failureRate: 1 });
    await expect(
      settle(w.customFields.removalPreview(budget.id)),
    ).resolves.toMatchObject({ count: expect.any(Number) });
    await expect(
      settle(w.customFields.removalPreview("cf_nope")),
    ).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
  });
});

describe("a failed write writes nothing", () => {
  it("create, update, reorder and remove each fail whole at a 100% failure rate", async () => {
    const w = await world();
    const budget = w.field("contact", "budget_range");
    const ids = w.ordered("contact").map((f) => f.id);
    const before = w.db.getState();
    w.http.setTuning({ failureRate: 1 });

    for (const call of [
      () =>
        w.customFields.create({
          objectType: "contact",
          label: "Referral Code",
          type: "text",
          required: false,
        }),
      () => w.customFields.update(budget.id, { label: "Budget" }),
      () => w.customFields.reorder("contact", [...ids].reverse()),
      () => w.customFields.remove(budget.id),
    ] as (() => Promise<unknown>)[]) {
      await expect(settle(call())).rejects.toMatchObject({
        status: 503,
        code: "MOCK_FAILURE",
      });
    }
    expect(w.db.getState()).toBe(before);
  });
});

describe("positions after a removal", () => {
  it("renumbers the object type's fields left, so a new field goes last", async () => {
    const w = await world();
    const before = w.ordered("contact");
    expect(before.map((f) => f.position)).toEqual(before.map((_, i) => i));
    expect(before.length).toBeGreaterThan(4);
    const [, , middle, next] = before;

    await settle(w.customFields.remove(middle!.id));
    await settle(w.customFields.remove(next!.id));
    const left = w.ordered("contact");
    expect(left.map((f) => f.id)).toEqual(
      before.filter((f) => f !== middle && f !== next).map((f) => f.id),
    );
    expect(left.map((f) => f.position)).toEqual(left.map((_, i) => i));

    const created = await settle(
      w.customFields.create({
        objectType: "contact",
        label: "Referral Code",
        type: "text",
        required: false,
      }),
    );
    const after = w.ordered("contact");
    expect(after.at(-1)!.id).toBe(created.id);
    expect(after.map((f) => f.position)).toEqual(after.map((_, i) => i));
    expect(await w.report()).toEqual([]);
  });

  it("leaves the other object type's fields as they were", async () => {
    const w = await world();
    const deals = w.ordered("opportunity");
    await settle(w.customFields.remove(w.ordered("contact")[1]!.id));
    for (const deal of deals) {
      expect(w.db.getState().customFields[deal.id]).toBe(deal);
    }
  });

  it("puts a new field after the highest position, even with gaps", async () => {
    const w = await world();
    const last = w.ordered("contact").at(-1)!;
    w.db.setState((s) => ({
      customFields: {
        ...s.customFields,
        [last.id]: { ...last, position: 40 },
      },
    }));
    const created = await settle(
      w.customFields.create({
        objectType: "contact",
        label: "Referral Code",
        type: "text",
        required: false,
      }),
    );
    expect(created.position).toBe(41);
    expect(w.ordered("contact").at(-1)!.id).toBe(created.id);
  });
});

describe("a new option's value", () => {
  it("never takes a value records still hold for a removed option", async () => {
    const w = await world();
    const budget = w.field("contact", "budget_range");
    const [holder] = w.giveContacts("budget_range", "50k_plus", 1);
    const kept = budget.options!.filter((o) => o.value !== "50k_plus");

    // Removing the option leaves the contact holding its value.
    await settle(w.customFields.update(budget.id, { options: kept }));
    expect(
      w.field("contact", "budget_range").options!.map((o) => o.value),
    ).not.toContain("50k_plus");

    // A new option named like it gets another value.
    const saved = await settle(
      w.customFields.update(budget.id, {
        options: [...kept, { label: "50k plus" }],
      }),
    );
    expect(saved.options!.at(-1)).toEqual({
      value: "50k_plus_2",
      label: "50k plus",
    });
    expect(saved.options!.map((o) => o.value)).not.toContain("50k_plus");
    expect(w.db.getState().contacts[holder!]!.customFields.budget_range).toBe(
      "50k_plus",
    );
  });

  it("counts the items of a multi-select value as held", async () => {
    const w = await world();
    const tier = await settle(
      w.customFields.create({
        objectType: "contact",
        label: "Tier",
        type: "multiselect",
        required: false,
        options: [{ label: "Gold" }],
      }),
    );
    w.giveContacts("tier", ["silver", "gold"], 1);
    const saved = await settle(
      w.customFields.update(tier.id, {
        options: [{ value: "gold", label: "Gold" }, { label: "Silver" }],
      }),
    );
    expect(saved.options).toEqual([
      { value: "gold", label: "Gold" },
      { value: "silver_2", label: "Silver" },
    ]);
  });
});

describe("a checkbox field", () => {
  it("is saved as not required by create and update", async () => {
    const w = await world();
    const created = await settle(
      w.customFields.create({
        objectType: "contact",
        label: "VIP",
        type: "checkbox",
        required: true,
      }),
    );
    expect(created.required).toBe(false);

    const optIn = w.field("contact", "newsletter_opt_in");
    expect(optIn.type).toBe("checkbox");
    // Stored as required before this rule: the next save clears it.
    w.db.setState((s) => ({
      customFields: {
        ...s.customFields,
        [optIn.id]: { ...optIn, required: true },
      },
    }));
    expect(
      (await settle(w.customFields.update(optIn.id, { label: "Newsletter" })))
        .required,
    ).toBe(false);
    expect(
      (await settle(w.customFields.update(optIn.id, { required: true })))
        .required,
    ).toBe(false);
    // Any other type keeps it.
    const budget = w.field("contact", "budget_range");
    expect(
      (await settle(w.customFields.update(budget.id, { required: true })))
        .required,
    ).toBe(true);
  });

  it("takes and stores no placeholder or help text, however long", async () => {
    const w = await world();
    const created = await settle(
      w.customFields.create({
        objectType: "contact",
        label: "VIP",
        type: "checkbox",
        required: false,
        placeholder: "x".repeat(101),
        helpText: "y".repeat(201),
      }),
    );
    expect("placeholder" in created).toBe(false);
    expect("helpText" in created).toBe(false);

    const optIn = w.field("contact", "newsletter_opt_in");
    const saved = await settle(
      w.customFields.update(optIn.id, {
        placeholder: "x".repeat(101),
        helpText: "Ticked to get it",
      }),
    );
    expect("placeholder" in saved).toBe(false);
    expect("helpText" in saved).toBe(false);

    // A date shows help text but no placeholder.
    const audit = w.field("contact", "last_audit_date");
    expect(audit.type).toBe("date");
    const dated = await settle(
      w.customFields.update(audit.id, {
        placeholder: "x".repeat(101),
        helpText: "When we last looked",
      }),
    );
    expect("placeholder" in dated).toBe(false);
    expect(dated.helpText).toBe("When we last looked");
    // A text field still refuses a long one.
    await expect(
      settle(
        w.customFields.update(w.field("contact", "industry").id, {
          placeholder: "x".repeat(101),
        }),
      ),
    ).rejects.toMatchObject({ status: 422, field: "placeholder" });
  });
});

describe("holdsCustomFieldValue()", () => {
  it.each([
    ["an empty string", "", false],
    ["an empty list", [], false],
    ["null", null, false],
    ["no key at all", "absent", false],
    ["undefined", undefined, false],
    ["false (an unticked checkbox)", false, true],
    ["0", 0, true],
    ["a string", "x", true],
    ["a list with an item", ["x"], true],
  ] as const)("%s -> %s", async (_, value, holds) => {
    const { holdsCustomFieldValue } = await import("@/lib/mock/cascade");
    const values: Record<string, unknown> =
      value === "absent" ? {} : { k: value };
    expect(holdsCustomFieldValue(values, "k")).toBe(holds);
  });
});
