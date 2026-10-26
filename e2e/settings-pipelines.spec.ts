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
  failEveryMutation,
  openSection,
  pageHeading,
  settingsForm,
  toastNamed,
} from "./settings-helpers";

/**
 * The pipelines and stages manager (P9-T05): picking a pipeline, adding,
 * editing, dragging and removing its stages, creating, renaming and
 * deleting pipelines, and the deals board following along. Pipelines and
 * stages are found by their seed names, which are constants
 * (src/lib/mock/seed/pipelines.ts): Sales Pipeline (the default; New Lead,
 * Contacted, Discovery Booked, Proposal Sent, Negotiation, Closed Won),
 * Client Onboarding and Renewals. Deal counts come from the stored data.
 */

const SALES = "Sales Pipeline";
const SALES_STAGES = [
  "New Lead",
  "Contacted",
  "Discovery Booked",
  "Proposal Sent",
  "Negotiation",
  "Closed Won",
];
const NETWORK_FAILURE = "Network request failed. Please try again.";

const sidebarLink = (page: Page, name: string) =>
  page
    .locator('[data-slot="sidebar"]')
    .getByRole("link", { name, exact: true });

const stageList = (page: Page) =>
  page.getByRole("list", { name: "Stages", exact: true });
const stageRows = (page: Page) => stageList(page).getByRole("listitem");
const stageRow = (page: Page, name: string) =>
  stageRows(page).filter({ has: page.getByText(name, { exact: true }) });
const handle = (page: Page, name: string) =>
  page.getByRole("button", { name: `Move ${name}`, exact: true });
const pipelineHeading = (page: Page, name: string) =>
  page.getByRole("main").getByRole("heading", { level: 2, name, exact: true });
const stagesHeading = (page: Page) =>
  page.getByRole("heading", { name: "Stages", exact: true });
const removeDialog = (page: Page) => page.getByRole("alertdialog");
const picker = (page: Page) =>
  page.getByRole("main").getByRole("combobox", { name: "Pipeline" });

/** The stage names in the list, top to bottom, from each Edit button. */
async function listedStages(page: Page): Promise<string[]> {
  const names = await stageList(page)
    .getByRole("button", { name: /^Edit / })
    .evaluateAll((buttons) =>
      buttons.map((b) => b.getAttribute("aria-label") ?? ""),
    );
  return names.map((name) => name.replace(/^Edit /, ""));
}

async function openPipelinesPage(page: Page, pipeline = SALES) {
  await expect(pageHeading(page, "Pipelines")).toBeVisible(NAVIGATION);
  await expect(pipelineHeading(page, pipeline)).toBeVisible(NAVIGATION);
  await expect(stageRows(page).first()).toBeVisible(NAVIGATION);
}

/** Picks `name` in the page's pipeline picker. */
async function choosePipeline(page: Page, name: string) {
  await picker(page).click();
  await page.getByRole("option", { name: new RegExp(`^${name}`) }).click();
  await expect(pipelineHeading(page, name)).toBeVisible();
}

interface StoredStage {
  id: string;
  name: string;
  position: number;
  isWon?: boolean;
}
interface StoredPipeline {
  id: string;
  name: string;
  isDefault: boolean;
  stages: StoredStage[];
}
interface StoredDeal {
  id: string;
  pipelineId: string;
  stageId: string;
  status: string;
}

/** The persisted pipelines and deals, read straight from localStorage. */
async function stored(page: Page): Promise<{
  pipelines: StoredPipeline[];
  deals: StoredDeal[];
}> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (!raw) return { pipelines: [], deals: [] };
    const db = JSON.parse(raw) as {
      state: {
        pipelines: Record<string, StoredPipeline>;
        opportunities: Record<string, StoredDeal>;
      };
    };
    return {
      pipelines: Object.values(db.state.pipelines),
      deals: Object.values(db.state.opportunities),
    };
  }, DB_KEY);
}

/** One pipeline's stored stage names, in board order. */
async function storedStageNames(page: Page, pipeline: string) {
  const { pipelines } = await stored(page);
  const p = pipelines.find((x) => x.name === pipeline);
  if (!p) return [];
  return [...p.stages]
    .sort((a, b) => a.position - b.position)
    .map((s) => s.name);
}

/** The stored deals in a stage of a pipeline, by names. */
async function storedDealsIn(page: Page, pipeline: string, stage: string) {
  const { pipelines, deals } = await stored(page);
  const p = pipelines.find((x) => x.name === pipeline)!;
  const s = p.stages.find((x) => x.name === stage)!;
  return deals.filter((d) => d.pipelineId === p.id && d.stageId === s.id);
}

/** Opens the deals board by the sidebar link. */
async function openBoard(page: Page) {
  await sidebarLink(page, "Opportunities").click();
  await expect(page).toHaveURL(/\/opportunities$/, NAVIGATION);
  await expect(
    page.locator('main section[aria-label$=" stage"]').first(),
  ).toBeVisible(NAVIGATION);
}

/** The board's column names, left to right. */
async function boardColumns(page: Page): Promise<string[]> {
  const labels = await page
    .locator('main section[aria-label$=" stage"]')
    .evaluateAll((sections) =>
      sections.map((s) => s.getAttribute("aria-label") ?? ""),
    );
  return labels.map((label) => label.replace(/ stage$/, ""));
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

const stageForm = (page: Page, title: string) => settingsForm(page, title);
const stageSubmit = (form: Locator) =>
  form.getByRole("button", {
    name: /^(Add stage|Save changes|Adding…|Saving…)$/,
  });

/** Adds a stage to the pipeline on screen and waits for its row. */
async function addStage(page: Page, name: string, probability = "35") {
  await page
    .getByRole("main")
    .getByRole("button", { name: "Add stage", exact: true })
    .click();
  const form = stageForm(page, "Add stage");
  await expect(form).toBeVisible();
  await form.getByLabel("Name", { exact: true }).fill(name);
  await form.getByRole("radio", { name: "Teal", exact: true }).click();
  await form.getByLabel("Probability", { exact: true }).fill(probability);
  await stageSubmit(form).click();
  await expect(toastNamed(page, "Stage added")).toBeVisible();
  await expect(form).toBeHidden();
  await expect(stageRow(page, name)).toBeVisible();
}

/**
 * Drops `name`'s handle one place down with the keyboard: Space picks it up,
 * ArrowDown moves it, Space drops it. dnd-kit measures the rows just after
 * the pick-up, and an arrow pressed before that is lost, so the arrow is
 * pressed until the live region says the stage is over the next position.
 */
async function keyboardMoveDown(page: Page, name: string) {
  const grip = handle(page, name);
  const from = (await listedStages(page)).indexOf(name) + 1;
  await grip.focus();
  await page.keyboard.press("Space");
  await expect(grip).toHaveAttribute("aria-pressed", "true");
  // Measured: it is over its own position.
  await expect(
    page.getByText(new RegExp(`^${name} is over position ${from} of \\d+\\.$`)),
  ).toBeAttached();
  const over = page.getByText(
    new RegExp(`^${name} is over position ${from + 1} of \\d+\\.$`),
  );
  await expect(async () => {
    await page.keyboard.press("ArrowDown");
    await expect(over).toBeAttached({ timeout: 500 });
  }).toPass();
  await page.keyboard.press("Space");
  await expect(grip).not.toHaveAttribute("aria-pressed", "true");
}

/** Drags `name` by its handle onto `target`'s row with the mouse. */
async function pointerDrag(page: Page, name: string, target: string) {
  const from = await handle(page, name).boundingBox();
  const to = await handle(page, target).boundingBox();
  if (!from || !to) throw new Error("No handle to drag");
  const x = from.x + from.width / 2;
  await page.mouse.move(x, from.y + from.height / 2);
  await page.mouse.down();
  // Past the 4px activation distance, then onto the target in steps.
  await page.mouse.move(x, from.y + from.height / 2 - 10, { steps: 4 });
  await page.mouse.move(x, to.y + to.height / 2, { steps: 12 });
  await page.mouse.up();
}

/** Waits until a reorder has saved (handles enabled again). */
async function settled(page: Page, name: string) {
  await expect(handle(page, name)).not.toHaveAttribute(
    "aria-disabled",
    "true",
    { timeout: 15_000 },
  );
}

test("a stage added in settings shows on the board as a column before Closed Won", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/pipelines");
  await openPipelinesPage(page);
  expect(await listedStages(page)).toEqual(SALES_STAGES);

  await addStage(page, "Qualified");
  const settings = await listedStages(page);
  expect(settings).toEqual([
    ...SALES_STAGES.slice(0, -1),
    "Qualified",
    "Closed Won",
  ]);
  await expect(stageRow(page, "Qualified")).toContainText("35%");
  await expect.poll(() => storedStageNames(page, SALES)).toEqual(settings);

  await openBoard(page);
  await expect(
    page.getByRole("region", { name: "Qualified stage" }),
  ).toBeVisible();
  const columns = await boardColumns(page);
  expect(columns).toEqual(settings);
  expect(columns.indexOf("Qualified")).toBe(columns.indexOf("Closed Won") - 1);
});

test("stages reorder by keyboard and by pointer drag; the board follows and the order survives a reload", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/pipelines");
  await openPipelinesPage(page);

  // Keyboard: focus the handle, Space, ArrowDown, Space.
  await keyboardMoveDown(page, "New Lead");
  await expect(stageRows(page).nth(1)).toContainText("New Lead");
  await expect(handle(page, "New Lead")).toBeFocused();
  const afterKeyboard = ["Contacted", "New Lead", ...SALES_STAGES.slice(2)];
  expect(await listedStages(page)).toEqual(afterKeyboard);
  await expect.poll(() => storedStageNames(page, SALES)).toEqual(afterKeyboard);
  await settled(page, "Negotiation");

  // Pointer: drag Negotiation onto Contacted, the first row.
  await pointerDrag(page, "Negotiation", "Contacted");
  const afterPointer = [
    "Negotiation",
    "Contacted",
    "New Lead",
    "Discovery Booked",
    "Proposal Sent",
    "Closed Won",
  ];
  await expect.poll(() => listedStages(page)).toEqual(afterPointer);
  await expect.poll(() => storedStageNames(page, SALES)).toEqual(afterPointer);
  await settled(page, "Negotiation");

  await page.reload();
  await waitForBoot(page);
  await openPipelinesPage(page);
  expect(await listedStages(page)).toEqual(afterPointer);

  await openBoard(page);
  const columns = await boardColumns(page);
  expect(columns).toEqual(afterPointer);
  expect(columns).not.toEqual(SALES_STAGES);
});

test("removing a stage moves its deals to the stage before it on the board, and the data stays consistent", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/pipelines");
  await openPipelinesPage(page);
  const moving = await storedDealsIn(page, SALES, "Contacted");
  expect(moving.length).toBeGreaterThan(0);
  const closed = moving.filter((d) => d.status !== "open").length;

  await page
    .getByRole("button", { name: "Remove Contacted", exact: true })
    .click();
  const dialog = removeDialog(page);
  await expect(dialog).toContainText(
    `${moving.length} ${moving.length === 1 ? "deal moves" : "deals move"} to New Lead.`,
  );
  // The line about closed deals shows exactly when some of them are closed.
  await expect(
    dialog.getByText(/^[A-Z][a-z, ]* deals (stay \w+|keep their status)\.$/),
  ).toHaveCount(closed > 0 ? 1 : 0);
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await dialog
    .getByRole("button", { name: "Remove stage", exact: true })
    .click();
  await expect(toastNamed(page, "Stage removed")).toContainText(
    `${moving.length} ${moving.length === 1 ? "deal" : "deals"} moved to New Lead.`,
  );
  await expect(dialog).toBeHidden();
  await expect(stageRow(page, "Contacted")).toHaveCount(0);
  await expect(stagesHeading(page)).toBeFocused();
  await expect
    .poll(() => storedStageNames(page, SALES))
    .toEqual(SALES_STAGES.filter((s) => s !== "Contacted"));

  await openBoard(page);
  await expect(
    page.getByRole("region", { name: "Contacted stage" }),
  ).toHaveCount(0);
  // Lost deals are hidden until "Show lost" is on.
  await page.getByRole("switch", { name: "Show lost" }).click();
  const newLead = page.getByRole("region", { name: "New Lead stage" });
  for (const deal of moving) {
    await expect(
      newLead.locator(`a[href="/opportunities/${deal.id}"]`),
    ).toBeVisible();
  }

  await expectCleanIntegrity(page);
});

test("removing a stage with closed deals says they keep their status, and they do", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/pipelines");
  await openPipelinesPage(page);

  // Proposal Sent holds lost deals and open ones, and no won ones.
  const proposal = await storedDealsIn(page, SALES, "Proposal Sent");
  const lost = proposal.filter((d) => d.status === "lost");
  expect(lost.length).toBeGreaterThan(0);
  expect(proposal.filter((d) => d.status === "won")).toEqual([]);
  expect(proposal.filter((d) => d.status === "abandoned")).toEqual([]);
  await page
    .getByRole("button", { name: "Remove Proposal Sent", exact: true })
    .click();
  let dialog = removeDialog(page);
  await expect(dialog).toContainText("to Discovery Booked.");
  await expect(
    dialog.getByText("Lost deals stay lost.", { exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Remove stage", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await expect(stageRow(page, "Proposal Sent")).toHaveCount(0);

  // The won stage: every deal in it is won.
  const won = await storedDealsIn(page, SALES, "Closed Won");
  expect(won.length).toBeGreaterThan(0);
  expect(won.every((d) => d.status === "won")).toBe(true);
  await page
    .getByRole("button", { name: "Remove Closed Won", exact: true })
    .click();
  dialog = removeDialog(page);
  await expect(dialog).toContainText(
    `${won.length} deals move to Negotiation.`,
  );
  await expect(
    dialog.getByText("Won deals stay won.", { exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Remove stage", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await expect(stageRow(page, "Closed Won")).toHaveCount(0);

  // Stored: the won deals sit in Negotiation, and every moved deal kept its
  // status.
  await expect
    .poll(async () =>
      (await storedDealsIn(page, SALES, "Negotiation")).map((d) => d.id),
    )
    .toEqual(expect.arrayContaining(won.map((d) => d.id)));
  const deals = new Map((await stored(page)).deals.map((d) => [d.id, d]));
  expect([...lost, ...won].map((d) => deals.get(d.id)?.status)).toEqual(
    [...lost, ...won].map((d) => d.status),
  );
});

test("a pipeline's only stage can't be removed: the dialog says why, with Close only", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/pipelines");
  await openPipelinesPage(page);
  await page
    .getByRole("main")
    .getByRole("button", { name: "New pipeline", exact: true })
    .click();
  const form = settingsForm(page, "New pipeline");
  await form.getByLabel("Name", { exact: true }).fill("Solo Pipeline");
  await form.getByRole("button", { name: "Create pipeline" }).click();
  await expect(toastNamed(page, "Pipeline created")).toBeVisible();
  await expect(pipelineHeading(page, "Solo Pipeline")).toBeFocused();
  expect(await listedStages(page)).toEqual(["New", "Won"]);
  await expect(stageRow(page, "Won")).toContainText("Won");

  await page.getByRole("button", { name: "Remove Won", exact: true }).click();
  let dialog = removeDialog(page);
  await expect(dialog).toContainText("No deals are in this stage.");
  await dialog
    .getByRole("button", { name: "Remove stage", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await expect(stageRows(page)).toHaveCount(1);

  await page.getByRole("button", { name: "Remove New", exact: true }).click();
  dialog = removeDialog(page);
  await expect(
    dialog.getByRole("heading", { name: "New can't be removed" }),
  ).toBeVisible();
  await expect(dialog).toContainText(
    "New is the only stage in Solo Pipeline, and a pipeline needs at least one stage.",
  );
  await expect(
    dialog.getByRole("button", { name: "Remove stage" }),
  ).toHaveCount(0);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(await storedStageNames(page, "Solo Pipeline")).toEqual(["New"]);
});

test("deleting a pipeline states its deal count, then it is gone from settings and the board", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/pipelines");
  await openPipelinesPage(page);
  const { pipelines, deals } = await stored(page);
  const renewals = pipelines.find((p) => p.name === "Renewals")!;
  const count = deals.filter((d) => d.pipelineId === renewals.id).length;
  expect(count).toBeGreaterThan(0);

  await choosePipeline(page, "Renewals");
  await page
    .getByRole("button", { name: "Delete Renewals", exact: true })
    .click();
  const dialog = removeDialog(page);
  await expect(dialog).toContainText(
    `${count} deals are deleted with it, with their timeline entries; their tasks stay, detached from the deal.`,
  );
  await expect(dialog).not.toContainText("becomes the default");
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await dialog
    .getByRole("button", { name: "Delete pipeline", exact: true })
    .click();
  await expect(toastNamed(page, "Pipeline deleted")).toBeVisible();
  await expect(dialog).toBeHidden();
  // The default is picked, and its heading takes focus.
  await expect(pipelineHeading(page, SALES)).toBeFocused();
  await picker(page).click();
  await expect(page.getByRole("option", { name: /^Renewals/ })).toHaveCount(0);
  await expect(page.getByRole("option")).toHaveCount(2);
  await page.keyboard.press("Escape");
  await expect
    .poll(async () => (await stored(page)).pipelines.map((p) => p.name).sort())
    .toEqual(["Client Onboarding", SALES]);

  await openBoard(page);
  await page.getByRole("combobox", { name: "Pipeline" }).click();
  await expect(page.getByRole("option", { name: "Renewals" })).toHaveCount(0);
  await expect(page.getByRole("option", { name: SALES })).toBeVisible();
  await page.keyboard.press("Escape");

  await expectCleanIntegrity(page);
});

test("deleting the default names the next default, and the last pipeline can't be deleted", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/pipelines");
  await openPipelinesPage(page);

  await page
    .getByRole("button", { name: `Delete ${SALES}`, exact: true })
    .click();
  let dialog = removeDialog(page);
  await expect(dialog).toContainText(
    "Client Onboarding becomes the default pipeline.",
  );
  await dialog
    .getByRole("button", { name: "Delete pipeline", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await expect(pipelineHeading(page, "Client Onboarding")).toBeFocused();
  await expect(
    page.getByRole("main").getByText("Default", { exact: true }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Delete Client Onboarding", exact: true })
    .click();
  dialog = removeDialog(page);
  await dialog
    .getByRole("button", { name: "Delete pipeline", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await expect(pipelineHeading(page, "Renewals")).toBeFocused();

  await page
    .getByRole("button", { name: "Delete Renewals", exact: true })
    .click();
  dialog = removeDialog(page);
  await expect(
    dialog.getByRole("heading", { name: "Renewals can't be deleted" }),
  ).toBeVisible();
  await expect(dialog).toContainText(
    "Renewals is the only pipeline, and the board needs one, so it can't be deleted.",
  );
  await expect(
    dialog.getByRole("button", { name: "Delete pipeline" }),
  ).toHaveCount(0);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toBeHidden();
  expect((await stored(page)).pipelines.map((p) => p.name)).toEqual([
    "Renewals",
  ]);
});

test("a name another pipeline or stage has is refused on the Name field, and nothing is stored", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/pipelines");
  await openPipelinesPage(page);

  await page
    .getByRole("main")
    .getByRole("button", { name: "New pipeline", exact: true })
    .click();
  const form = settingsForm(page, "New pipeline");
  const name = form.getByLabel("Name", { exact: true });
  await name.fill(" renewals ");
  await form.getByRole("button", { name: "Create pipeline" }).click();
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(name).toHaveAccessibleDescription(
    "A pipeline named Renewals already exists.",
  );
  await expect(name).toBeFocused();
  await expect(name).toHaveValue(" renewals ");
  await form.getByRole("button", { name: "Cancel" }).click();
  await expect(form).toBeHidden();
  expect((await stored(page)).pipelines).toHaveLength(3);

  await page
    .getByRole("main")
    .getByRole("button", { name: "Add stage", exact: true })
    .click();
  const stage = stageForm(page, "Add stage");
  const stageName = stage.getByLabel("Name", { exact: true });
  await stageName.fill("contacted");
  await stageSubmit(stage).click();
  await expect(stageName).toHaveAttribute("aria-invalid", "true");
  await expect(stageName).toHaveAccessibleDescription(
    "Sales Pipeline already has a stage named Contacted.",
  );
  await expect(stageName).toBeFocused();
  await expect(toastNamed(page, "Stage added")).toHaveCount(0);
  await stage.getByRole("button", { name: "Cancel" }).click();
  await expect(stage).toBeHidden();
  expect(await storedStageNames(page, SALES)).toEqual(SALES_STAGES);
});

test("empty dialogs are marked, and nothing is stored", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/pipelines");
  await openPipelinesPage(page);

  await page
    .getByRole("main")
    .getByRole("button", { name: "New pipeline", exact: true })
    .click();
  const form = settingsForm(page, "New pipeline");
  await form.getByRole("button", { name: "Create pipeline" }).click();
  const name = form.getByLabel("Name", { exact: true });
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(name).toHaveAccessibleDescription("Enter a pipeline name.");
  await form.getByRole("button", { name: "Cancel" }).click();
  await expect(form).toBeHidden();

  await page
    .getByRole("main")
    .getByRole("button", { name: "Add stage", exact: true })
    .click();
  const stage = stageForm(page, "Add stage");
  // Slate is picked to start with.
  await expect(
    stage.getByRole("radio", { name: "Slate", exact: true }),
  ).toBeChecked();
  const probability = stage.getByLabel("Probability", { exact: true });
  await probability.fill("");
  await stageSubmit(stage).click();
  const stageName = stage.getByLabel("Name", { exact: true });
  await expect(stageName).toHaveAttribute("aria-invalid", "true");
  await expect(stageName).toHaveAccessibleDescription("Enter a stage name.");
  await expect(probability).toHaveAttribute("aria-invalid", "true");
  await expect(probability).toHaveAccessibleDescription(
    /Enter a probability from 0 to 100\./,
  );
  await stageName.fill("Qualified");
  await probability.fill("150");
  await stageSubmit(stage).click();
  await expect(probability).toHaveAccessibleDescription(
    /Enter a probability from 0 to 100\./,
  );
  await expect(stageName).not.toHaveAttribute("aria-invalid");
  await stage.getByRole("button", { name: "Cancel" }).click();
  await expect(stage).toBeHidden();

  expect((await stored(page)).pipelines).toHaveLength(3);
  expect(await storedStageNames(page, SALES)).toEqual(SALES_STAGES);
});

test("an edited stage shows its new values at once, before the list is read again", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/pipelines");
  await openPipelinesPage(page);
  await page
    .getByRole("button", { name: "Edit Contacted", exact: true })
    .click();
  const form = stageForm(page, "Edit stage");
  await expect(form.getByLabel("Name", { exact: true })).toHaveValue(
    "Contacted",
  );
  await expect(
    form.getByRole("radio", { name: "Sky", exact: true }),
  ).toBeChecked();
  await form.getByLabel("Name", { exact: true }).fill("Reached Out");
  await form.getByLabel("Probability", { exact: true }).fill("30");

  // The save reads the pipeline by key, so it succeeds; the list's refetch
  // after it fails, so the list keeps its last data.
  await failReads(page, "pipelines");
  const throwsBefore = await readFaultThrows(page);
  await stageSubmit(form).click();
  await expect(toastNamed(page, "Stage saved")).toBeVisible();
  await expect(form).toBeHidden();
  await expect.poll(() => readFaultThrows(page)).toBeGreaterThan(throwsBefore);
  await expect(stageRow(page, "Reached Out")).toContainText("30%");
  await expect(stageRow(page, "Contacted")).toHaveCount(0);

  await page
    .getByRole("button", { name: "Edit Reached Out", exact: true })
    .click();
  await expect(
    stageForm(page, "Edit stage").getByLabel("Name", { exact: true }),
  ).toHaveValue("Reached Out");
});

test("a removed stage goes at once, before the list is read again", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/pipelines");
  await openPipelinesPage(page);
  await page
    .getByRole("button", { name: "Remove Negotiation", exact: true })
    .click();
  const dialog = removeDialog(page);
  await expect(dialog).toContainText(/to Proposal Sent\.|No deals/);

  // The removal reads pipelines by key, so it succeeds; the list's refetch
  // after it fails, so the list keeps its last data, Negotiation included.
  await failReads(page, "pipelines");
  const throwsBefore = await readFaultThrows(page);
  await dialog
    .getByRole("button", { name: "Remove stage", exact: true })
    .click();
  await expect(toastNamed(page, "Stage removed")).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect.poll(() => readFaultThrows(page)).toBeGreaterThan(throwsBefore);
  await expect(stageRow(page, "Negotiation")).toHaveCount(0);
  await expect(stageRows(page)).toHaveCount(SALES_STAGES.length - 1);
  await expect(stagesHeading(page)).toBeFocused();
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);

  // The removal's returned pipeline stands while the list cannot be read:
  // picking another pipeline and coming back does not bring the stage back.
  await choosePipeline(page, "Renewals");
  await choosePipeline(page, SALES);
  await expect(stageRows(page)).toHaveCount(SALES_STAGES.length - 1);
  await expect(stageRow(page, "Negotiation")).toHaveCount(0);
});

test("a reorder keeps its order across a pipeline switch, before the list is read again", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/pipelines");
  await openPipelinesPage(page);

  // The reorder reads the pipeline by key, so it saves; the list's refetch
  // after it fails, so the list keeps the order it read first.
  await failReads(page, "pipelines");
  const throwsBefore = await readFaultThrows(page);
  await keyboardMoveDown(page, "New Lead");
  await expect.poll(() => readFaultThrows(page)).toBeGreaterThan(throwsBefore);
  await settled(page, "New Lead");
  const once = ["Contacted", "New Lead", ...SALES_STAGES.slice(2)];
  expect(await listedStages(page)).toEqual(once);

  await choosePipeline(page, "Renewals");
  await choosePipeline(page, SALES);
  expect(await listedStages(page)).toEqual(once);
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);

  // `stored()` reads the table the fault fails, so restore reads first.
  await restoreReads(page);
  expect(await storedStageNames(page, SALES)).toEqual(once);
});

test("a deleted pipeline goes at once, before the list is read again", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/pipelines");
  await openPipelinesPage(page);
  await choosePipeline(page, "Renewals");
  await page
    .getByRole("button", { name: "Delete Renewals", exact: true })
    .click();
  const dialog = removeDialog(page);
  await expect(dialog).toContainText("deleted with it");

  await failReads(page, "pipelines");
  const throwsBefore = await readFaultThrows(page);
  await dialog
    .getByRole("button", { name: "Delete pipeline", exact: true })
    .click();
  await expect(toastNamed(page, "Pipeline deleted")).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect.poll(() => readFaultThrows(page)).toBeGreaterThan(throwsBefore);
  await expect(pipelineHeading(page, SALES)).toBeFocused();
  await expect(pipelineHeading(page, "Renewals")).toHaveCount(0);
  await picker(page).click();
  await expect(page.getByRole("option", { name: /^Renewals/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
});

test("the list failing to load shows one alert, and Retry brings it back", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/profile");
  await expect(pageHeading(page, "Profile")).toBeVisible(NAVIGATION);
  await failReads(page, "pipelines");
  await openSection(page, "Pipelines", /\/settings\/pipelines$/);

  const alert = loadErrorAlert(page, "Could not load the pipelines");
  await expect(alert).toBeVisible(NAVIGATION);
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(1);
  await expect(stageList(page)).toHaveCount(0);

  await restoreReads(page);
  await alert.getByRole("button", { name: "Retry" }).click();
  await expect(stageRows(page)).toHaveCount(SALES_STAGES.length);
  await expect(alert).toHaveCount(0);
});

test("the remove-stage count failing shows an alert in the dialog, and Retry brings it back", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/pipelines");
  await openPipelinesPage(page);
  const moving = await storedDealsIn(page, SALES, "Contacted");
  await failReads(page, "opportunities");
  await page
    .getByRole("button", { name: "Remove Contacted", exact: true })
    .click();

  const dialog = removeDialog(page);
  const alert = dialog
    .getByRole("alert")
    .filter({ hasText: "Could not count the deals in Contacted" });
  await expect(alert).toBeVisible();
  await expect(dialog.getByRole("alert")).toHaveCount(1);
  const confirm = dialog.getByRole("button", {
    name: "Remove stage",
    exact: true,
  });
  await expect(confirm).toHaveAttribute("aria-disabled", "true");

  await restoreReads(page);
  await alert.getByRole("button", { name: "Retry" }).click();
  await expect(alert).toHaveCount(0);
  await expect(dialog).toContainText(
    `${moving.length} ${moving.length === 1 ? "deal moves" : "deals move"} to New Lead.`,
  );
  await expect(confirm).not.toHaveAttribute("aria-disabled", "true");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(stageRow(page, "Contacted")).toBeVisible();
});

test("the delete-pipeline count failing shows an alert in the dialog, and Retry brings it back", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/pipelines");
  await openPipelinesPage(page);
  await failReads(page, "opportunities");
  await page
    .getByRole("button", { name: `Delete ${SALES}`, exact: true })
    .click();

  const dialog = removeDialog(page);
  const alert = dialog
    .getByRole("alert")
    .filter({ hasText: `Could not count the deals in ${SALES}` });
  await expect(alert).toBeVisible();
  await expect(dialog.getByRole("alert")).toHaveCount(1);
  const confirm = dialog.getByRole("button", {
    name: "Delete pipeline",
    exact: true,
  });
  await expect(confirm).toHaveAttribute("aria-disabled", "true");

  await restoreReads(page);
  await alert.getByRole("button", { name: "Retry" }).click();
  await expect(alert).toHaveCount(0);
  await expect(dialog).toContainText(/\d+ deals are deleted with it/);
  await expect(confirm).not.toHaveAttribute("aria-disabled", "true");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(pipelineHeading(page, SALES)).toBeVisible();
});

test("the stage dialog cannot close while saving, and a failed save keeps what was typed", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/demo-data");
  await failEveryMutation(page, { slow: true });
  await openSection(page, "Pipelines", /\/settings\/pipelines$/);
  await openPipelinesPage(page);

  await page
    .getByRole("main")
    .getByRole("button", { name: "Add stage", exact: true })
    .click();
  const form = stageForm(page, "Add stage");
  await form.getByLabel("Name", { exact: true }).fill("Qualified");
  await form.getByRole("radio", { name: "Pink", exact: true }).click();
  await form.getByLabel("Probability", { exact: true }).fill("42");
  await stageSubmit(form).click();
  await expect(stageSubmit(form)).toHaveText("Adding…");
  const cancel = form.getByRole("button", { name: "Cancel" });
  await expect(cancel).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(form).toBeVisible();

  await expect(
    form.getByRole("alert").filter({ hasText: NETWORK_FAILURE }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(stageSubmit(form)).toHaveText("Add stage");
  await expect(stageSubmit(form)).toBeFocused();
  await expect(form.getByLabel("Name", { exact: true })).toHaveValue(
    "Qualified",
  );
  await expect(
    form.getByRole("radio", { name: "Pink", exact: true }),
  ).toBeChecked();
  await expect(form.getByLabel("Probability", { exact: true })).toHaveValue(
    "42",
  );
  await cancel.click();
  await expect(form).toBeHidden();
  expect(await storedStageNames(page, SALES)).toEqual(SALES_STAGES);
});

test("a failed stage removal keeps the dialog open with focus on its button", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/demo-data");
  await failEveryMutation(page, { slow: true });
  await openSection(page, "Pipelines", /\/settings\/pipelines$/);
  await openPipelinesPage(page);

  await page
    .getByRole("button", { name: "Remove Contacted", exact: true })
    .click();
  const dialog = removeDialog(page);
  // The count is a read, so it loads (slowly) despite the failure rate.
  await expect(dialog).toContainText(/to New Lead\./, { timeout: 10_000 });
  const confirm = dialog.getByRole("button", {
    name: /^(Remove stage|Removing…)$/,
  });
  await confirm.click();
  await expect(confirm).toHaveText("Removing…");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();

  await expect(toastNamed(page, NETWORK_FAILURE)).toBeVisible({
    timeout: 10_000,
  });
  await expect(confirm).toHaveText("Remove stage");
  await expect(confirm).toBeFocused();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(stageRow(page, "Contacted")).toHaveCount(1);
  expect(await storedStageNames(page, SALES)).toEqual(SALES_STAGES);
});

test("a failed pipeline delete keeps the dialog open with focus on its button", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/demo-data");
  await failEveryMutation(page, { slow: true });
  await openSection(page, "Pipelines", /\/settings\/pipelines$/);
  await openPipelinesPage(page);
  await choosePipeline(page, "Renewals");

  await page
    .getByRole("button", { name: "Delete Renewals", exact: true })
    .click();
  const dialog = removeDialog(page);
  // The count is a read, so it loads (slowly) despite the failure rate.
  await expect(dialog).toContainText("deleted with it", { timeout: 10_000 });
  const confirm = dialog.getByRole("button", {
    name: /^(Delete pipeline|Deleting…)$/,
  });
  await confirm.click();
  await expect(confirm).toHaveText("Deleting…");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();

  await expect(toastNamed(page, NETWORK_FAILURE)).toBeVisible({
    timeout: 10_000,
  });
  await expect(confirm).toHaveText("Delete pipeline");
  await expect(confirm).toBeFocused();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(pipelineHeading(page, "Renewals")).toBeVisible();
  await picker(page).click();
  await expect(page.getByRole("option", { name: /^Renewals/ })).toHaveCount(1);
  await page.keyboard.press("Escape");
  expect((await stored(page)).pipelines.map((p) => p.name).sort()).toEqual([
    "Client Onboarding",
    "Renewals",
    SALES,
  ]);
});

test("a failed reorder says why and the stored order comes back", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/demo-data");
  await failEveryMutation(page);
  await openSection(page, "Pipelines", /\/settings\/pipelines$/);
  await openPipelinesPage(page);

  await keyboardMoveDown(page, "New Lead");
  await expect(toastNamed(page, NETWORK_FAILURE)).toBeVisible({
    timeout: 10_000,
  });
  await expect.poll(() => listedStages(page)).toEqual(SALES_STAGES);
  expect(await storedStageNames(page, SALES)).toEqual(SALES_STAGES);
});

test("a second drag waits for the first to save, so the order never jumps back", async ({
  page,
  gotoApp,
}) => {
  // Slow reads and writes (no failures), so the list read after the first
  // drag is still on its way when the second one is made.
  await gotoApp("/settings/demo-data");
  const latency = page.getByRole("slider").nth(0);
  await latency.focus();
  await latency.press("End");
  await expect(
    page.getByRole("main").getByText("3000 ms", { exact: true }),
  ).toBeVisible();
  await openSection(page, "Pipelines", /\/settings\/pipelines$/);
  await openPipelinesPage(page);

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

  await keyboardMoveDown(page, "New Lead");
  // While it saves, the handles are disabled, a polite status says why, and
  // Space does not pick one up.
  const grip = handle(page, "New Lead");
  const saving = page.getByRole("status").filter({
    hasText: /^Saving the new order…$/,
  });
  await expect(grip).toHaveAttribute("aria-disabled", "true");
  await expect(saving).toHaveCount(1);
  await grip.focus();
  await page.keyboard.press("Space");
  await expect(grip).not.toHaveAttribute("aria-pressed", "true");
  await settled(page, "New Lead");
  await expect(saving).toHaveCount(0);
  await keyboardMoveDown(page, "New Lead");
  await expect(stageRows(page).nth(2)).toContainText("New Lead");
  await settled(page, "New Lead");

  const orders = await page.evaluate(
    () => (window as unknown as { __orders: string[] }).__orders,
  );
  const asOrder = (names: string[]) =>
    names.map((name) => `Edit ${name}`).join("|");
  const once = [SALES_STAGES[1]!, SALES_STAGES[0]!, ...SALES_STAGES.slice(2)];
  const twice = [
    SALES_STAGES[1]!,
    SALES_STAGES[2]!,
    SALES_STAGES[0]!,
    ...SALES_STAGES.slice(3),
  ];
  expect(orders).toEqual([
    asOrder(SALES_STAGES),
    asOrder(once),
    asOrder(twice),
  ]);
});

/** Whether a `beforeunload` listener would ask: dispatches a cancelable one
 *  and reports whether it was cancelled. Nothing unloads. */
const beforeUnloadPrevented = (page: Page) =>
  page.evaluate(() => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });

test("a changed dialog holds the unsaved-changes guard until it closes", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/pipelines");
  await openPipelinesPage(page);

  await page
    .getByRole("main")
    .getByRole("button", { name: "Add stage", exact: true })
    .click();
  const stage = stageForm(page, "Add stage");
  await expect.poll(() => beforeUnloadPrevented(page)).toBe(false);
  await stage.getByLabel("Name", { exact: true }).fill("Qualified");
  await expect.poll(() => beforeUnloadPrevented(page)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(stage).toBeHidden();
  await expect.poll(() => beforeUnloadPrevented(page)).toBe(false);

  await page
    .getByRole("button", { name: `Rename ${SALES}`, exact: true })
    .click();
  const rename = settingsForm(page, "Rename pipeline");
  await expect(rename.getByLabel("Name", { exact: true })).toHaveValue(SALES);
  await rename.getByLabel("Name", { exact: true }).fill("Sales");
  await expect.poll(() => beforeUnloadPrevented(page)).toBe(true);
  await rename.getByRole("button", { name: "Save name" }).click();
  await expect(toastNamed(page, "Pipeline renamed")).toBeVisible();
  await expect(rename).toBeHidden();
  await expect(pipelineHeading(page, "Sales")).toBeVisible();
  await expect.poll(() => beforeUnloadPrevented(page)).toBe(false);
});
