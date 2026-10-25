import { describe, expect, it } from "vitest";

import type { CustomField } from "@/types";
import { seededWorld, settle } from "@/lib/mock/testing";

/**
 * Removing a custom field also removes the values stored under its key, on
 * the records of its own object type only (P9-T01).
 */

async function world() {
  const { db } = await seededWorld();
  const customFields = await import("./custom-fields");
  const settings = await import("./settings");
  const cache = await import("./cache");
  const field = (objectType: CustomField["objectType"], key: string) =>
    Object.values(db.getState().customFields).find(
      (f) => f.objectType === objectType && f.key === key,
    )!;
  const report = () => settle(settings.integrityReport());
  return { db, customFields, cache, field, report };
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
