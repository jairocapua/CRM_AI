import type { Locator, Page } from "@playwright/test";

import { localDayIn, readDeals } from "./calendar-helpers";
import { expect, test } from "./fixtures";

/**
 * The deal sheet's Expected close field. A day is valid by the one shared rule
 * in `@/lib/dates`, the same one the booking dialog's Day field uses, so a
 * value the rule refuses is reported under the field before the save, never
 * saved as "no date". Chromium's date input accepts any year from 0001, so
 * '0099-01-01' is a value a user can really type (`new Date` would read it as
 * 1999).
 *
 * The edit round trip depends on the Singapore zone. The seed writes 17:00Z
 * closes, which fall on the next day in Singapore, so the sheet must show the
 * viewer's local day and save that day's local midnight. A form that read or
 * wrote the UTC day would move the close by a day on every save.
 *
 * The custom-field tests cover aria-invalid on each control type: the seeded
 * Monthly Retainer (a currency input), plus required select, multiselect,
 * textarea and date fields the spec adds to the persisted store itself
 * (`addRequiredCustomFields`), since no settings screen for custom fields
 * exists before P9-T04.
 */

const ZONE = "Asia/Singapore";

test.use({ timezoneId: ZONE, locale: "en-US" });

const SKELETON = '[data-slot="skeleton"]';

async function openNewDeal(
  page: Page,
  gotoApp: (path: string) => Promise<void>,
) {
  await gotoApp("/opportunities");
  await expect(page.locator(SKELETON)).toHaveCount(0, { timeout: 15_000 });
  await page.getByRole("button", { name: "New deal", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New deal" });
  const input = dialog.getByLabel("Expected close", { exact: true });
  // `[data-slot=field]` rather than role=group: FieldSet and Field are both
  // groups. The inner locator is page-rooted because `has` matches it inside
  // each candidate field.
  const field = dialog
    .locator('[data-slot="field"]')
    .filter({ has: page.getByLabel("Expected close", { exact: true }) });
  await expect(field).toHaveCount(1);
  return { dialog, input, field };
}

/** The seeded Monthly Retainer custom currency field in the open deal sheet. */
async function monthlyRetainer(page: Page, dialog: Locator) {
  const input = dialog.getByLabel("Monthly Retainer", { exact: true });
  const field = dialog
    .locator('[data-slot="field"]')
    .filter({ has: page.getByLabel("Monthly Retainer", { exact: true }) });
  await expect(field).toHaveCount(1);
  return { input, field };
}

/** The mock database's localStorage key (src/lib/mock/db.ts). */
const DB_KEY = "nimbus-crm-db";

/**
 * One required opportunity custom field per control type that P7-T52 gave
 * aria-invalid. The labels are unique so no locator can match a seeded field.
 */
const REQUIRED_FIELDS = Object.freeze([
  {
    id: "cf_e2e_tier",
    key: "e2e_tier",
    label: "E2E Tier",
    type: "select",
    objectType: "opportunity",
    group: "Deal",
    required: true,
    options: [
      { value: "gold", label: "Gold" },
      { value: "silver", label: "Silver" },
    ],
    position: 10,
  },
  {
    id: "cf_e2e_channels",
    key: "e2e_channels",
    label: "E2E Channels",
    type: "multiselect",
    objectType: "opportunity",
    group: "Deal",
    required: true,
    options: [
      { value: "email", label: "Email" },
      { value: "sms", label: "SMS" },
      { value: "ads", label: "Ads" },
    ],
    position: 11,
  },
  {
    id: "cf_e2e_brief",
    key: "e2e_brief",
    label: "E2E Brief",
    type: "textarea",
    objectType: "opportunity",
    group: "Deal",
    required: true,
    position: 12,
  },
  {
    id: "cf_e2e_kickoff",
    key: "e2e_kickoff",
    label: "E2E Kickoff",
    type: "date",
    objectType: "opportunity",
    group: "Deal",
    required: true,
    position: 13,
  },
] as const);

const TIER = REQUIRED_FIELDS[0].label;
const CHANNELS = REQUIRED_FIELDS[1].label;
const BRIEF = REQUIRED_FIELDS[2].label;
const KICKOFF = REQUIRED_FIELDS[3].label;

/**
 * Adds REQUIRED_FIELDS to the persisted mock database. It stands in for the
 * custom fields manager in settings, which arrives in P9-T04; once it does,
 * this spec should create the fields through that screen instead.
 *
 * The first load writes the seed. The fields then go in through an init
 * script on the next navigation (the caller's `openNewDeal`): by then the old
 * page's pagehide has flushed the app's debounced (250ms) persist write, so
 * that write cannot overwrite the injection, which writing from
 * `page.evaluate` on the live page could. `version` stays as it is, so persist
 * does not reseed, and `createdAt` is the seed's anchor, so no record lands
 * after REF_DATE. A sessionStorage flag makes it one-shot per tab, like the
 * fixture's storage clearing (whose own flag keeps it from wiping this data).
 */
async function addRequiredCustomFields(
  page: Page,
  gotoApp: (path: string) => Promise<void>,
) {
  await gotoApp("/opportunities");
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), DB_KEY))
    .not.toBeNull();
  await page.addInitScript(
    ({ key, fields }) => {
      if (!location.protocol.startsWith("http")) return;
      const FLAG = "e2e-custom-fields-added";
      if (sessionStorage.getItem(FLAG)) return;
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const persisted = JSON.parse(raw) as {
        state: {
          seededAt: string;
          customFields: Record<string, unknown>;
        };
      };
      const at = persisted.state.seededAt;
      for (const field of fields) {
        persisted.state.customFields[field.id] = {
          ...field,
          createdAt: at,
          updatedAt: at,
        };
      }
      localStorage.setItem(key, JSON.stringify(persisted));
      sessionStorage.setItem(FLAG, "1");
    },
    { key: DB_KEY, fields: REQUIRED_FIELDS },
  );
}

/**
 * The Field of a required custom field, found by its ' *' label. Not
 * `getByLabel`: the multiselect's FieldLabel points at no element (its
 * checkboxes are labelled by their own options).
 */
async function requiredField(page: Page, dialog: Locator, label: string) {
  const field = dialog.locator('[data-slot="field"]').filter({
    has: page.locator('[data-slot="field-label"]', {
      hasText: `${label} *`,
    }),
  });
  await expect(field).toHaveCount(1);
  return field;
}

/** The four injected fields' Fields and controls in the open deal sheet. */
async function requiredControls(page: Page, dialog: Locator) {
  const tier = await requiredField(page, dialog, TIER);
  const channels = await requiredField(page, dialog, CHANNELS);
  const brief = await requiredField(page, dialog, BRIEF);
  const kickoff = await requiredField(page, dialog, KICKOFF);
  const checkboxes = channels.getByRole("checkbox");
  await expect(checkboxes).toHaveCount(3);
  return {
    fields: [
      { label: TIER, field: tier },
      { label: CHANNELS, field: channels },
      { label: BRIEF, field: brief },
      { label: KICKOFF, field: kickoff },
    ],
    select: tier.getByRole("combobox"),
    checkboxes: await checkboxes.all(),
    textarea: brief.getByRole("textbox"),
    date: kickoff.locator('input[type="date"]'),
  };
}

test("Required custom fields left empty mark every control type aria-invalid", async ({
  page,
  gotoApp,
}) => {
  await addRequiredCustomFields(page, gotoApp);
  const { dialog } = await openNewDeal(page, gotoApp);
  const { fields, select, checkboxes, textarea, date } = await requiredControls(
    page,
    dialog,
  );

  await dialog.getByRole("button", { name: "Create deal" }).click();

  await expect(
    dialog.getByRole("alert").filter({ hasText: "Deal name is required." }),
  ).toBeVisible();
  for (const { label, field } of fields) {
    await expect(field.getByRole("alert")).toHaveText(`${label} is required.`);
    await expect(field).toHaveAttribute("data-invalid", "true");
  }
  await expect(select).toHaveAttribute("aria-invalid", "true");
  for (const checkbox of checkboxes) {
    await expect(checkbox).toHaveAttribute("aria-invalid", "true");
  }
  await expect(textarea).toHaveAttribute("aria-invalid", "true");
  await expect(date).toHaveAttribute("aria-invalid", "true");
  await expect(dialog).toBeVisible();
});

test("Filled required custom fields of every control type stay unmarked", async ({
  page,
  gotoApp,
}) => {
  await addRequiredCustomFields(page, gotoApp);
  const { dialog } = await openNewDeal(page, gotoApp);
  const { fields, select, checkboxes, textarea, date } = await requiredControls(
    page,
    dialog,
  );

  await select.click();
  await page.getByRole("option", { name: "Gold" }).click();
  // The trigger's text includes its arrow icon, so not toHaveText.
  await expect(select).toContainText("Gold");
  await checkboxes[0]?.check();
  await textarea.fill("Scope notes");
  await date.fill("2026-10-01");
  await dialog.getByRole("button", { name: "Create deal" }).click();

  // The empty deal name proves validation ran, so the quiet fields below are
  // a verdict. No attribute at all, not aria-invalid="false".
  await expect(
    dialog.getByRole("alert").filter({ hasText: "Deal name is required." }),
  ).toBeVisible();
  for (const { field } of fields) {
    await expect(field.getByRole("alert")).toHaveCount(0);
  }
  await expect(select).not.toHaveAttribute("aria-invalid");
  for (const checkbox of checkboxes) {
    await expect(checkbox).not.toHaveAttribute("aria-invalid");
  }
  await expect(textarea).not.toHaveAttribute("aria-invalid");
  await expect(date).not.toHaveAttribute("aria-invalid");
});

test("Expected close refuses a year the shared day rule refuses", async ({
  page,
  gotoApp,
}) => {
  const { dialog, input, field } = await openNewDeal(page, gotoApp);

  await input.fill("0099-01-01");
  await expect(input).toHaveValue("0099-01-01");
  await dialog.getByRole("button", { name: "Create deal" }).click();

  await expect(field.getByRole("alert")).toHaveText("Enter a valid date.");
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(dialog).toBeVisible();
});

test("Expected close accepts a real day", async ({ page, gotoApp }) => {
  const { dialog, input, field } = await openNewDeal(page, gotoApp);

  await input.fill("2026-12-01");
  await expect(input).toHaveValue("2026-12-01");
  await dialog.getByRole("button", { name: "Create deal" }).click();

  // The empty deal name proves validation ran, so the quiet field below is a
  // verdict, not a form that never checked.
  await expect(
    dialog.getByRole("alert").filter({ hasText: "Deal name is required." }),
  ).toBeVisible();
  await expect(field.getByRole("alert")).toHaveCount(0);
  await expect(input).not.toHaveAttribute("aria-invalid");
});

// Chromium's number input will not take 'Infinity' and reads '1e400' as
// empty, so the value a user can really hit is a dollar amount that is finite
// but whose cents are not. Before P7-T50 it reached the API and came back as
// a 422 toast; now it is refused under its field.
test("A custom currency amount too large to store is refused under its field", async ({
  page,
  gotoApp,
}) => {
  const { dialog } = await openNewDeal(page, gotoApp);
  const { input, field } = await monthlyRetainer(page, dialog);

  await input.fill("1e308");
  await expect(input).toHaveValue("1e308");
  await dialog.getByRole("button", { name: "Create deal" }).click();

  // The empty deal name proves validation ran.
  await expect(
    dialog.getByRole("alert").filter({ hasText: "Deal name is required." }),
  ).toBeVisible();
  await expect(field.getByRole("alert")).toHaveText("Enter a number.");
  // The Field carries data-invalid for styling; the input itself carries
  // aria-invalid so assistive tech announces the error.
  await expect(field).toHaveAttribute("data-invalid", "true");
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(input).toHaveValue("1e308");
  await expect(dialog).toBeVisible();
});

test("A valid custom currency amount leaves its input unmarked", async ({
  page,
  gotoApp,
}) => {
  const { dialog } = await openNewDeal(page, gotoApp);
  const { input, field } = await monthlyRetainer(page, dialog);

  await input.fill("1500");
  await expect(input).toHaveValue("1500");
  await dialog.getByRole("button", { name: "Create deal" }).click();

  // The empty deal name proves validation ran, so the quiet field below is a
  // verdict. No attribute at all, not aria-invalid="false".
  await expect(
    dialog.getByRole("alert").filter({ hasText: "Deal name is required." }),
  ).toBeVisible();
  await expect(field.getByRole("alert")).toHaveCount(0);
  await expect(input).not.toHaveAttribute("aria-invalid");
});

test("Edit deal keeps a seeded deal's Expected close day through a save", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/opportunities");
  await expect(page.locator(SKELETON)).toHaveCount(0, { timeout: 15_000 });
  // "open" follows P7-T35 A6: the expected close is the planning date of a
  // deal still in play (a closed deal is dated by closedAt). A deal of any
  // status saves through the same single update(), so this picks a realistic
  // deal; it is not a workaround.
  const deal = (await readDeals(page)).find(
    (d) =>
      d.status === "open" &&
      d.expectedCloseAt !== null &&
      localDayIn(ZONE, d.expectedCloseAt) !== d.expectedCloseAt.slice(0, 10),
  );
  if (!deal?.expectedCloseAt) {
    throw new Error(
      `No open deal whose expected close falls on another day in ${ZONE} than in UTC`,
    );
  }
  const day = localDayIn(ZONE, deal.expectedCloseAt);
  // Singapore has been UTC+8 all year since 1982.
  const saved = new Date(`${day}T00:00:00+08:00`).toISOString();
  const persistedClose = async () =>
    (await readDeals(page)).find((d) => d.id === deal.id)?.expectedCloseAt;

  // A full load, so no client-side navigation wait is needed.
  await gotoApp(`/opportunities/${deal.id}`);
  const edit = page.getByRole("button", { name: "Edit", exact: true });
  const sheet = page.getByRole("dialog", { name: "Edit deal" });
  const input = sheet.getByLabel("Expected close", { exact: true });

  await edit.click();
  // Auto-waits: the sheet fills the form in an effect once it opens.
  await expect(input).toHaveValue(day);
  await sheet.getByRole("button", { name: "Save changes" }).click();
  await expect(sheet).toBeHidden();
  // Persist writes are debounced, so poll the stored value. This poll carries
  // the proof: the reopened sheet's toHaveValue(day) below would also pass
  // on a stale `opportunity` prop that never saw the save.
  await expect.poll(persistedClose).toBe(saved);

  await edit.click();
  await expect(input).toHaveValue(day);
});
