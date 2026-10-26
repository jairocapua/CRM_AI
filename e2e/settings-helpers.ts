import type { Locator, Page } from "@playwright/test";

import { DB_KEY } from "./calendar-helpers";
import { expect, NAVIGATION } from "./fixtures";

/** Helpers the settings specs share (P9-T02). */

/** The section nav in the settings layout. */
export const sectionNav = (page: Page): Locator =>
  page.getByRole("navigation", { name: "Settings sections" });

/** The page's own `<h1>`, inside the shell's `<main>`. */
export const pageHeading = (page: Page, name: string): Locator =>
  page.getByRole("main").getByRole("heading", { level: 1, name, exact: true });

/** A form by its accessible name (its card's heading). */
export const settingsForm = (page: Page, name: string): Locator =>
  page.getByRole("form", { name });

/** The Save button of a settings form. */
export const saveButton = (form: Locator): Locator =>
  form.getByRole("button", { name: /^(Save changes|Saving…)$/ });

/** Opens a section by its link in the section nav. */
export async function openSection(
  page: Page,
  link: string,
  path: RegExp,
): Promise<void> {
  await sectionNav(page).getByRole("link", { name: link, exact: true }).click();
  await expect(page).toHaveURL(path, NAVIGATION);
}

/**
 * Sets the Demo Data page's failure rate (the second slider) to 100%, and,
 * when `slow`, its latency (the first) to the 3,000 ms maximum. Both live in
 * memory, so reach the page under test by links afterwards, not a reload;
 * each test's fresh context resets them. Call on `/settings/demo-data`.
 */
export async function failEveryMutation(
  page: Page,
  { slow = false }: { slow?: boolean } = {},
): Promise<void> {
  const main = page.getByRole("main");
  const failure = page.getByRole("slider").nth(1);
  await failure.focus();
  await failure.press("End");
  await expect(main.getByText("100%", { exact: true })).toBeVisible();
  if (slow) {
    const latency = page.getByRole("slider").nth(0);
    await latency.focus();
    await latency.press("End");
    await expect(main.getByText("3000 ms", { exact: true })).toBeVisible();
  }
}

/** The toast with this title. */
export const toastNamed = (page: Page, title: string): Locator =>
  page.locator("[data-sonner-toast]").filter({ hasText: title });

/** Accepts the browser's `beforeunload` prompt, so a reload of a page with
 *  unsaved edits goes ahead. */
export function acceptLeavePrompts(page: Page): void {
  page.on("dialog", (dialog) => void dialog.accept());
}

/* ------------------------------------------------------------------------ */
/* Custom fields (/settings/custom-fields, P9-T04; shared since P9-T07)      */
/* ------------------------------------------------------------------------ */

/** A custom field's object type, as the API names it. */
export type FieldObjectType = "contact" | "opportunity";

/** The page's words per object type (custom-fields-copy.ts OBJECT_COPY). */
const FIELD_COPY = {
  contact: {
    tab: "Contacts",
    heading: "Contact fields",
    title: "Add contact field",
  },
  opportunity: {
    tab: "Deals",
    heading: "Deal fields",
    title: "Add deal field",
  },
} as const satisfies Record<
  FieldObjectType,
  { tab: string; heading: string; title: string }
>;

/** A tab's list of fields, named by its heading. */
export const fieldList = (
  page: Page,
  heading: "Contact fields" | "Deal fields",
): Locator => page.getByRole("list", { name: heading, exact: true });

/** The rows of a field list. */
export const fieldRows = (list: Locator): Locator => list.getByRole("listitem");

/** The row of the field labelled `label`. */
export const fieldRow = (list: Locator, label: string): Locator =>
  fieldRows(list).filter({
    has: list.page().getByText(label, { exact: true }),
  });

/** The add or edit field dialog, by its title. */
export const fieldDialog = (page: Page, title: string): Locator =>
  page.getByRole("dialog", { name: title });

/** The form inside the field dialog titled `title`. */
export const fieldForm = (page: Page, title: string): Locator =>
  settingsForm(page, title);

/** The field dialog's submit button, in any of its states. */
export const fieldSubmitButton = (form: Locator): Locator =>
  form.getByRole("button", { name: /^(Add field|Save changes|Saving…)$/ });

/** Waits for the custom fields page, which opens on the Contacts tab. */
export async function openFieldsPage(page: Page): Promise<void> {
  await expect(pageHeading(page, "Custom fields")).toBeVisible(NAVIGATION);
  await expect(
    fieldRows(fieldList(page, "Contact fields")).first(),
  ).toBeVisible(NAVIGATION);
}

/** Shows `objectType`'s tab (Contacts or Deals) and waits for its heading. */
export async function openFieldsTab(
  page: Page,
  objectType: FieldObjectType,
): Promise<void> {
  const { tab, heading } = FIELD_COPY[objectType];
  const trigger = page.getByRole("tab", { name: tab, exact: true });
  if ((await trigger.getAttribute("aria-selected")) !== "true") {
    await trigger.click();
  }
  await expect(trigger).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("heading", { name: heading, exact: true }),
  ).toBeVisible();
}

/** Opens the add dialog on the open tab. */
export async function openAdd(
  page: Page,
  title = "Add contact field",
): Promise<Locator> {
  await page
    .getByRole("main")
    .getByRole("button", { name: "Add field", exact: true })
    .click();
  await expect(fieldDialog(page, title)).toBeVisible();
  return fieldForm(page, title);
}

/** Picks `option` in a Select. */
export async function choose(
  page: Page,
  select: Locator,
  option: string,
): Promise<void> {
  await select.click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

/** What `addField` sets in the field dialog. */
export interface NewField {
  /** Contacts (the default) or Deals tab. */
  objectType?: FieldObjectType;
  /** The Type as the dialog words it ("Dropdown", "Long text"); default
   *  Text, the dialog's own default. */
  type?: string;
  /** Ticks Required. A Checkbox field cannot be required ([P9-T04]: the
   *  dialog hides the box), so asking for one throws. */
  required?: boolean;
  /** Option names, in order: Dropdown and Multi-select only, at least one. */
  options?: readonly string[];
}

const OPTION_TYPES: readonly string[] = ["Dropdown", "Multi-select"];

/**
 * Adds a field through the field dialog on its object type's tab and waits
 * for its row (with a "Required" badge when required). Call it on the custom
 * fields page. Combinations the dialog cannot save throw before anything is
 * typed, so a test never quietly gets a different field than it asked for.
 */
export async function addField(
  page: Page,
  label: string,
  {
    objectType = "contact",
    type,
    required = false,
    options = [],
  }: NewField = {},
): Promise<void> {
  if (required && type === "Checkbox") {
    throw new Error(
      `addField("${label}"): a Checkbox field cannot be required.`,
    );
  }
  const takesOptions = type !== undefined && OPTION_TYPES.includes(type);
  if (takesOptions !== options.length > 0) {
    throw new Error(
      takesOptions
        ? `addField("${label}"): a ${type} field needs at least one option.`
        : `addField("${label}"): only a Dropdown or Multi-select field takes options.`,
    );
  }

  const { heading, title } = FIELD_COPY[objectType];
  await openFieldsTab(page, objectType);
  const form = await openAdd(page, title);
  await form.getByLabel("Label", { exact: true }).fill(label);
  if (type) {
    await choose(page, form.getByRole("combobox", { name: "Type" }), type);
  }
  for (const [index, name] of options.entries()) {
    // The dialog starts with one empty option row.
    if (index > 0) {
      await form
        .getByRole("button", { name: "Add option", exact: true })
        .click();
    }
    await form.getByLabel(`Option ${index + 1}`, { exact: true }).fill(name);
  }
  if (required) {
    const box = form.getByRole("checkbox", { name: "Required", exact: true });
    await box.check();
    await expect(box).toBeChecked();
  }
  await fieldSubmitButton(form).click();
  // An earlier add's toast may still show, hence first(); the closed dialog
  // and the new row are the proof that this add saved.
  await expect(toastNamed(page, "Field added").first()).toBeVisible();
  await expect(fieldDialog(page, title)).toBeHidden();
  const added = fieldRow(fieldList(page, heading), label);
  await expect(added).toBeVisible();
  await expect(added.getByText("Required", { exact: true })).toHaveCount(
    required ? 1 : 0,
  );
}

/** The persisted custom field labels of `objectType`, in position order. */
export async function storedFieldLabels(
  page: Page,
  objectType: FieldObjectType,
): Promise<string[]> {
  return page.evaluate(
    ([key, type]) => {
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      const db = JSON.parse(raw) as {
        state: {
          customFields: Record<
            string,
            { label: string; objectType: string; position: number }
          >;
        };
      };
      return Object.values(db.state.customFields)
        .filter((f) => f.objectType === type)
        .sort((a, b) => a.position - b.position)
        .map((f) => f.label);
    },
    [DB_KEY, objectType] as const,
  );
}

/** The custom field labels a contact or deal form shows, top to bottom
 *  (without the required " *"). */
export async function formFieldLabels(form: Locator): Promise<string[]> {
  const labels = await form
    .locator('label[for^="cf_"]')
    .evaluateAll((els) => els.map((el) => el.textContent ?? ""));
  return labels.map((label) => label.replace(/ \*$/, "").trim());
}
