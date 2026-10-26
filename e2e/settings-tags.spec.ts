import type { Locator, Page } from "@playwright/test";

import {
  DB_KEY,
  failReads,
  loadErrorAlert,
  readFaultThrows,
  restoreReads,
} from "./calendar-helpers";
import { expect, NAVIGATION, test } from "./fixtures";
import {
  failEveryMutation,
  openSection,
  pageHeading,
  settingsForm,
  toastNamed,
} from "./settings-helpers";

/**
 * The tags manager (P9-T06): every tag with its contact count, creating,
 * renaming, recolouring, removing and merging tags, and the tags an
 * automation names keeping their name, and the tag picker's answer when the
 * API refuses a tag it creates. Tags are found by their seed names,
 * which are constants (src/lib/mock/seed/core.ts); which contacts and deals
 * carry them is random, so counts and merge pairs come from the stored data.
 */

const SEEDED_TAGS = 24;
const NETWORK_FAILURE = "Network request failed. Please try again.";
/** The seeded tags an automation names (src/lib/automations). */
const NAMED_TAGS = new Set([
  "Churn Risk",
  "Demo Booked",
  "Needs Follow Up",
  "Newsletter",
  "Proposal Sent",
]);

const sidebarLink = (page: Page, name: string) =>
  page
    .locator('[data-slot="sidebar"]')
    .getByRole("link", { name, exact: true });
const table = (page: Page) =>
  page.getByRole("table", { name: "All tags", exact: true });
const bodyRows = (page: Page) => table(page).locator("tbody").getByRole("row");
const tagRow = (page: Page, name: string) =>
  bodyRows(page).filter({ has: page.getByText(name, { exact: true }) });
/** A tag's Contacts cell. */
const countCell = (page: Page, name: string) =>
  tagRow(page, name).getByRole("cell").nth(1);
const tagsHeading = (page: Page) =>
  page.getByRole("heading", { name: "All tags", exact: true });
const alertDialog = (page: Page) => page.getByRole("alertdialog");
const tagForm = (page: Page, title: "New tag" | "Edit tag") =>
  settingsForm(page, title);
const submitButton = (form: Locator) =>
  form.getByRole("button", {
    name: /^(Create tag|Save changes|Creating…|Saving…)$/,
  });
const action = (page: Page, verb: "Edit" | "Merge" | "Remove", name: string) =>
  page.getByRole("button", { name: `${verb} ${name}`, exact: true });

async function openTagsPage(page: Page) {
  await expect(pageHeading(page, "Tags")).toBeVisible(NAVIGATION);
  await expect(bodyRows(page).first()).toBeVisible(NAVIGATION);
}

/** The tag names in the table, top to bottom, from each Edit button. */
async function listedNames(page: Page): Promise<string[]> {
  const names = await table(page)
    .getByRole("button", { name: /^Edit / })
    .evaluateAll((buttons) =>
      buttons.map((b) => b.getAttribute("aria-label") ?? ""),
    );
  return names.map((name) => name.replace(/^Edit /, ""));
}

interface StoredTag {
  id: string;
  name: string;
  slug: string;
  color: string;
}
interface Tagged {
  id: string;
  tagIds: string[];
}
interface Stored {
  tags: StoredTag[];
  contacts: Tagged[];
  deals: Tagged[];
}

/**
 * The persisted tags, contacts and deals, straight from localStorage. Read
 * through `Object.entries`, which the e2e read fault leaves alone.
 */
async function stored(page: Page): Promise<Stored> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (!raw) return { tags: [], contacts: [], deals: [] };
    const db = JSON.parse(raw) as {
      state: {
        tags: Record<string, StoredTag>;
        contacts: Record<string, Tagged>;
        opportunities: Record<string, Tagged>;
      };
    };
    const rows = <T>(table: Record<string, T>) =>
      Object.entries(table).map(([, row]) => row);
    return {
      tags: rows(db.state.tags),
      contacts: rows(db.state.contacts),
      deals: rows(db.state.opportunities),
    };
  }, DB_KEY);
}

/** "1 contact", "12 contacts", as the dialogs count. */
const counted = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

const tagNamed = (s: Stored, name: string) =>
  s.tags.find((t) => t.name === name);
const carrying = (records: Tagged[], id: string) =>
  records.filter((r) => r.tagIds.includes(id));

/** Unnamed tags, by name. */
const plainTags = (s: Stored) =>
  s.tags
    .filter((t) => !NAMED_TAGS.has(t.name))
    .sort((a, b) => a.name.localeCompare(b.name));

/** An unnamed tag on at least one contact and one deal. */
function tagWithRecords(s: Stored, skip: string[] = []): StoredTag {
  const tag = plainTags(s).find(
    (t) =>
      !skip.includes(t.name) &&
      carrying(s.contacts, t.id).length > 0 &&
      carrying(s.deals, t.id).length > 0,
  );
  expect(tag, "an unnamed tag on contacts and deals").toBeDefined();
  return tag!;
}

/**
 * Two unnamed tags where A is on contacts and deals, shares at least one
 * contact with B and has one B lacks, and the contact counts of B before
 * (`bCount`) and after merging A into B (`union`, so `union > bCount`).
 */
function mergePair(s: Stored): {
  a: StoredTag;
  b: StoredTag;
  union: number;
  bCount: number;
  aDeals: string[];
} {
  for (const a of plainTags(s)) {
    const aContacts = carrying(s.contacts, a.id);
    const aDeals = carrying(s.deals, a.id).map((d) => d.id);
    if (aContacts.length === 0 || aDeals.length === 0) continue;
    for (const b of plainTags(s)) {
      if (b.id === a.id) continue;
      const shared = aContacts.filter((c) => c.tagIds.includes(b.id));
      if (shared.length === 0) continue;
      const bCount = carrying(s.contacts, b.id).length;
      const union = s.contacts.filter(
        (c) => c.tagIds.includes(a.id) || c.tagIds.includes(b.id),
      ).length;
      // B's count must grow, or a test of the count shown after the merge
      // would pass on B's old count.
      if (union <= bCount) continue;
      return { a, b, union, bCount, aDeals };
    }
  }
  throw new Error("no seeded pair of tags to merge");
}

/** Picks `target` in the open merge dialog. */
async function pickTarget(page: Page, target: string) {
  await alertDialog(page)
    .getByRole("combobox", { name: "Merge into", exact: true })
    .click();
  await page
    .getByRole("option", { name: new RegExp(`^${target} \\(`) })
    .click();
}

/** Opens Demo Data by links and expects a clean integrity report. */
async function expectCleanIntegrity(page: Page) {
  await sidebarLink(page, "Settings").click();
  await expect(pageHeading(page, "Settings")).toBeVisible(NAVIGATION);
  await page
    .getByRole("main")
    .getByRole("link", { name: "Demo data", exact: true })
    .click();
  await expect(
    page.getByText("No problems found — every reference resolves."),
  ).toBeVisible(NAVIGATION);
}

test("merging tag A into B leaves B with the combined count and A gone", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/tags");
  await openTagsPage(page);
  const before = await stored(page);
  const { a, b, union, aDeals } = mergePair(before);
  const aContacts = carrying(before.contacts, a.id).length;
  // Not vacuous: A and B share a contact, so the count is the union, not
  // the sum, and A really has deals.
  expect(union).toBeLessThan(
    aContacts + carrying(before.contacts, b.id).length,
  );
  expect(aDeals.length).toBeGreaterThan(0);
  await expect(countCell(page, a.name)).toHaveText(String(aContacts));

  await action(page, "Merge", a.name).click();
  const dialog = alertDialog(page);
  await expect(dialog).toHaveAccessibleName(`Merge ${a.name} into another tag`);
  const confirm = dialog.getByRole("button", { name: "Merge tags" });
  await expect(confirm).toHaveAttribute("aria-disabled", "true");
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();

  await pickTarget(page, b.name);
  const moved = `${counted(aContacts, "contact")} and ${counted(aDeals.length, "deal")} tagged ${a.name} get ${b.name} instead.`;
  await expect(dialog).toContainText(moved);
  await expect(dialog).toContainText(
    `${b.name} ends up on ${counted(union, "contact")}.`,
  );
  await expect(dialog).toContainText(`${a.name} is deleted.`);
  await expect(confirm).not.toHaveAttribute("aria-disabled", "true");

  await confirm.click();
  await expect(toastNamed(page, "Tags merged")).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(tagsHeading(page)).toBeFocused();
  await expect(tagRow(page, a.name)).toHaveCount(0);
  await expect(countCell(page, b.name)).toHaveText(String(union));
  await expect(bodyRows(page)).toHaveCount(SEEDED_TAGS - 1);

  await expect
    .poll(async () => tagNamed(await stored(page), a.name))
    .toBeUndefined();
  const after = await stored(page);
  expect(carrying(after.contacts, a.id)).toEqual([]);
  expect(carrying(after.deals, a.id)).toEqual([]);
  expect(carrying(after.contacts, b.id)).toHaveLength(union);
  for (const id of aDeals) {
    expect(after.deals.find((d) => d.id === id)!.tagIds).toContain(b.id);
  }

  await page.reload();
  await openTagsPage(page);
  await expect(tagRow(page, a.name)).toHaveCount(0);
  await expect(countCell(page, b.name)).toHaveText(String(union));
  await expectCleanIntegrity(page);
});

test("a merge shows its result at once, before the list is read again", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/tags");
  await openTagsPage(page);
  const { a, b, union, bCount } = mergePair(await stored(page));
  // Not vacuous: B's count grows, so B's old count cannot pass for it.
  expect(union).toBeGreaterThan(bCount);
  await expect(countCell(page, b.name)).toHaveText(String(bCount));

  await action(page, "Merge", a.name).click();
  const dialog = alertDialog(page);
  await pickTarget(page, b.name);
  await expect(dialog).toContainText(
    `${b.name} ends up on ${counted(union, "contact")}.`,
  );

  // The merge reads tags by key, so it succeeds; the list's refetch after
  // it fails, so the list keeps its counts from before the merge.
  await failReads(page, "tags");
  const throwsBefore = await readFaultThrows(page);
  await dialog.getByRole("button", { name: "Merge tags" }).click();
  await expect(toastNamed(page, "Tags merged")).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect.poll(() => readFaultThrows(page)).toBeGreaterThan(throwsBefore);
  await expect(tagRow(page, a.name)).toHaveCount(0);
  await expect(countCell(page, b.name)).toHaveText(String(union));
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
});

test("a new tag is checked, created, and still listed after a reload", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/tags");
  await openTagsPage(page);

  await page
    .getByRole("main")
    .getByRole("button", { name: "New tag", exact: true })
    .click();
  const form = tagForm(page, "New tag");
  const name = form.getByLabel("Name", { exact: true });
  await submitButton(form).click();
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(name).toHaveAccessibleDescription("Enter a tag name.");
  await expect(toastNamed(page, "Tag created")).toHaveCount(0);
  expect((await stored(page)).tags).toHaveLength(SEEDED_TAGS);

  await name.fill("  Podcast Guests ");
  await form.getByRole("radio", { name: "Teal", exact: true }).click();
  await submitButton(form).click();
  await expect(toastNamed(page, "Tag created")).toBeVisible();
  await expect(form).toBeHidden();
  await expect(countCell(page, "Podcast Guests")).toHaveText("0");
  expect(await listedNames(page)).toEqual(
    [...(await listedNames(page))].sort((x, y) => x.localeCompare(y)),
  );

  await expect
    .poll(async () => tagNamed(await stored(page), "Podcast Guests"))
    .toMatchObject({ slug: "podcast-guests", color: "teal" });
  await page.reload();
  await openTagsPage(page);
  await expect(tagRow(page, "Podcast Guests")).toHaveCount(1);
  await expect(bodyRows(page)).toHaveCount(SEEDED_TAGS + 1);
});

test("a tag is renamed and recoloured, and a name another tag has is refused on the field", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/tags");
  await openTagsPage(page);

  await action(page, "Edit", "Cold").click();
  const form = tagForm(page, "Edit tag");
  const name = form.getByLabel("Name", { exact: true });
  await expect(name).toHaveValue("Cold");
  await expect(
    form.getByRole("radio", { name: "Slate", exact: true }),
  ).toBeChecked();
  await name.fill(" hot LEAD ");
  await submitButton(form).click();
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(name).toHaveAccessibleDescription(
    "A tag named Hot Lead already exists.",
  );
  await expect(name).toBeFocused();
  await expect(name).toHaveValue(" hot LEAD ");
  expect(tagNamed(await stored(page), "Cold")).toBeDefined();

  await name.fill("Frozen Leads");
  await form.getByRole("radio", { name: "Pink", exact: true }).click();
  await submitButton(form).click();
  await expect(toastNamed(page, "Tag saved")).toBeVisible();
  await expect(form).toBeHidden();
  await expect(tagRow(page, "Frozen Leads")).toHaveCount(1);
  await expect(tagRow(page, "Cold")).toHaveCount(0);
  await expect
    .poll(async () => tagNamed(await stored(page), "Frozen Leads"))
    .toMatchObject({ slug: "frozen-leads", color: "pink" });

  // A new tag with another tag's name is refused the same way.
  await page
    .getByRole("main")
    .getByRole("button", { name: "New tag", exact: true })
    .click();
  const create = tagForm(page, "New tag");
  const newName = create.getByLabel("Name", { exact: true });
  await newName.fill("vip");
  await submitButton(create).click();
  await expect(newName).toHaveAccessibleDescription(
    "A tag named VIP already exists.",
  );
  await expect(newName).toBeFocused();
  await create.getByRole("button", { name: "Cancel" }).click();
  await expect(create).toBeHidden();
  expect((await stored(page)).tags).toHaveLength(SEEDED_TAGS);
});

test("a tag an automation names keeps its name: read-only in Edit, and Remove and Merge say why with Close only", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/tags");
  await openTagsPage(page);
  const sentence = (doing: string) =>
    `Demo Booked is named in the Appointment Reminders automation. Ask your developer to change it before ${doing}.`;

  await action(page, "Edit", "Demo Booked").click();
  const form = tagForm(page, "Edit tag");
  const name = form.getByLabel("Name", { exact: true });
  await expect(name).toHaveValue("Demo Booked");
  await expect(name).toHaveAttribute("readonly", "");
  await expect(name).toHaveAccessibleDescription(
    sentence("renaming Demo Booked"),
  );
  // The colour can still change.
  await form.getByRole("radio", { name: "Green", exact: true }).click();
  await submitButton(form).click();
  await expect(toastNamed(page, "Tag saved")).toBeVisible();
  await expect(form).toBeHidden();
  await expect
    .poll(async () => tagNamed(await stored(page), "Demo Booked")?.color)
    .toBe("green");

  await action(page, "Remove", "Demo Booked").click();
  const remove = alertDialog(page);
  await expect(remove).toHaveAccessibleName("Demo Booked can't be removed");
  await expect(remove).toContainText(sentence("removing Demo Booked"));
  await expect(remove.getByRole("button")).toHaveText(["Close"]);
  await remove.getByRole("button", { name: "Close" }).click();
  await expect(remove).toBeHidden();

  await action(page, "Merge", "Demo Booked").click();
  const merge = alertDialog(page);
  await expect(merge).toHaveAccessibleName("Demo Booked can't be merged away");
  await expect(merge).toContainText(
    sentence("merging Demo Booked into another tag"),
  );
  await expect(merge.getByRole("combobox")).toHaveCount(0);
  await expect(merge.getByRole("button")).toHaveText(["Close"]);
  await merge.getByRole("button", { name: "Close" }).click();
  await expect(merge).toBeHidden();

  await expect(tagRow(page, "Demo Booked")).toHaveCount(1);
  expect(tagNamed(await stored(page), "Demo Booked")).toBeDefined();
});

test("removing a tag takes it off its contacts and deals, and the row goes at once, before the list is read again", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/tags");
  await openTagsPage(page);
  const before = await stored(page);
  const tag = tagWithRecords(before);
  const contacts = carrying(before.contacts, tag.id).length;
  const deals = carrying(before.deals, tag.id).length;

  await action(page, "Remove", tag.name).click();
  const dialog = alertDialog(page);
  await expect(dialog).toHaveAccessibleName(`Remove ${tag.name}?`);
  await expect(dialog).toContainText(
    `${counted(contacts, "contact")} and ${counted(deals, "deal")} lose this tag.`,
  );

  // The removal reads the tag by key, so it succeeds; the list's refetch
  // after it fails, so the list keeps its last data, the tag included.
  await failReads(page, "tags");
  const throwsBefore = await readFaultThrows(page);
  await dialog.getByRole("button", { name: "Remove tag" }).click();
  await expect(toastNamed(page, "Tag removed")).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect.poll(() => readFaultThrows(page)).toBeGreaterThan(throwsBefore);
  await expect(tagRow(page, tag.name)).toHaveCount(0);
  await expect(bodyRows(page)).toHaveCount(SEEDED_TAGS - 1);
  await expect(tagsHeading(page)).toBeFocused();
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);

  await restoreReads(page);
  await expect
    .poll(async () => tagNamed(await stored(page), tag.name))
    .toBeUndefined();
  const after = await stored(page);
  expect(carrying(after.contacts, tag.id)).toEqual([]);
  expect(carrying(after.deals, tag.id)).toEqual([]);
  await page.reload();
  await openTagsPage(page);
  await expect(tagRow(page, tag.name)).toHaveCount(0);
});

test("an edited tag shows its new name at once, twice over, before the list is read again", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/tags");
  await openTagsPage(page);

  // Edits read the tag by key, so they save; every list read after them
  // fails, so the list keeps the name it read first.
  await failReads(page, "tags");
  for (const [from, to] of [
    ["Cold", "Frozen"],
    ["Frozen", "Icy"],
  ] as const) {
    const throwsBefore = await readFaultThrows(page);
    await action(page, "Edit", from).click();
    const form = tagForm(page, "Edit tag");
    await expect(form.getByLabel("Name", { exact: true })).toHaveValue(from);
    await form.getByLabel("Name", { exact: true }).fill(to);
    await submitButton(form).click();
    await expect(toastNamed(page, "Tag saved").last()).toBeVisible();
    await expect(form).toBeHidden();
    await expect
      .poll(() => readFaultThrows(page))
      .toBeGreaterThan(throwsBefore);
    await expect(tagRow(page, to)).toHaveCount(1);
    await expect(tagRow(page, from)).toHaveCount(0);
  }
  await action(page, "Edit", "Icy").click();
  await expect(
    tagForm(page, "Edit tag").getByLabel("Name", { exact: true }),
  ).toHaveValue("Icy");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);

  await restoreReads(page);
  expect(tagNamed(await stored(page), "Icy")).toBeDefined();
});

for (const fault of ["tags", "contacts"] as const) {
  test(`the list failing to load (${fault} read) shows one alert, and Retry brings it back`, async ({
    page,
    gotoApp,
  }) => {
    await gotoApp("/settings/profile");
    await expect(pageHeading(page, "Profile")).toBeVisible(NAVIGATION);
    await failReads(page, fault);
    await openSection(page, "Tags", /\/settings\/tags$/);

    const alert = loadErrorAlert(page, "Could not load the tags");
    await expect(alert).toBeVisible(NAVIGATION);
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(1);
    await expect(table(page)).toHaveCount(0);

    await restoreReads(page);
    await alert.getByRole("button", { name: "Retry" }).click();
    await expect(bodyRows(page)).toHaveCount(SEEDED_TAGS);
    await expect(alert).toHaveCount(0);
  });
}

test("the remove count failing shows an alert in the dialog, and Retry brings it back", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/tags");
  await openTagsPage(page);
  const before = await stored(page);
  const tag = tagWithRecords(before);
  const contacts = carrying(before.contacts, tag.id).length;
  const deals = carrying(before.deals, tag.id).length;
  await failReads(page, "contacts");
  await action(page, "Remove", tag.name).click();

  const dialog = alertDialog(page);
  const alert = dialog
    .getByRole("alert")
    .filter({ hasText: `Could not count the records tagged ${tag.name}` });
  await expect(alert).toBeVisible();
  await expect(dialog.getByRole("alert")).toHaveCount(1);
  const confirm = dialog.getByRole("button", { name: "Remove tag" });
  await expect(confirm).toHaveAttribute("aria-disabled", "true");

  await restoreReads(page);
  await alert.getByRole("button", { name: "Retry" }).click();
  await expect(alert).toHaveCount(0);
  await expect(dialog).toContainText(
    `${counted(contacts, "contact")} and ${counted(deals, "deal")} lose this tag.`,
  );
  await expect(confirm).not.toHaveAttribute("aria-disabled", "true");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(tagRow(page, tag.name)).toHaveCount(1);
});

test("the merge count failing shows an alert in the dialog, and Retry brings it back", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/tags");
  await openTagsPage(page);
  const { a, b, union } = mergePair(await stored(page));
  await action(page, "Merge", a.name).click();
  const dialog = alertDialog(page);
  await expect(
    dialog.getByRole("combobox", { name: "Merge into", exact: true }),
  ).toBeVisible();

  await failReads(page, "contacts");
  await pickTarget(page, b.name);
  const alert = dialog
    .getByRole("alert")
    .filter({ hasText: `Could not count what moves to ${b.name}` });
  await expect(alert).toBeVisible();
  await expect(dialog.getByRole("alert")).toHaveCount(1);
  const confirm = dialog.getByRole("button", { name: "Merge tags" });
  await expect(confirm).toHaveAttribute("aria-disabled", "true");

  await restoreReads(page);
  await alert.getByRole("button", { name: "Retry" }).click();
  await expect(alert).toHaveCount(0);
  await expect(dialog).toContainText(
    `${b.name} ends up on ${counted(union, "contact")}.`,
  );
  await expect(confirm).not.toHaveAttribute("aria-disabled", "true");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(tagRow(page, a.name)).toHaveCount(1);
});

test("the merge check failing before a target is picked shows one alert and no picker, and Retry brings the picker", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/tags");
  await openTagsPage(page);
  const { a } = mergePair(await stored(page));
  // Without the source's preview, whether A may be merged away (an
  // automation naming it) is unknown, so nothing can be picked yet.
  await failReads(page, "contacts");
  await action(page, "Merge", a.name).click();

  const dialog = alertDialog(page);
  const alert = dialog
    .getByRole("alert")
    .filter({ hasText: `Could not check ${a.name}` });
  await expect(alert).toBeVisible();
  await expect(dialog.getByRole("alert")).toHaveCount(1);
  await expect(dialog.getByRole("combobox")).toHaveCount(0);
  const confirm = dialog.getByRole("button", { name: "Merge tags" });
  await expect(confirm).toHaveAttribute("aria-disabled", "true");

  await restoreReads(page);
  await alert.getByRole("button", { name: "Retry" }).click();
  await expect(alert).toHaveCount(0);
  await expect(
    dialog.getByRole("combobox", { name: "Merge into", exact: true }),
  ).toBeVisible();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
});

test("the tag picker says why it refused a new tag and keeps the typed name", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/contacts");
  await page
    .locator("main")
    .getByRole("button", { name: "Add contact", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Add contact" });
  await expect(dialog).toBeVisible();
  const input = dialog.locator("#tagIds");
  const chips = dialog.locator('[data-slot="combobox-chip"]');

  // The API refuses a name over 40 characters (422 INVALID_TAG).
  const long = "x".repeat(41);
  await input.click();
  await input.fill(long);
  await page.getByRole("option", { name: /^Create / }).click();
  await expect(
    toastNamed(page, "Keep the tag name to 40 characters or fewer."),
  ).toBeVisible();
  await expect(input).toHaveValue(long);
  await expect(chips).toHaveCount(0);
  expect((await stored(page)).tags).toHaveLength(SEEDED_TAGS);

  // A name it takes becomes a chip, and the input clears.
  await input.fill("Podcast Guests");
  await page.getByRole("option", { name: /^Create / }).click();
  await expect(toastNamed(page, 'Tag "Podcast Guests" created')).toBeVisible();
  await expect(chips).toHaveText(["Podcast Guests"]);
  await expect(input).toHaveValue("");
  await expect
    .poll(async () => tagNamed(await stored(page), "Podcast Guests"))
    .toBeDefined();
});

test("a failed removal keeps the dialog open with focus on its button", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/demo-data");
  await failEveryMutation(page, { slow: true });
  await openSection(page, "Tags", /\/settings\/tags$/);
  await openTagsPage(page);
  const tag = tagWithRecords(await stored(page));

  await action(page, "Remove", tag.name).click();
  const dialog = alertDialog(page);
  // The count is a read, so it loads (slowly) despite the failure rate.
  await expect(dialog).toContainText("lose this tag.", { timeout: 10_000 });
  const confirm = dialog.getByRole("button", {
    name: /^(Remove tag|Removing…)$/,
  });
  await confirm.click();
  await expect(confirm).toHaveText("Removing…");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();

  await expect(toastNamed(page, NETWORK_FAILURE)).toBeVisible({
    timeout: 10_000,
  });
  await expect(confirm).toHaveText("Remove tag");
  await expect(confirm).toBeFocused();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(tagRow(page, tag.name)).toHaveCount(1);
  expect(tagNamed(await stored(page), tag.name)).toBeDefined();
});

test("a failed merge keeps the dialog open with focus on its button", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/demo-data");
  await failEveryMutation(page, { slow: true });
  await openSection(page, "Tags", /\/settings\/tags$/);
  await openTagsPage(page);
  const before = await stored(page);
  const { a, b } = mergePair(before);

  await action(page, "Merge", a.name).click();
  const dialog = alertDialog(page);
  await pickTarget(page, b.name);
  // The preview is a read, so it loads (slowly) despite the failure rate.
  await expect(dialog).toContainText(`${a.name} is deleted.`, {
    timeout: 10_000,
  });
  const confirm = dialog.getByRole("button", {
    name: /^(Merge tags|Merging…)$/,
  });
  await confirm.click();
  await expect(confirm).toHaveText("Merging…");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeDisabled();

  await expect(toastNamed(page, NETWORK_FAILURE)).toBeVisible({
    timeout: 10_000,
  });
  await expect(confirm).toHaveText("Merge tags");
  await expect(confirm).toBeFocused();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(tagRow(page, a.name)).toHaveCount(1);
  const after = await stored(page);
  expect(tagNamed(after, a.name)).toBeDefined();
  expect(carrying(after.contacts, a.id)).toHaveLength(
    carrying(before.contacts, a.id).length,
  );
});

test("the tag dialog cannot close while saving, and a failed save keeps what was typed", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/demo-data");
  await failEveryMutation(page, { slow: true });
  await openSection(page, "Tags", /\/settings\/tags$/);
  await openTagsPage(page);

  await page
    .getByRole("main")
    .getByRole("button", { name: "New tag", exact: true })
    .click();
  const form = tagForm(page, "New tag");
  await form.getByLabel("Name", { exact: true }).fill("Podcast Guests");
  await form.getByRole("radio", { name: "Violet", exact: true }).click();
  await submitButton(form).click();
  await expect(submitButton(form)).toHaveText("Creating…");
  await page.keyboard.press("Escape");
  await expect(form).toBeVisible();

  await expect(
    form.getByRole("alert").filter({ hasText: NETWORK_FAILURE }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(submitButton(form)).toHaveText("Create tag");
  await expect(submitButton(form)).toBeFocused();
  await expect(form.getByLabel("Name", { exact: true })).toHaveValue(
    "Podcast Guests",
  );
  await expect(
    form.getByRole("radio", { name: "Violet", exact: true }),
  ).toBeChecked();
  await form.getByRole("button", { name: "Cancel" }).click();
  await expect(form).toBeHidden();
  expect(tagNamed(await stored(page), "Podcast Guests")).toBeUndefined();
});

/** Whether a `beforeunload` listener would ask: dispatches a cancelable one
 *  and reports whether it was cancelled. Nothing unloads. */
const beforeUnloadPrevented = (page: Page) =>
  page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });

test("a changed tag dialog holds the unsaved-changes guard until it closes", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/tags");
  await openTagsPage(page);

  await page
    .getByRole("main")
    .getByRole("button", { name: "New tag", exact: true })
    .click();
  const create = tagForm(page, "New tag");
  await expect.poll(() => beforeUnloadPrevented(page)).toBe(false);
  await create.getByLabel("Name", { exact: true }).fill("Podcast Guests");
  await expect.poll(() => beforeUnloadPrevented(page)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(create).toBeHidden();
  await expect.poll(() => beforeUnloadPrevented(page)).toBe(false);

  await action(page, "Edit", "Cold").click();
  const edit = tagForm(page, "Edit tag");
  await expect.poll(() => beforeUnloadPrevented(page)).toBe(false);
  await edit.getByRole("radio", { name: "Amber", exact: true }).click();
  await expect.poll(() => beforeUnloadPrevented(page)).toBe(true);
  await submitButton(edit).click();
  await expect(toastNamed(page, "Tag saved")).toBeVisible();
  await expect(edit).toBeHidden();
  await expect.poll(() => beforeUnloadPrevented(page)).toBe(false);
});

test("on a phone the tags fit the screen: no sideways scroll, icon-only actions", async ({
  page,
  gotoApp,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await gotoApp("/settings/tags");
  await openTagsPage(page);
  await expect(bodyRows(page)).toHaveCount(SEEDED_TAGS);

  const overflow = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth - window.innerWidth,
    table:
      (document.querySelector('[data-slot="table-container"]')?.scrollWidth ??
        0) -
      (document.querySelector('[data-slot="table-container"]')?.clientWidth ??
        0),
  }));
  expect(overflow).toEqual({ page: 0, table: 0 });
  const edit = action(page, "Edit", "Cold");
  await expect(edit).toBeVisible();
  await expect(edit.getByText("Edit", { exact: true })).toBeHidden();
  await expect(action(page, "Merge", "Cold")).toBeInViewport();
  await expect(action(page, "Remove", "Cold")).toBeInViewport();
});
