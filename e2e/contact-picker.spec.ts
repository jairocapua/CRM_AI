import type { Locator, Page } from "@playwright/test";

import {
  bookingDialog,
  pauseTimers,
  readContacts,
  type SeededContact,
} from "./calendar-helpers";
import { expect, test } from "./fixtures";

/**
 * The contact picker, in the three forms that pick a contact: the deal sheet
 * ("New deal"), the booking dialog and the new-conversation dialog. It lists
 * what the server's search found (full name, email, phone, company, job
 * title) as the server returned it, with no second filter by label in the
 * browser, and it adds the selected contact to the list only while the input
 * is empty or shows that contact's name. A pick is the value at once, so text
 * typed straight after it stays in the input.
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
  {
    name: "new-conversation dialog",
    open: async (page, gotoApp) => {
      await gotoApp("/conversations");
      await expect(page.locator(SKELETON)).toHaveCount(0, { timeout: 15_000 });
      await page.getByRole("button", { name: "New", exact: true }).click();
      return page
        .getByRole("dialog", { name: "New conversation" })
        .getByRole("combobox", { name: "Contact" });
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
 * The fields the server's search looks in. Mirrors `SEARCH_FIELDS` in
 * src/lib/api/contacts.ts: the full name, email, phone, company and job title.
 */
const searched = (contact: SeededContact) => [
  contact.name,
  contact.email,
  contact.phone,
  contact.companyName,
  contact.jobTitle,
];

/**
 * Three contacts, each checked against every field the server searches (the
 * full name, email, phone, company and job title):
 * A: a full name no one else has, and an email no other contact's searched
 * fields contain, so searching it finds A alone.
 * B: another contact whose email is likewise found alone.
 * C: a company name no other contact's searched fields contain, so searching
 * it finds C alone.
 */
function pickContacts(contacts: readonly SeededContact[]) {
  const others = (contact: SeededContact) =>
    contacts.filter((other) => other.id !== contact.id);
  /** Searching `term` can find this contact and no other. */
  const foundAlone = (contact: SeededContact, term: string | null) =>
    term !== null &&
    !others(contact).some((other) =>
      searched(other).some((field) => lower(field).includes(lower(term))),
    );

  const a = contacts.find(
    (contact) =>
      foundAlone(contact, contact.email) &&
      !others(contact).some((other) => other.name === contact.name),
  );
  if (!a) throw new Error("No contact with a unique name and email");

  const b = contacts.find(
    (contact) => contact.id !== a.id && foundAlone(contact, contact.email),
  );
  if (!b) throw new Error("No second contact with a unique email");

  const c = contacts.find((contact) =>
    foundAlone(contact, contact.companyName),
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

    // A is selected, but this search finds only B.
    await input.fill(b.email ?? "");
    await expect(page.getByRole("option")).toHaveText([startsWithName(b)]);

    // And a search that finds nothing says so, with nothing listed.
    await input.fill("zzqx no such contact");
    await expect(page.getByText("No contacts found.")).toBeVisible();
    await expect(page.getByRole("option")).toHaveCount(0);
  });

  test(`${surface.name}: keeps what is typed right after a pick`, async ({
    page,
    gotoApp,
  }) => {
    const input = await surface.open(page, gotoApp);
    const { a, b } = pickContacts(await readContacts(page));
    // Installed only now that the app has loaded: installed before, it breaks
    // @date-fns/tz (LEARNINGS P7-T08). Until paused it keeps the wall
    // clock's pace, so the app runs as usual.
    await page.clock.install();

    await input.fill(a.name);
    await expect(optionFor(page, a)).toBeVisible();
    // The old picker took its value only from A's own fetch, `contacts.get`,
    // which lands one simulated round trip after the click (165-275ms at the
    // default latency, http.ts). When it landed, the picker wrote A's name
    // back over the input. So this test catches the old picker only if the
    // typing happens before that fetch lands. Left to the wall clock, a busy
    // machine (every worker running) sometimes took longer than that between
    // the click and the fill, and the old picker passed.
    //
    // So the page's timers stop across the click and the fill: A's fetch
    // cannot land until `resume()`, however slow the machine. After it, that
    // fetch (165-275ms) lands before the search for B's email can (a 250ms
    // debounce, then its own round trip), so the old picker has overwritten
    // the input before B is ever listed.
    await pauseTimers(page);
    await optionFor(page, a).click();
    await input.fill(b.email ?? "");
    await page.clock.resume();
    await expect(page.getByRole("option")).toHaveText([startsWithName(b)]);
    await expect(input).toHaveValue(b.email ?? "");

    // A is still the selected contact.
    await input.fill(a.name);
    await expect(optionFor(page, a)).toHaveAttribute("aria-selected", "true");
  });
}
