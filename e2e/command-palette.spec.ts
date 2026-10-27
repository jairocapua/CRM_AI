import type { Locator, Page } from "@playwright/test";

import {
  bookingDialog,
  failReads,
  readContacts,
  readDeals,
  type SeededContact,
  type SeededDeal,
} from "./calendar-helpers";
import { expect, NAVIGATION, test } from "./fixtures";
import { settingsForm } from "./settings-helpers";

/**
 * The command palette (P10-T01): Ctrl+K (or the header's Search button)
 * opens it anywhere in the app; it lists the modules, two quick actions and,
 * once something is typed, the contacts and deals `api.*` finds.
 */

const palette = (page: Page): Locator =>
  page.getByRole("dialog", { name: "Command palette" });
const paletteInput = (page: Page): Locator =>
  palette(page).getByRole("combobox");
const option = (page: Page, text: string): Locator =>
  palette(page).getByRole("option").filter({ hasText: text });
const searchButton = (page: Page): Locator =>
  page.getByRole("button", { name: /^Search/ });

/** The modules and quick actions the palette lists before any search. */
const STATIC_TITLES = [
  "Dashboard",
  "Conversations",
  "Contacts",
  "Opportunities",
  "Calendars",
  "Automation",
  "Settings",
  "New contact",
  "Book appointment",
];

const lower = (text: string | null) => (text ?? "").toLowerCase();

/** A name typed into the palette that finds this record and nothing static. */
const clearOfStatic = (term: string) =>
  !STATIC_TITLES.some((title) => lower(title).includes(lower(term)));

/** A contact whose full name no other contact's searched fields contain. */
function searchableContact(contacts: readonly SeededContact[]): SeededContact {
  const found = contacts.find(
    (contact) =>
      clearOfStatic(contact.name) &&
      !contacts.some(
        (other) =>
          other.id !== contact.id &&
          [
            other.name,
            other.email,
            other.phone,
            other.companyName,
            other.jobTitle,
          ].some((field) => lower(field).includes(lower(contact.name))),
      ),
  );
  if (!found) throw new Error("No contact found alone by its name");
  return found;
}

/** A deal whose name no other deal's name or lost reason contains. */
function searchableDeal(deals: readonly SeededDeal[]): SeededDeal {
  const found = deals.find(
    (deal) =>
      clearOfStatic(deal.name) &&
      !deals.some(
        (other) =>
          other.id !== deal.id &&
          [other.name, other.lostReason].some((field) =>
            lower(field).includes(lower(deal.name)),
          ),
      ),
  );
  if (!found) throw new Error("No deal found alone by its name");
  return found;
}

async function openWithKeyboard(page: Page) {
  await page.keyboard.press("Control+K");
  await expect(palette(page)).toBeVisible();
  await expect(paletteInput(page)).toBeFocused();
}

/** Types `text` and waits until `pick` is the highlighted option. */
async function search(page: Page, text: string, pick: string) {
  await paletteInput(page).fill(text);
  await expect(option(page, pick)).toHaveAttribute("aria-selected", "true");
}

test("Ctrl+K from the contacts search box opens the palette; a contact's name and Enter open the contact", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/contacts");
  const contact = searchableContact(await readContacts(page));

  const contactsSearch = page.getByRole("textbox", { name: "Search contacts" });
  await contactsSearch.click();
  await expect(contactsSearch).toBeFocused();
  await openWithKeyboard(page);
  // Escape gives focus back to the field that had it.
  await page.keyboard.press("Escape");
  await expect(palette(page)).toBeHidden();
  await expect(contactsSearch).toBeFocused();
  await expect(contactsSearch).toHaveValue("");

  await openWithKeyboard(page);

  await search(page, contact.name, contact.name);
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(
    new RegExp(`/contacts/${contact.id}$`),
    NAVIGATION,
  );
  await expect(
    page.getByRole("heading", { level: 1, name: contact.name }),
  ).toBeVisible();
  await expect(palette(page)).toBeHidden();

  // Opened again, the last query is gone.
  await openWithKeyboard(page);
  await expect(paletteInput(page)).toHaveValue("");
});

test("a module name and Enter go to that module; a deal's name and Enter open the deal", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/dashboard");
  const deal = searchableDeal(await readDeals(page));

  await openWithKeyboard(page);
  await search(page, "Calendars", "Calendars");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/calendars$/, NAVIGATION);
  await expect(palette(page)).toBeHidden();

  await openWithKeyboard(page);
  await search(page, deal.name, deal.name);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(
    new RegExp(`/opportunities/${deal.id}$`),
    NAVIGATION,
  );
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(deal.name);
});

test("a search that matches nothing says No results", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/dashboard");
  await openWithKeyboard(page);
  await paletteInput(page).fill("zzqx nothing matches this");
  await expect(
    palette(page).getByText("No results", { exact: true }),
  ).toBeVisible();
  await expect(palette(page).getByRole("option")).toHaveCount(0);
});

test("New contact opens the add contact sheet, from another page and from the contacts page", async ({
  page,
  gotoApp,
}) => {
  const sheet = page.getByRole("dialog", { name: "Add contact" });

  await gotoApp("/dashboard");
  await openWithKeyboard(page);
  await search(page, "new contact", "New contact");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/contacts$/, NAVIGATION);
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/\/contacts$/);

  // Already on /contacts: the action still opens it.
  await openWithKeyboard(page);
  await search(page, "new contact", "New contact");
  await page.keyboard.press("Enter");
  await expect(sheet).toBeVisible();
  await expect(page).toHaveURL(/\/contacts$/);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  // A reload does not open it again.
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: "Contacts" }),
  ).toBeVisible();
  await expect(sheet).toBeHidden();
});

test("Book appointment opens the booking dialog, from another page and from the calendars page", async ({
  page,
  gotoApp,
}) => {
  const dialog = bookingDialog(page);

  await gotoApp("/dashboard");
  await openWithKeyboard(page);
  await search(page, "book", "Book appointment");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/calendars$/, NAVIGATION);
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/calendars$/);

  await openWithKeyboard(page);
  await search(page, "book", "Book appointment");
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/\/calendars$/);
});

test("from a profile with unsaved edits, picking a module asks first and Keep editing stays", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/profile");
  const firstName = settingsForm(page, "Your details").getByLabel(
    "First name",
    { exact: true },
  );
  await firstName.fill("Taylor");

  await openWithKeyboard(page);
  await search(page, "Dashboard", "Dashboard");
  await page.keyboard.press("Enter");

  const question = page.getByRole("alertdialog", {
    name: "Discard unsaved changes?",
  });
  await expect(question).toContainText("Your changes to your profile");
  await expect(page).toHaveURL(/\/settings\/profile$/);
  await question.getByRole("button", { name: "Keep editing" }).click();
  await expect(question).toBeHidden();
  await expect(page).toHaveURL(/\/settings\/profile$/);
  await expect(firstName).toHaveValue("Taylor");
  // Focus goes back to the field that had it before the palette opened.
  await expect(firstName).toBeFocused();
});

test("Ctrl+K does not open the palette over an open sheet, so its edits are not dropped", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/contacts");
  await page.getByRole("button", { name: "Add contact" }).first().click();
  const sheet = page.getByRole("dialog", { name: "Add contact" });
  await expect(sheet).toBeVisible();
  const firstName = sheet.getByLabel("First name", { exact: true });
  await firstName.fill("Taylor");

  await page.keyboard.press("Control+K");
  // Give a wrongly opened palette time to appear before asserting it did not.
  await page.waitForTimeout(300);
  await expect(palette(page)).toHaveCount(0);
  await expect(sheet).toBeVisible();
  await expect(firstName).toHaveValue("Taylor");
  await expect(firstName).toBeFocused();
});

test("Escape closes the palette and focus goes back to the Search button that opened it", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/dashboard");
  await searchButton(page).click();
  await expect(palette(page)).toBeVisible();
  await expect(paletteInput(page)).toBeFocused();
  // Every module is listed before anything is typed.
  await expect(option(page, "Automation")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(palette(page)).toBeHidden();
  await expect(searchButton(page)).toBeFocused();
});

test("a failed contacts search says so in the palette, which keeps working", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/dashboard");
  await failReads(page, "contacts");
  const error = palette(page).getByText("Could not search contacts and deals.");

  await openWithKeyboard(page);
  await paletteInput(page).fill("calendars");
  await expect(error).toBeVisible();

  // With the failure on screen, the modules are still there to pick.
  await expect(option(page, "Calendars")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/calendars$/, NAVIGATION);
});
