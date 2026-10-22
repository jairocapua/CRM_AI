import type { Locator, Page } from "@playwright/test";

import {
  bookingDialog,
  readContacts,
  type SeededContact,
} from "./calendar-helpers";
import { expect, test } from "./fixtures";

/**
 * The contact picker, in the two forms that book against a contact: the deal
 * sheet ("New deal") and the booking dialog. It lists what the server's
 * search found (full name, email, phone, company, job title) as the server
 * returned it, with no second filter by label in the browser, and it adds
 * the selected contact to the list only while the input is empty or shows
 * that contact's name.
 *
 * Contacts are chosen from the persisted database, an oracle the UI does not
 * share, so that each search below has exactly one possible answer.
 *
 * Results arrive after a 250ms debounce plus simulated latency, and until
 * then the previous results stay listed. Every list is asserted with an
 * auto-retrying `toHaveText([...])`, never a count read mid-flight.
 */

test.use({ timezoneId: "Asia/Singapore", locale: "en-US" });

interface Surface {
  name: string;
  /** Opens the form and returns its Contact combobox. */
  open: (
    page: Page,
    gotoApp: (path: string) => Promise<void>,
  ) => Promise<Locator>;
}

const SKELETON = '[data-slot="skeleton"]';

const SURFACES: Surface[] = [
  {
    name: "deal sheet",
    open: async (page, gotoApp) => {
      await gotoApp("/opportunities");
      await expect(page.locator(SKELETON)).toHaveCount(0, { timeout: 15_000 });
      await page.getByRole("button", { name: "New deal", exact: true }).click();
      return page
        .getByRole("dialog", { name: "New deal" })
        .getByRole("combobox", { name: "Contact" });
    },
  },
  {
    name: "booking dialog",
    open: async (page, gotoApp) => {
      await gotoApp("/calendars");
      await expect(page.locator(SKELETON)).toHaveCount(0, { timeout: 15_000 });
      await page.getByRole("button", { name: "Book", exact: true }).click();
      return bookingDialog(page).getByRole("combobox", { name: "Contact" });
    },
  },
];

const lower = (text: string | null) => (text ?? "").toLowerCase();

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** An option's text starts with the contact's name (its company follows). */
const startsWithName = (contact: SeededContact) =>
  new RegExp(`^${escapeRegExp(contact.name)}`);

/** The listed option whose name line is exactly this contact's name. */
const optionFor = (page: Page, contact: SeededContact) =>
  page
    .getByRole("option")
    .filter({ has: page.getByText(contact.name, { exact: true }) });

/**
 * A: a full name no one else has, and an email no other contact's email
 * contains, so searching it finds A alone.
 * B: another contact whose email is likewise found alone.
 * C: a company name that is not part of any other contact's name, email or
 * company, so searching it finds C alone.
 */
function pickContacts(contacts: readonly SeededContact[]) {
  const others = (contact: SeededContact) =>
    contacts.filter((other) => other.id !== contact.id);
  const emailAlone = (contact: SeededContact) =>
    contact.email !== null &&
    !others(contact).some((other) =>
      lower(other.email).includes(lower(contact.email)),
    );

  const a = contacts.find(
    (contact) =>
      emailAlone(contact) &&
      !others(contact).some((other) => other.name === contact.name),
  );
  if (!a) throw new Error("No contact with a unique name and email");

  const b = contacts.find(
    (contact) => contact.id !== a.id && emailAlone(contact),
  );
  if (!b) throw new Error("No second contact with a unique email");

  const c = contacts.find(
    (contact) =>
      contact.companyName !== null &&
      !others(contact).some((other) =>
        [other.name, other.email, other.companyName].some((field) =>
          lower(field).includes(lower(contact.companyName)),
        ),
      ),
  );
  if (!c) throw new Error("No contact with a company of its own");

  return { a, b, c };
}

/** Types the full name, picks the option and checks the input shows it. */
async function chooseByName(
  page: Page,
  input: Locator,
  contact: SeededContact,
) {
  await input.fill(contact.name);
  await expect(optionFor(page, contact)).toBeVisible();
  await optionFor(page, contact).click();
  await expect(input).toHaveValue(contact.name);
}

for (const surface of SURFACES) {
  test(`${surface.name}: finds a contact by its full name`, async ({
    page,
    gotoApp,
  }) => {
    const input = await surface.open(page, gotoApp);
    const { a } = pickContacts(await readContacts(page));

    await chooseByName(page, input, a);
  });

  test(`${surface.name}: lists what the server found, not only label matches`, async ({
    page,
    gotoApp,
  }) => {
    const input = await surface.open(page, gotoApp);
    const { a, c } = pickContacts(await readContacts(page));

    // An email is not part of the label, yet the server found it.
    await input.fill(a.email ?? "");
    await expect(page.getByRole("option")).toHaveText([startsWithName(a)]);

    // Nor is a company name.
    await input.fill(c.companyName ?? "");
    await expect(page.getByRole("option")).toHaveText([startsWithName(c)]);
  });

  test(`${surface.name}: does not pin the selected contact above an unrelated search`, async ({
    page,
    gotoApp,
  }) => {
    const input = await surface.open(page, gotoApp);
    const { a, b } = pickContacts(await readContacts(page));

    await chooseByName(page, input, a);
    // The chosen contact is fetched after the click, and when it lands Base UI
    // writes its name back into the input, over anything typed meanwhile. So
    // first reopen the list and wait until A is ticked as selected.
    await input.press("ArrowDown");
    await expect(optionFor(page, a)).toHaveAttribute("aria-selected", "true");

    // A is selected, but this search finds only B.
    await input.fill(b.email ?? "");
    await expect(page.getByRole("option")).toHaveText([startsWithName(b)]);

    // And a search that finds nothing says so, with nothing listed.
    await input.fill("zzqx no such contact");
    await expect(page.getByText("No contacts found.")).toBeVisible();
    await expect(page.getByRole("option")).toHaveCount(0);
  });
}
