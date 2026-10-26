import type { Locator, Page } from "@playwright/test";

import {
  DB_KEY,
  failReads,
  loadErrorAlert,
  readFaultThrows,
  restoreReads,
} from "./calendar-helpers";
import { expect, NAVIGATION, test, waitForBoot } from "./fixtures";
import {
  addField,
  choose,
  failEveryMutation,
  fieldDialog,
  fieldForm,
  fieldList,
  fieldRow as row,
  fieldRows as rows,
  fieldSubmitButton as submitButton,
  formFieldLabels,
  openAdd,
  openFieldsPage,
  openFieldsTab,
  openSection,
  pageHeading,
  storedFieldLabels,
  toastNamed,
} from "./settings-helpers";

/**
 * The custom fields manager (P9-T04): a tab per object type listing its
 * fields in form order, adding, editing, moving and removing them, and the
 * contact and deal forms following along with no edits of their own.
 * Seeded: nine contact fields (Budget Range first, Internal Notes last) and
 * five deal fields, none required.
 */

const SEEDED_CONTACT_FIELDS = 9;
const NETWORK_FAILURE = "Network request failed. Please try again.";

const sidebarLink = (page: Page, name: string) =>
  page
    .locator('[data-slot="sidebar"]')
    .getByRole("link", { name, exact: true });

const contactFields = (page: Page) => fieldList(page, "Contact fields");

/** The labels in the list, top to bottom, read from each row's Edit button. */
async function listedLabels(list: Locator): Promise<string[]> {
  const names = await list
    .getByRole("button", { name: /^Edit / })
    .evaluateAll((buttons) =>
      buttons.map((b) => b.getAttribute("aria-label") ?? ""),
    );
  return names.map((name) => name.replace(/^Edit /, ""));
}

const removeDialog = (page: Page) => page.getByRole("alertdialog");

/** The custom values one contact holds, from the persisted store. */
async function storedValues(
  page: Page,
  contactId: string,
): Promise<Record<string, unknown>> {
  return page.evaluate(
    ([key, id]) => {
      const raw = localStorage.getItem(key);
      if (!raw) return {};
      const db = JSON.parse(raw) as {
        state: { contacts: Record<string, { customFields: object }> };
      };
      return { ...db.state.contacts[id]!.customFields };
    },
    [DB_KEY, contactId] as const,
  );
}

/** Opens the first contact in the contacts list, by links; returns its id. */
async function openFirstContact(page: Page): Promise<string> {
  await sidebarLink(page, "Contacts").click();
  await expect(page).toHaveURL(/\/contacts$/, NAVIGATION);
  const link = page
    .getByRole("main")
    .locator('a[href^="/contacts/con_"]')
    .first();
  await expect(link).toBeVisible(NAVIGATION);
  const href = (await link.getAttribute("href")) ?? "";
  await link.click();
  await expect(page).toHaveURL(new RegExp(`${href}$`), NAVIGATION);
  return href.replace("/contacts/", "");
}

/** Opens the contact's edit sheet from its page. */
async function openContactForm(page: Page) {
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Edit contact" });
  await expect(sheet).toBeVisible();
  // The custom fields mount once their read resolves.
  await expect(sheet.locator('label[for^="cf_"]').first()).toBeVisible();
  return sheet;
}

/** The value next to `label` in the contact page's details. */
const detailValue = (page: Page, label: string) =>
  page
    .getByRole("main")
    .getByText(label, { exact: true })
    .locator("xpath=following-sibling::span[1]");

/** Opens Settings › Custom fields by links. */
async function openFieldsByLinks(page: Page) {
  await sidebarLink(page, "Settings").click();
  await expect(pageHeading(page, "Settings")).toBeVisible(NAVIGATION);
  await page
    .getByRole("main")
    .getByRole("link", { name: "Custom fields", exact: true })
    .click();
  await expect(page).toHaveURL(/\/settings\/custom-fields$/, NAVIGATION);
  await openFieldsPage(page);
}

test("an added contact field shows on the contact form and saves a value; removing it deletes the value", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/custom-fields");
  await openFieldsPage(page);
  await expect(rows(contactFields(page))).toHaveCount(SEEDED_CONTACT_FIELDS);
  await addField(page, "Referral Code");
  // New fields go last, as Text.
  await expect(rows(contactFields(page))).toHaveCount(
    SEEDED_CONTACT_FIELDS + 1,
  );
  await expect(rows(contactFields(page)).last()).toContainText(
    /Referral Code\s*Text/,
  );

  const id = await openFirstContact(page);
  const sheet = await openContactForm(page);
  await expect(sheet.getByLabel("Referral Code", { exact: true })).toHaveValue(
    "",
  );
  await sheet.getByLabel("Referral Code", { exact: true }).fill("R-1001");
  await sheet
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(sheet).toBeHidden();
  await expect(detailValue(page, "Referral Code")).toHaveText("R-1001");
  await expect
    .poll(async () => (await storedValues(page, id)).referral_code)
    .toBe("R-1001");

  await page.reload();
  await waitForBoot(page);
  await expect(detailValue(page, "Referral Code")).toHaveText(
    "R-1001",
    NAVIGATION,
  );

  await openFieldsByLinks(page);
  await page
    .getByRole("button", { name: "Remove Referral Code", exact: true })
    .click();
  const dialog = removeDialog(page);
  await expect(dialog).toContainText(
    "1 contact holds a value for Referral Code; that value is deleted with it.",
  );
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await dialog
    .getByRole("button", { name: "Remove field", exact: true })
    .click();
  await expect(toastNamed(page, "Field removed")).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(row(contactFields(page), "Referral Code")).toHaveCount(0);
  await expect(rows(contactFields(page))).toHaveCount(SEEDED_CONTACT_FIELDS);
  await expect(
    page.getByRole("heading", { name: "Contact fields", exact: true }),
  ).toBeFocused();
  await expect
    .poll(async () => "referral_code" in (await storedValues(page, id)))
    .toBe(false);

  await gotoApp(`/contacts/${id}`);
  await expect(page.getByRole("main").getByText("Referral Code")).toHaveCount(
    0,
  );
  let form = await openContactForm(page);
  await expect(form.getByLabel("Referral Code", { exact: true })).toHaveCount(
    0,
  );
  await page.keyboard.press("Escape");
  await expect(form).toBeHidden();

  // The same label again is a new, empty field: the old value is gone.
  await gotoApp("/settings/custom-fields");
  await openFieldsPage(page);
  await addField(page, "Referral Code");
  await gotoApp(`/contacts/${id}`);
  await expect(detailValue(page, "Referral Code")).toHaveText("—", NAVIGATION);
  form = await openContactForm(page);
  await expect(form.getByLabel("Referral Code", { exact: true })).toHaveValue(
    "",
  );
});

test("moving fields changes the contact form's order, and focus stays on the moved field's button", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/custom-fields");
  await openFieldsPage(page);
  const list = contactFields(page);
  const before = await listedLabels(list);
  expect(before[0]).toBe("Budget Range");
  expect(before.at(-1)).toBe("Internal Notes");

  const down = page.getByRole("button", {
    name: "Move Budget Range down",
    exact: true,
  });
  await down.click();
  await expect(rows(list).nth(1)).toContainText("Budget Range");
  await expect(down).toBeFocused();
  await expect(down).not.toHaveAttribute("aria-disabled", "true");

  const up = page.getByRole("button", {
    name: "Move Internal Notes up",
    exact: true,
  });
  await up.click();
  await expect(rows(list).nth(SEEDED_CONTACT_FIELDS - 2)).toContainText(
    "Internal Notes",
  );
  await expect(up).toBeFocused();

  // At the ends, the outer buttons are disabled but stay in the tab order.
  await expect(
    page.getByRole("button", { name: "Move Company Size up", exact: true }),
  ).toHaveAttribute("aria-disabled", "true");

  const after = await listedLabels(list);
  expect(after).not.toEqual(before);
  expect([...after].sort()).toEqual([...before].sort());
  await expect.poll(() => storedFieldLabels(page, "contact")).toEqual(after);

  await page.reload();
  await waitForBoot(page);
  await openFieldsPage(page);
  expect(await listedLabels(contactFields(page))).toEqual(after);

  await openFirstContact(page);
  const sheet = await openContactForm(page);
  expect(await formFieldLabels(sheet)).toEqual(after);
});

test("a second move waits for the first to be read back, so the order never jumps back", async ({
  page,
  gotoApp,
}) => {
  // Slow reads and writes (no failures), so the list read after the first
  // move is still on its way when the second move is pressed.
  await gotoApp("/settings/demo-data");
  const latency = page.getByRole("slider").nth(0);
  await latency.focus();
  await latency.press("End");
  await expect(
    page.getByRole("main").getByText("3000 ms", { exact: true }),
  ).toBeVisible();
  await openSection(page, "Custom fields", /\/settings\/custom-fields$/);
  await openFieldsPage(page);
  const before = await listedLabels(contactFields(page));

  // Records every order the list shows, each change once.
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { __orders: string[] }).__orders = seen;
    const record = () => {
      const order = [
        ...document.querySelectorAll('ol button[aria-label^="Edit "]'),
      ]
        .map((b) => b.getAttribute("aria-label"))
        .join("|");
      if (seen.at(-1) !== order) seen.push(order);
    };
    record();
    new MutationObserver(record).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
    });
  });

  const down = page.getByRole("button", {
    name: "Move Budget Range down",
    exact: true,
  });
  await down.click();
  await expect(down).toHaveAttribute("aria-disabled", "true");
  await expect(down).not.toHaveAttribute("aria-disabled", "true", {
    timeout: 15_000,
  });
  await down.click();
  await expect(rows(contactFields(page)).nth(2)).toContainText("Budget Range");
  await expect(down).not.toHaveAttribute("aria-disabled", "true", {
    timeout: 15_000,
  });

  const orders = await page.evaluate(
    () => (window as unknown as { __orders: string[] }).__orders,
  );
  const asOrder = (labels: string[]) =>
    labels.map((label) => `Edit ${label}`).join("|");
  const once = [before[1]!, before[0]!, ...before.slice(2)];
  const twice = [before[1]!, before[2]!, before[0]!, ...before.slice(3)];
  expect(orders).toEqual([asOrder(before), asOrder(once), asOrder(twice)]);
  await expect(down).toBeFocused();
});

test("a label another contact field has is refused on the Label field", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/custom-fields");
  await openFieldsPage(page);
  const form = await openAdd(page);
  await form.getByLabel("Label", { exact: true }).fill("budget-RANGE");
  await submitButton(form).click();

  const label = form.getByLabel("Label", { exact: true });
  await expect(label).toHaveAttribute("aria-invalid", "true");
  await expect(label).toHaveAccessibleDescription(
    "A contact field named Budget Range already exists.",
  );
  await expect(label).toBeFocused();
  await expect(label).toHaveValue("budget-RANGE");
  await expect(toastNamed(page, "Field added")).toHaveCount(0);

  await form.getByRole("button", { name: "Cancel" }).click();
  await expect(rows(contactFields(page))).toHaveCount(SEEDED_CONTACT_FIELDS);
  expect(await storedFieldLabels(page, "contact")).toHaveLength(
    SEEDED_CONTACT_FIELDS,
  );
});

test("an empty label and an unnamed option are marked, and nothing is stored", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/custom-fields");
  await openFieldsPage(page);
  const form = await openAdd(page);
  await submitButton(form).click();

  const label = form.getByLabel("Label", { exact: true });
  await expect(label).toHaveAttribute("aria-invalid", "true");
  await expect(label).toHaveAccessibleDescription("Enter a label.");
  // Text has no options.
  await expect(form.getByLabel("Option 1", { exact: true })).toHaveCount(0);

  await label.fill("Tier");
  await choose(page, form.getByRole("combobox", { name: "Type" }), "Dropdown");
  await submitButton(form).click();
  const option = form.getByLabel("Option 1", { exact: true });
  await expect(option).toHaveAttribute("aria-invalid", "true");
  await expect(option).toHaveAccessibleDescription(
    "Enter a name for this option.",
  );
  await expect(label).not.toHaveAttribute("aria-invalid");
  // The only row cannot be removed.
  await expect(
    form.getByRole("button", { name: "Remove option 1", exact: true }),
  ).toBeDisabled();
  await expect(toastNamed(page, "Field added")).toHaveCount(0);
  expect(await storedFieldLabels(page, "contact")).toHaveLength(
    SEEDED_CONTACT_FIELDS,
  );

  // Two options, the second named like the first: refused on the second.
  await option.fill("Gold");
  await form.getByRole("button", { name: "Add option", exact: true }).click();
  const second = form.getByLabel("Option 2", { exact: true });
  await expect(second).toBeFocused();
  await second.fill("gold");
  await submitButton(form).click();
  await expect(second).toHaveAccessibleDescription(
    "gold is already an option.",
  );

  await second.fill("Silver");
  await submitButton(form).click();
  await expect(toastNamed(page, "Field added")).toBeVisible();
  await expect(row(contactFields(page), "Tier")).toContainText("Dropdown");
});

test("a relabelled field keeps its values and shows its new label on the contact form", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/custom-fields");
  await openFieldsPage(page);
  // A contact with an Industry value (a seeded text field).
  const holder = await page.evaluate((key) => {
    const db = JSON.parse(localStorage.getItem(key)!) as {
      state: {
        contacts: Record<string, { customFields: Record<string, unknown> }>;
      };
    };
    const [id, contact] = Object.entries(db.state.contacts).find(
      ([, c]) => typeof c.customFields.industry === "string",
    )!;
    return { id, industry: contact.customFields.industry as string };
  }, DB_KEY);

  await page
    .getByRole("button", { name: "Edit Industry", exact: true })
    .click();
  const form = fieldForm(page, "Edit contact field");
  await expect(form.getByLabel("Type", { exact: true })).toHaveValue("Text");
  await expect(form.getByRole("combobox", { name: "Type" })).toHaveCount(0);
  await form.getByLabel("Label", { exact: true }).fill("Sector");
  await submitButton(form).click();
  await expect(toastNamed(page, "Field saved")).toBeVisible();
  await expect(fieldDialog(page, "Edit contact field")).toBeHidden();
  await expect(row(contactFields(page), "Sector")).toBeVisible();
  await expect(row(contactFields(page), "Industry")).toHaveCount(0);

  await gotoApp(`/contacts/${holder.id}`);
  await expect(detailValue(page, "Sector")).toHaveText(
    holder.industry,
    NAVIGATION,
  );
  const sheet = await openContactForm(page);
  await expect(sheet.getByLabel("Sector", { exact: true })).toHaveValue(
    holder.industry,
  );
  await expect(sheet.getByLabel("Industry", { exact: true })).toHaveCount(0);
  expect((await storedValues(page, holder.id)).industry).toBe(holder.industry);
});

test("an edited field shows its new label at once, before the list is read again", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/custom-fields");
  await openFieldsPage(page);
  await page
    .getByRole("button", { name: "Edit Lead Magnet", exact: true })
    .click();
  const form = fieldForm(page, "Edit contact field");
  await form.getByLabel("Label", { exact: true }).fill("Lead Source Offer");

  // The save reads the field by key, so it succeeds; the list's refetch
  // after it fails, so the list keeps its last data.
  await failReads(page, "customFields");
  const throwsBefore = await readFaultThrows(page);
  await submitButton(form).click();
  await expect(toastNamed(page, "Field saved")).toBeVisible();
  await expect(fieldDialog(page, "Edit contact field")).toBeHidden();
  await expect.poll(() => readFaultThrows(page)).toBeGreaterThan(throwsBefore);
  await expect(row(contactFields(page), "Lead Source Offer")).toBeVisible();
  await expect(row(contactFields(page), "Lead Magnet")).toHaveCount(0);

  // Edit opens on the saved values, not the old ones.
  await page
    .getByRole("button", { name: "Edit Lead Source Offer", exact: true })
    .click();
  const again = fieldForm(page, "Edit contact field");
  await expect(again.getByLabel("Label", { exact: true })).toHaveValue(
    "Lead Source Offer",
  );

  // A second edit, its refetch failing too: the newest save shows.
  const throwsAgain = await readFaultThrows(page);
  await again.getByLabel("Label", { exact: true }).fill("Offer Downloaded");
  await submitButton(again).click();
  await expect(fieldDialog(page, "Edit contact field")).toBeHidden();
  await expect.poll(() => readFaultThrows(page)).toBeGreaterThan(throwsAgain);
  await expect(row(contactFields(page), "Offer Downloaded")).toBeVisible();
  await expect(row(contactFields(page), "Lead Source Offer")).toHaveCount(0);
  await expect(row(contactFields(page), "Lead Magnet")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Edit Offer Downloaded", exact: true })
    .click();
  await expect(
    fieldForm(page, "Edit contact field").getByLabel("Label", { exact: true }),
  ).toHaveValue("Offer Downloaded");
});

test("a failed removal keeps the dialog open with focus on its button, and removes nothing", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/demo-data");
  await failEveryMutation(page, { slow: true });
  await openSection(page, "Custom fields", /\/settings\/custom-fields$/);
  await openFieldsPage(page);
  const before = await storedFieldLabels(page, "contact");

  await page
    .getByRole("button", { name: "Remove Budget Range", exact: true })
    .click();
  const dialog = removeDialog(page);
  // The count is a read, so it loads (slowly) despite the failure rate.
  await expect(dialog).toContainText(/holds? a value for Budget Range/, {
    timeout: 10_000,
  });
  const confirm = dialog.getByRole("button", {
    name: /^(Remove field|Removing…)$/,
  });
  await confirm.click();
  await expect(confirm).toHaveText("Removing…");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();

  await expect(toastNamed(page, NETWORK_FAILURE)).toBeVisible({
    timeout: 10_000,
  });
  await expect(confirm).toHaveText("Remove field");
  await expect(confirm).toBeFocused();
  await expect(dialog).toBeVisible();
  // The modal hides the page from the accessibility tree: close it to look.
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(row(contactFields(page), "Budget Range")).toHaveCount(1);
  expect(await storedFieldLabels(page, "contact")).toEqual(before);
});

test("a removed field's row goes at once, before the list is read again", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/custom-fields");
  await openFieldsPage(page);
  await page
    .getByRole("button", { name: "Remove Lead Magnet", exact: true })
    .click();
  const dialog = removeDialog(page);
  await expect(dialog).toContainText("hold a value for Lead Magnet");

  // The removal reads the field by key, so it succeeds; the list's refetch
  // after it fails, so the list keeps its last data, Lead Magnet included.
  await failReads(page, "customFields");
  const throwsBefore = await readFaultThrows(page);
  await dialog
    .getByRole("button", { name: "Remove field", exact: true })
    .click();
  await expect(toastNamed(page, "Field removed")).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect.poll(() => readFaultThrows(page)).toBeGreaterThan(throwsBefore);
  await expect(row(contactFields(page), "Lead Magnet")).toHaveCount(0);
  await expect(rows(contactFields(page))).toHaveCount(
    SEEDED_CONTACT_FIELDS - 1,
  );
  await expect(
    page.getByRole("heading", { name: "Contact fields", exact: true }),
  ).toBeFocused();
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
});

test("the list failing to load shows one alert, and Retry brings it back", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/profile");
  await expect(pageHeading(page, "Profile")).toBeVisible(NAVIGATION);
  await failReads(page, "customFields");
  await openSection(page, "Custom fields", /\/settings\/custom-fields$/);

  const alert = loadErrorAlert(page, "Could not load the custom fields");
  await expect(alert).toBeVisible(NAVIGATION);
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(1);
  await expect(contactFields(page)).toHaveCount(0);

  await restoreReads(page);
  await alert.getByRole("button", { name: "Retry" }).click();
  await expect(rows(contactFields(page))).toHaveCount(SEEDED_CONTACT_FIELDS);
  await expect(alert).toHaveCount(0);
});

test("the removal count failing shows an alert in the dialog, and Retry brings it back", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/custom-fields");
  await openFieldsPage(page);
  await failReads(page, "contacts");
  await page
    .getByRole("button", { name: "Remove Budget Range", exact: true })
    .click();

  const dialog = removeDialog(page);
  const alert = dialog
    .getByRole("alert")
    .filter({ hasText: "Could not count the values for Budget Range" });
  await expect(alert).toBeVisible();
  await expect(dialog.getByRole("alert")).toHaveCount(1);
  const confirm = dialog.getByRole("button", {
    name: "Remove field",
    exact: true,
  });
  await expect(confirm).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);

  await restoreReads(page);
  await alert.getByRole("button", { name: "Retry" }).click();
  await expect(alert).toHaveCount(0);
  await expect(dialog).toContainText(
    /\d+ contacts? holds? a value for Budget Range/,
  );
  await expect(confirm).not.toHaveAttribute("aria-disabled", "true");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(row(contactFields(page), "Budget Range")).toBeVisible();
});

test("the field dialog cannot close while saving, and a refused save keeps what was typed", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/demo-data");
  await failEveryMutation(page, { slow: true });
  await openSection(page, "Custom fields", /\/settings\/custom-fields$/);
  await openFieldsPage(page);

  const form = await openAdd(page);
  await form.getByLabel("Label", { exact: true }).fill("Referral Code");
  await form
    .getByLabel("Help text (optional)", { exact: true })
    .fill("From the partner");
  await submitButton(form).click();
  await expect(submitButton(form)).toHaveText("Saving…");
  const cancel = form.getByRole("button", { name: "Cancel" });
  await expect(cancel).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(fieldDialog(page, "Add contact field")).toBeVisible();

  await expect(
    form.getByRole("alert").filter({ hasText: NETWORK_FAILURE }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(submitButton(form)).toHaveText("Add field");
  await expect(submitButton(form)).toBeFocused();
  await expect(form.getByLabel("Label", { exact: true })).toHaveValue(
    "Referral Code",
  );
  await expect(
    form.getByLabel("Help text (optional)", { exact: true }),
  ).toHaveValue("From the partner");
  await expect(toastNamed(page, "Field added")).toHaveCount(0);
  await cancel.click();
  await expect(fieldDialog(page, "Add contact field")).toBeHidden();
  await expect(rows(contactFields(page))).toHaveCount(SEEDED_CONTACT_FIELDS);
});

test("a failed move says why and the stored order comes back", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/demo-data");
  await failEveryMutation(page);
  await openSection(page, "Custom fields", /\/settings\/custom-fields$/);
  await openFieldsPage(page);
  const list = contactFields(page);
  const before = await listedLabels(list);

  const down = page.getByRole("button", {
    name: "Move Budget Range down",
    exact: true,
  });
  await down.click();
  await expect(toastNamed(page, NETWORK_FAILURE)).toBeVisible({
    timeout: 10_000,
  });
  await expect(rows(list).first()).toContainText("Budget Range");
  expect(await listedLabels(list)).toEqual(before);
  await expect(down).toBeFocused();
});

test("a deal field added on the Deals tab shows on the new deal form", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/custom-fields");
  await openFieldsPage(page);
  await openFieldsTab(page, "opportunity");
  await expect(rows(fieldList(page, "Deal fields"))).toHaveCount(5);
  await addField(page, "Setup Fee", {
    objectType: "opportunity",
    type: "Currency",
  });
  await expect(row(fieldList(page, "Deal fields"), "Setup Fee")).toContainText(
    "Currency",
  );
  // The contact list is untouched.
  expect(await storedFieldLabels(page, "contact")).not.toContain("Setup Fee");

  await sidebarLink(page, "Opportunities").click();
  await expect(page).toHaveURL(/\/opportunities$/, NAVIGATION);
  await page
    .getByRole("button", { name: "New deal", exact: true })
    .click(NAVIGATION);
  const dialog = page.getByRole("dialog", { name: "New deal" });
  await expect(dialog.getByLabel("Setup Fee", { exact: true })).toBeVisible();
  expect((await formFieldLabels(dialog)).at(-1)).toBe("Setup Fee");
});

/** Whether a `beforeunload` listener would ask: dispatches a cancelable one
 *  and reports whether it was cancelled. Nothing unloads. */
const beforeUnloadPrevented = (page: Page) =>
  page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });

test("a changed field dialog holds the unsaved-changes guard until it closes", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/custom-fields");
  await openFieldsPage(page);
  const discard = page.getByRole("alertdialog", {
    name: "Discard unsaved changes?",
  });

  for (const close of ["Cancel", "Escape"] as const) {
    const form = await openAdd(page);
    await expect.poll(() => beforeUnloadPrevented(page)).toBe(false);
    await form.getByLabel("Label", { exact: true }).fill("Referral Code");
    // The dialog is modal, so no link can be clicked while it is open; a
    // reload or a closed tab asks first.
    await expect.poll(() => beforeUnloadPrevented(page)).toBe(true);
    if (close === "Cancel") {
      await form.getByRole("button", { name: "Cancel" }).click();
    } else {
      await page.keyboard.press("Escape");
    }
    await expect(fieldDialog(page, "Add contact field")).toBeHidden();
    await expect.poll(() => beforeUnloadPrevented(page)).toBe(false);
  }

  await openSection(page, "Profile", /\/settings\/profile$/);
  await expect(discard).toHaveCount(0);
  await expect(pageHeading(page, "Profile")).toBeVisible(NAVIGATION);
});
