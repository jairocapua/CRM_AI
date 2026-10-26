import type { Locator, Page } from "@playwright/test";

import {
  chooseContactIn,
  localDayIn,
  readContacts,
  readDealActivities,
  readDeals,
  readPipelines,
  uniquelyNamedContact,
} from "./calendar-helpers";
import { expect, test } from "./fixtures";
import { addField, openFieldsPage } from "./settings-helpers";

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
 * textarea and date fields each test first adds on the Deals tab of
 * Settings › Custom fields (`addRequiredDealFields`, P9-T07), as a user
 * would.
 *
 * The won-stage create test covers the form's create path since P7-T62:
 * `create()` takes the status from the stage, so a new deal in Closed Won
 * comes back won, and the form must still apply an explicit Open afterwards.
 *
 * The lost-reason tests (P7-T63) check that the typed reason travels with the
 * form's `create()`/`update()`: an edited reason on a lost deal is kept with
 * no new timeline entry, and a create or stage move into a lost stage keeps
 * the reason with exactly one `opportunity.lost` entry (a second `setStatus()`
 * call would log a second one).
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

/**
 * One required deal custom field per control type that P7-T52 gave
 * aria-invalid, as the field dialog words its type. The labels are unique so
 * no locator can match a seeded field.
 */
const REQUIRED_FIELDS = Object.freeze([
  { label: "E2E Tier", type: "Dropdown", options: ["Gold", "Silver"] },
  {
    label: "E2E Channels",
    type: "Multi-select",
    options: ["Email", "SMS", "Ads"],
  },
  { label: "E2E Brief", type: "Long text", options: [] },
  { label: "E2E Kickoff", type: "Date", options: [] },
] as const);

const TIER = REQUIRED_FIELDS[0].label;
const CHANNELS = REQUIRED_FIELDS[1].label;
const BRIEF = REQUIRED_FIELDS[2].label;
const KICKOFF = REQUIRED_FIELDS[3].label;

/**
 * Adds REQUIRED_FIELDS, each ticked Required, on the Deals tab of
 * /settings/custom-fields. The caller's `openNewDeal` then loads
 * /opportunities afresh; the old page's pagehide flushes the debounced
 * persist write, so the new deal sheet reads the four fields.
 */
async function addRequiredDealFields(
  page: Page,
  gotoApp: (path: string) => Promise<void>,
) {
  await gotoApp("/settings/custom-fields");
  await openFieldsPage(page);
  for (const { label, type, options } of REQUIRED_FIELDS) {
    await addField(page, label, {
      objectType: "opportunity",
      type,
      required: true,
      options,
    });
  }
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

/** The four required fields' Fields and controls in the open deal sheet. */
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
  await addRequiredDealFields(page, gotoApp);
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
  await addRequiredDealFields(page, gotoApp);
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

/**
 * Picks `name` in a Base UI select. The options are portalled, so they are
 * looked up on the page. The trigger's text also holds the chevron's "▼"
 * text node, hence toContainText (LEARNINGS P7-T51).
 */
async function chooseOption(page: Page, combobox: Locator, name: string) {
  await combobox.click();
  await page.getByRole("option", { name, exact: true }).click();
  await expect(combobox).toContainText(name);
}

test("New deal in a Won stage with Status Open saves it Open", async ({
  page,
  gotoApp,
}) => {
  const { dialog } = await openNewDeal(page, gotoApp);
  const sales = (await readPipelines(page)).find(
    (p) => p.name === "Sales Pipeline",
  );
  const closedWon = sales?.stages.find((s) => s.name === "Closed Won");
  if (!sales || !closedWon) throw new Error("No Sales Pipeline Closed Won");
  const contact = uniquelyNamedContact(await readContacts(page));
  const name = `E2E won-stage open ${Date.now()}`;

  // The form fills itself in an effect: wait for it before changing a field.
  await expect(
    dialog.getByRole("combobox", { name: "Pipeline" }),
  ).toContainText("Sales Pipeline");
  await dialog.getByLabel("Deal name", { exact: true }).fill(name);
  await chooseContactIn(
    page,
    dialog.getByRole("combobox", { name: "Contact" }),
    contact,
  );
  await chooseOption(
    page,
    dialog.getByRole("combobox", { name: "Stage" }),
    "Closed Won",
  );
  // Status follows the won stage; the explicit Open must win over it.
  const statusSelect = dialog.getByRole("combobox", { name: "Status" });
  await expect(statusSelect).toContainText("Won");
  await chooseOption(page, statusSelect, "Open");
  await dialog.getByRole("button", { name: "Create deal" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Deal created")).toBeVisible();

  // Persist is debounced, so the stored record is polled. create() leaves the
  // deal won (P7-T62); the form's setStatus(open) reopens it.
  await expect
    .poll(async () => {
      const stored = (await readDeals(page)).find((d) => d.name === name);
      return (
        stored && {
          pipelineId: stored.pipelineId,
          stageId: stored.stageId,
          status: stored.status,
          closedAt: stored.closedAt,
        }
      );
    })
    .toEqual({
      pipelineId: sales.id,
      stageId: closedWon.id,
      status: "open",
      closedAt: null,
    });
});

/** The mock database's localStorage key (src/lib/mock/db.ts), for the
 *  lost-stage injection below. */
const DB_KEY = "nimbus-crm-db";

/** The injected lost stage (no seeded stage is isLost). */
const LOST_STAGE = Object.freeze({
  id: "stg_e2e_lost",
  name: "E2E Closed Lost",
  position: 99,
  color: "red",
  probability: 0,
  isLost: true,
});

/**
 * Appends LOST_STAGE to the Sales Pipeline in the persisted mock database.
 * This stays an injection: no screen can make a lost stage. The pipelines
 * manager adds open stages only and cannot edit a stage's won/lost flags
 * ([P9-T05]), and no seeded stage is lost.
 *
 * The first load writes the seed. The stage then goes in through an init
 * script on the next navigation (the caller's `openNewDeal` or
 * `gotoApp`): by then the old page's pagehide has flushed the app's
 * debounced (250ms) persist write, so that write cannot overwrite the
 * injection, which writing from `page.evaluate` on the live page could.
 * `version` stays as it is, so persist does not reseed. A sessionStorage flag
 * makes it one-shot per tab, like the fixture's storage clearing (whose own
 * flag keeps it from wiping this data).
 */
async function addLostStage(
  page: Page,
  gotoApp: (path: string) => Promise<void>,
) {
  await gotoApp("/opportunities");
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), DB_KEY))
    .not.toBeNull();
  await page.addInitScript(
    ({ key, stage }) => {
      if (!location.protocol.startsWith("http")) return;
      const FLAG = "e2e-lost-stage-added";
      if (sessionStorage.getItem(FLAG)) return;
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const persisted = JSON.parse(raw) as {
        state: {
          pipelines: Record<string, { name: string; stages: unknown[] }>;
        };
      };
      const sales = Object.values(persisted.state.pipelines).find(
        (p) => p.name === "Sales Pipeline",
      );
      if (!sales) return;
      sales.stages.push(stage);
      localStorage.setItem(key, JSON.stringify(persisted));
      sessionStorage.setItem(FLAG, "1");
    },
    { key: DB_KEY, stage: LOST_STAGE },
  );
}

test("New deal in a lost stage with Status Lost keeps its Lost reason", async ({
  page,
  gotoApp,
}) => {
  await addLostStage(page, gotoApp);
  const { dialog } = await openNewDeal(page, gotoApp);
  const contact = uniquelyNamedContact(await readContacts(page));
  const name = `E2E lost-stage reason ${Date.now()}`;
  const reason = "Went with a competitor";

  await expect(
    dialog.getByRole("combobox", { name: "Pipeline" }),
  ).toContainText("Sales Pipeline");
  await dialog.getByLabel("Deal name", { exact: true }).fill(name);
  await chooseContactIn(
    page,
    dialog.getByRole("combobox", { name: "Contact" }),
    contact,
  );
  await chooseOption(
    page,
    dialog.getByRole("combobox", { name: "Stage" }),
    LOST_STAGE.name,
  );
  await chooseOption(
    page,
    dialog.getByRole("combobox", { name: "Status" }),
    "Lost",
  );
  await dialog.getByLabel("Lost reason", { exact: true }).fill(reason);
  await dialog.getByRole("button", { name: "Create deal" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Deal created")).toBeVisible();

  // create() leaves the deal lost (P7-T62) and saves the reason in the same
  // write (P7-T63), so the form must not call setStatus() as well.
  await expect
    .poll(async () => {
      const stored = (await readDeals(page)).find((d) => d.name === name);
      return (
        stored && {
          stageId: stored.stageId,
          status: stored.status,
          lostReason: stored.lostReason,
        }
      );
    })
    .toEqual({ stageId: LOST_STAGE.id, status: "lost", lostReason: reason });
  // The record and its entries are written together, so once the reason is
  // stored a second Lost entry would be stored too: count once.
  const stored = (await readDeals(page)).find((d) => d.name === name)!;
  const losses = (await readDealActivities(page, stored.id)).filter(
    (a) => a.type === "opportunity.lost",
  );
  expect(losses).toHaveLength(1);
});

/** Opens the Edit deal sheet on the deal's page, once the form is filled. */
async function openEditDeal(
  page: Page,
  gotoApp: (path: string) => Promise<void>,
  deal: { id: string; name: string },
) {
  await gotoApp(`/opportunities/${deal.id}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(deal.name);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Edit deal" });
  await expect(sheet.getByLabel("Deal name", { exact: true })).toHaveValue(
    deal.name,
  );
  return sheet;
}

test("Edit deal keeps a changed Lost reason on a lost deal with no new timeline entry", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/opportunities");
  const deal = (await readDeals(page)).find(
    (d) => d.status === "lost" && d.lostReason !== null,
  );
  if (!deal?.lostReason) throw new Error("No seeded lost deal with a reason");
  const reason = `${deal.lostReason} (edited)`;
  const before = await readDealActivities(page, deal.id);

  const sheet = await openEditDeal(page, gotoApp, deal);
  const input = sheet.getByLabel("Lost reason", { exact: true });
  await expect(input).toHaveValue(deal.lostReason);
  await input.fill(reason);
  await sheet.getByRole("button", { name: "Save changes" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByText("Deal updated")).toBeVisible();

  await expect
    .poll(async () => {
      const stored = (await readDeals(page)).find((d) => d.id === deal.id);
      return stored && { status: stored.status, lostReason: stored.lostReason };
    })
    .toEqual({ status: "lost", lostReason: reason });
  expect(await readDealActivities(page, deal.id)).toEqual(before);
});

test("Edit deal moving into a lost stage with Status Lost keeps the reason and logs one Lost entry", async ({
  page,
  gotoApp,
}) => {
  await addLostStage(page, gotoApp);
  await gotoApp("/opportunities");
  const sales = (await readPipelines(page)).find(
    (p) => p.name === "Sales Pipeline",
  );
  if (!sales?.stages.some((s) => s.id === LOST_STAGE.id)) {
    throw new Error("The lost stage was not added to the Sales Pipeline");
  }
  const deal = (await readDeals(page)).find(
    (d) =>
      d.pipelineId === sales.id &&
      d.status === "open" &&
      d.stageId !== LOST_STAGE.id,
  );
  if (!deal) throw new Error("No open Sales Pipeline deal");
  const reason = "Went with a competitor";
  const lossesBefore = (await readDealActivities(page, deal.id)).filter(
    (a) => a.type === "opportunity.lost",
  ).length;

  const sheet = await openEditDeal(page, gotoApp, deal);
  await chooseOption(
    page,
    sheet.getByRole("combobox", { name: "Stage" }),
    LOST_STAGE.name,
  );
  await chooseOption(
    page,
    sheet.getByRole("combobox", { name: "Status" }),
    "Lost",
  );
  await sheet.getByLabel("Lost reason", { exact: true }).fill(reason);
  await sheet.getByRole("button", { name: "Save changes" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByText("Deal updated")).toBeVisible();

  // update() stores the reason, then move() into the lost stage keeps it and
  // logs the one loss.
  await expect
    .poll(async () => {
      const stored = (await readDeals(page)).find((d) => d.id === deal.id);
      return (
        stored && {
          stageId: stored.stageId,
          status: stored.status,
          lostReason: stored.lostReason,
        }
      );
    })
    .toEqual({ stageId: LOST_STAGE.id, status: "lost", lostReason: reason });
  const losses = (await readDealActivities(page, deal.id)).filter(
    (a) => a.type === "opportunity.lost",
  );
  expect(losses).toHaveLength(lossesBefore + 1);
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
