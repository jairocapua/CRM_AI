import type { Locator, Page } from "@playwright/test";

import {
  readDeal,
  readDeals,
  readPipelines,
  type SeededDeal,
  type SeededPipeline,
} from "./calendar-helpers";
import { NAVIGATION, expect, test } from "./fixtures";

/**
 * Moving a deal to another pipeline from the Edit deal sheet.
 *
 * Why: the P7 gate found that `update()`'s pipeline move had no end-to-end
 * check (P7-T58). The sheet saves it in two steps: `update()` moves the deal
 * to the chosen stage of the new pipeline in one write, then the form applies
 * an explicit status through `setStatus()` when it differs from what the move
 * left (DECISIONS P7-T58). These tests drive that path through the UI and
 * check the stored record, the detail page, the timeline and the boards.
 *
 * Pipelines and stages are found by their seed names, which are constants
 * (src/lib/mock/seed/pipelines.ts), not faker draws. Deal names are not
 * unique, so cards are found by their link and timeline entries by the full
 * quoted summary.
 *
 * The won-stage test asserts only the end state, never that no "Won" entry
 * was logged: P7-T61 makes `update()` derive status from a won target stage,
 * and this test must stay green through that.
 */

const SKELETON = '[data-slot="skeleton"]';

function stageOf(
  pipelines: readonly SeededPipeline[],
  pipelineName: string,
  stageName: string,
) {
  const pipeline = pipelines.find((p) => p.name === pipelineName);
  if (!pipeline) throw new Error(`No pipeline named ${pipelineName}`);
  const stage = pipeline.stages.find((s) => s.name === stageName);
  if (!stage) throw new Error(`No stage ${stageName} in ${pipelineName}`);
  return { pipeline, stage };
}

/** An open Sales Pipeline deal that is not in the won stage. */
async function pickOpenSalesDeal(page: Page): Promise<SeededDeal> {
  const pipelines = await readPipelines(page);
  const sales = pipelines.find((p) => p.name === "Sales Pipeline");
  if (!sales) throw new Error("No pipeline named Sales Pipeline");
  const wonStageIds = new Set(
    sales.stages.filter((s) => s.isWon).map((s) => s.id),
  );
  const deal = (await readDeals(page)).find(
    (d) =>
      d.pipelineId === sales.id &&
      d.status === "open" &&
      !wonStageIds.has(d.stageId),
  );
  if (!deal) throw new Error("No open Sales Pipeline deal outside Closed Won");
  return deal;
}

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

/** The value cell of the detail page's row labelled exactly `label`. */
const detailValue = (page: Page, label: string) =>
  page
    .locator("dl > div")
    .filter({ has: page.locator("dt", { hasText: new RegExp(`^${label}$`) }) })
    .locator("dd");

/** The status badge beside the deal's title. */
const statusBadge = (page: Page, label: string) =>
  page.locator("h1").locator("..").getByText(label, { exact: true });

async function openEditSheet(page: Page, deal: SeededDeal) {
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Edit deal" });
  // The form fills itself in an effect: wait for it before changing a field,
  // or that reset could overwrite the choice.
  await expect(sheet.getByRole("combobox", { name: "Pipeline" })).toContainText(
    "Sales Pipeline",
  );
  await expect(sheet.getByLabel("Deal name", { exact: true })).toHaveValue(
    deal.name,
  );
  return sheet;
}

async function saveSheet(page: Page, sheet: Locator) {
  await sheet.getByRole("button", { name: "Save changes" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByText("Deal updated")).toBeVisible();
}

test("Edit deal moves a deal to another pipeline's stage and applies the chosen Lost status", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/opportunities");
  const pipelines = await readPipelines(page);
  const deal = await pickOpenSalesDeal(page);
  const { pipeline: onboarding, stage: kickoff } = stageOf(
    pipelines,
    "Client Onboarding",
    "Kickoff Call",
  );

  await gotoApp(`/opportunities/${deal.id}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(deal.name);
  const sheet = await openEditSheet(page, deal);

  await chooseOption(
    page,
    sheet.getByRole("combobox", { name: "Pipeline" }),
    "Client Onboarding",
  );
  // The stage resets to the new pipeline's first stage.
  const stageSelect = sheet.getByRole("combobox", { name: "Stage" });
  await expect(stageSelect).toContainText("Agreement Signed");
  // Not the first stage, so the chosen stage is the one saved.
  await chooseOption(page, stageSelect, "Kickoff Call");
  await chooseOption(
    page,
    sheet.getByRole("combobox", { name: "Status" }),
    "Lost",
  );
  await sheet.getByLabel("Lost reason", { exact: true }).fill("Budget cut");
  await saveSheet(page, sheet);

  // Persist is debounced, so the stored record is polled.
  await expect
    .poll(async () => {
      const stored = await readDeal(page, deal.id);
      return {
        pipelineId: stored.pipelineId,
        stageId: stored.stageId,
        status: stored.status,
        closed: stored.closedAt !== null,
        lostReason: stored.lostReason,
      };
    })
    .toEqual({
      pipelineId: onboarding.id,
      stageId: kickoff.id,
      status: "lost",
      closed: true,
      lostReason: "Budget cut",
    });

  await expect(detailValue(page, "Pipeline")).toHaveText("Client Onboarding");
  await expect(detailValue(page, "Stage")).toContainText("Kickoff Call");
  await expect(statusBadge(page, "Lost")).toBeVisible();
  await expect(
    page.getByText(`Moved "${deal.name}" to Kickoff Call`, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(`Lost "${deal.name}" - Budget cut`, { exact: true }),
  ).toBeVisible();

  // To the board by client-side navigation, so no reload races the persist.
  const main = page.getByRole("main");
  await main.getByRole("link", { name: "Opportunities", exact: true }).click();
  await expect(page).toHaveURL(/\/opportunities$/, NAVIGATION);
  await expect(page.locator(SKELETON)).toHaveCount(0, NAVIGATION);

  const boardPipeline = main.getByRole("combobox", { name: "Pipeline" });
  await chooseOption(page, boardPipeline, "Client Onboarding");
  const kickoffColumn = main.getByRole("region", {
    name: "Kickoff Call stage",
    exact: true,
  });
  await expect(kickoffColumn).toBeVisible();
  await expect(page.locator(SKELETON)).toHaveCount(0);
  const card = kickoffColumn.locator(`a[href="/opportunities/${deal.id}"]`);
  // A lost deal is hidden until Show lost is on.
  await expect(card).toHaveCount(0);
  await page.getByRole("switch", { name: "Show lost" }).click();
  await expect(card).toBeVisible();

  // Gone from the old pipeline's board, even with lost deals shown.
  await chooseOption(page, boardPipeline, "Sales Pipeline");
  await expect(
    main.getByRole("region", { name: "New Lead stage", exact: true }),
  ).toBeVisible();
  await expect(page.locator(SKELETON)).toHaveCount(0);
  await expect(main.locator(`a[href="/opportunities/${deal.id}"]`)).toHaveCount(
    0,
  );
});

test("Moving into another pipeline's won stage defaults Status to Won, and an explicit Open wins", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/opportunities");
  const pipelines = await readPipelines(page);
  const deal = await pickOpenSalesDeal(page);
  const { pipeline: renewals, stage: renewed } = stageOf(
    pipelines,
    "Renewals",
    "Renewed",
  );

  await gotoApp(`/opportunities/${deal.id}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(deal.name);
  const sheet = await openEditSheet(page, deal);

  await chooseOption(
    page,
    sheet.getByRole("combobox", { name: "Pipeline" }),
    "Renewals",
  );
  await chooseOption(
    page,
    sheet.getByRole("combobox", { name: "Stage" }),
    "Renewed",
  );
  // Status follows a won stage, across pipelines too.
  const statusSelect = sheet.getByRole("combobox", { name: "Status" });
  await expect(statusSelect).toContainText("Won");
  await chooseOption(page, statusSelect, "Open");
  await saveSheet(page, sheet);

  await expect
    .poll(async () => {
      const stored = await readDeal(page, deal.id);
      return {
        pipelineId: stored.pipelineId,
        stageId: stored.stageId,
        status: stored.status,
        closedAt: stored.closedAt,
      };
    })
    .toEqual({
      pipelineId: renewals.id,
      stageId: renewed.id,
      status: "open",
      closedAt: null,
    });

  await expect(statusBadge(page, "Open")).toBeVisible();
  await expect(detailValue(page, "Pipeline")).toHaveText("Renewals");
  await expect(detailValue(page, "Stage")).toContainText("Renewed");
  await expect(
    page.getByText(`Moved "${deal.name}" to Renewed`, { exact: true }),
  ).toBeVisible();
});
