import type { Locator, Page } from "@playwright/test";

import { readDeal, readDeals, readPipelines } from "./calendar-helpers";
import { expect, NAVIGATION, test } from "./fixtures";
import { waitForContent } from "./routes";

/**
 * Keyboard drag on the opportunities board (spec P4: Tab → Space → arrows →
 * Space). Each live deal card has a drag control (`aria-roledescription
 * "draggable deal"`, named "Move <deal>"); dnd-kit announces each step in its
 * live region, naming the deal, the stage it is over and the position there
 * (`boardDragAnnouncements`, board-dnd.ts).
 *
 * dnd-kit measures the droppables after the pick-up, and an arrow pressed
 * before that is lost (LEARNINGS P9-T05): wait for the "over its own
 * position" announcement, then retry the arrow until the next stage is
 * announced.
 */

const main = (page: Page) => page.getByRole("main");

const column = (page: Page, stage: string) =>
  main(page).getByRole("region", { name: `${stage} stage`, exact: true });

const dragControl = (page: Page, dealId: string) =>
  page.locator(`[data-deal-drag="${dealId}"]`);

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** dnd-kit's live region saying exactly `pattern`. */
const announced = (page: Page, pattern: string) =>
  page.getByText(new RegExp(`^${pattern}$`));

interface Picked {
  id: string;
  name: string;
  from: { id: string; name: string };
  to: { id: string; name: string };
  control: Locator;
}

/** The first live deal of the Sales Pipeline's first stage, and the stage
 *  right of it. */
async function pickDeal(page: Page): Promise<Picked> {
  const pipelines = await readPipelines(page);
  const sales = pipelines.find((p) => p.name === "Sales Pipeline");
  if (!sales) throw new Error("No Sales Pipeline");
  const [from, to] = sales.stages;
  if (!from || !to) throw new Error("Sales Pipeline needs two stages");
  const control = column(page, from.name)
    .getByRole("button", { name: /^Move / })
    .first();
  await expect(control).toBeVisible(NAVIGATION);
  await waitForContent(page);
  const id = await control.getAttribute("data-deal-drag");
  const label = await control.getAttribute("aria-label");
  if (!id || !label) throw new Error("The drag control has no deal id");
  return {
    id,
    name: label.replace(/^Move /, ""),
    from: { id: from.id, name: from.name },
    to: { id: to.id, name: to.name },
    control: dragControl(page, id),
  };
}

/** The deal ids a column shows, top to bottom (its drag controls' order). */
const shownOrder = (page: Page, stage: string) =>
  column(page, stage)
    .locator("[data-deal-drag]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-deal-drag")));

/** A stage's deal ids as stored, in position order (hidden ones included). */
async function storedOrder(page: Page, stageId: string) {
  return (await readDeals(page))
    .filter((d) => d.stageId === stageId)
    .sort((a, b) => a.position - b.position)
    .map((d) => d.id);
}

/**
 * Resolves once dnd-kit's keyboard sensor listens for the next key. It adds
 * its keydown listener in a `setTimeout(0)` after the pick-up, and Chrome can
 * run a queued key press before that timer, so a Space or Escape pressed
 * right after the pick-up announcement can be lost. A timer queued now fires
 * after the sensor's.
 */
const keyboardSensorReady = (page: Page) =>
  page.evaluate(() => new Promise<void>((done) => setTimeout(done, 0)));

/** Space on the deal's control, then waits until dnd-kit has measured the
 *  board: it announces the deal over its own position. */
async function pickUpInPlace(page: Page, deal: Picked, of: number) {
  await deal.control.focus();
  await expect(deal.control).toBeFocused();
  await page.keyboard.press("Space");
  await expect(
    announced(
      page,
      `${escapeRegExp(deal.name)} is over ${escapeRegExp(deal.from.name)}, position 1 of ${of}\\.`,
    ),
  ).toBeAttached();
  await keyboardSensorReady(page);
}

/** Space on the focused control, then ArrowRight until the deal is over the
 *  next stage. */
async function pickUpAndMoveRight(page: Page, deal: Picked) {
  await deal.control.focus();
  await expect(deal.control).toBeFocused();
  await expect(deal.control).toHaveAttribute(
    "aria-roledescription",
    "draggable deal",
  );
  await page.keyboard.press("Space");
  await expect(deal.control).toHaveAttribute("aria-pressed", "true");
  const name = escapeRegExp(deal.name);
  await expect(
    announced(
      page,
      `${name} is over ${escapeRegExp(deal.from.name)}, position \\d+ of \\d+\\.`,
    ),
  ).toBeAttached();
  const overNext = announced(
    page,
    `${name} is over ${escapeRegExp(deal.to.name)}, position \\d+ of \\d+\\.`,
  );
  await expect(async () => {
    await page.keyboard.press("ArrowRight");
    await expect(overNext).toBeAttached({ timeout: 500 });
  }).toPass();
}

async function moveByKeyboard(page: Page) {
  const deal = await pickDeal(page);
  await expect(column(page, deal.from.name).locator(deal.control)).toHaveCount(
    1,
  );
  await pickUpAndMoveRight(page, deal);
  await page.keyboard.press("Space");

  await expect(
    announced(
      page,
      `${escapeRegExp(deal.name)} moved to ${escapeRegExp(deal.to.name)}, position \\d+ of \\d+\\.`,
    ),
  ).toBeAttached();
  await expect(column(page, deal.to.name).locator(deal.control)).toHaveCount(1);
  await expect(column(page, deal.from.name).locator(deal.control)).toHaveCount(
    0,
  );
  await expect
    .poll(async () => (await readDeal(page, deal.id)).stageId)
    .toBe(deal.to.id);
  // Focus stays on the moved card's drag control, in its new column.
  await expect(deal.control).toBeFocused();
  await expect(deal.control).not.toHaveAttribute("aria-pressed", "true");

  await page.reload();
  await expect(column(page, deal.to.name).locator(deal.control)).toHaveCount(
    1,
    NAVIGATION,
  );
  await expect(column(page, deal.from.name).locator(deal.control)).toHaveCount(
    0,
  );
}

test("a deal moves to the next stage by keyboard: Space, arrows, Space", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/opportunities");
  await moveByKeyboard(page);
});

test("Escape cancels a keyboard drag and stores nothing", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/opportunities");
  const deal = await pickDeal(page);
  const before = await column(page, deal.from.name)
    .getByRole("button", { name: /^Move / })
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-deal-drag")));

  await pickUpAndMoveRight(page, deal);
  await page.keyboard.press("Escape");

  await expect(
    announced(
      page,
      `Moving ${escapeRegExp(deal.name)} was cancelled; it stays in ${escapeRegExp(deal.from.name)}, position \\d+ of \\d+\\.`,
    ),
  ).toBeAttached();
  await expect(deal.control).not.toHaveAttribute("aria-pressed", "true");
  await expect(column(page, deal.from.name).locator(deal.control)).toHaveCount(
    1,
  );
  expect(
    await column(page, deal.from.name)
      .getByRole("button", { name: /^Move / })
      .evaluateAll((els) => els.map((el) => el.getAttribute("data-deal-drag"))),
    "the column's order is unchanged",
  ).toEqual(before);
  await expect(deal.control).toBeFocused();
  expect((await readDeal(page, deal.id)).stageId).toBe(deal.from.id);
});

test("a deal card's link and its drag control are separate tab stops", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/opportunities");
  const deal = await pickDeal(page);
  await deal.control.focus();
  await page.keyboard.press("Tab");
  const link = column(page, deal.from.name).locator(
    `a[href="/opportunities/${deal.id}"]`,
  );
  await expect(link).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(
    new RegExp(`/opportunities/${deal.id}$`),
    NAVIGATION,
  );
});

test("dead deals have no drag control", async ({ page, gotoApp }) => {
  await gotoApp("/opportunities");
  await pickDeal(page);
  const pipelines = await readPipelines(page);
  const salesId = pipelines.find((p) => p.name === "Sales Pipeline")?.id;
  const dead = (await readDeals(page)).find(
    (d) =>
      d.pipelineId === salesId &&
      (d.status === "lost" || d.status === "abandoned"),
  );
  if (!dead) throw new Error("The seed has no lost or abandoned Sales deal");
  await main(page).getByRole("switch", { name: "Show lost" }).click();
  const card = main(page)
    .locator('[data-slot="card"]')
    .filter({ has: page.locator(`a[href="/opportunities/${dead.id}"]`) });
  await expect(card).toBeVisible();
  await expect(card.locator("[data-deal-drag]")).toHaveCount(0);
  await expect(card.getByRole("button")).toHaveCount(0);
});

test("ArrowDown then Space moves a deal one place down in its own stage", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/opportunities");
  const deal = await pickDeal(page);
  const shown = await shownOrder(page, deal.from.name);
  expect(shown.length, "the stage shows two deals or more").toBeGreaterThan(1);
  const [first, second, ...rest] = shown;
  expect(first).toBe(deal.id);
  const total = shown.length;
  const name = escapeRegExp(deal.name);
  const stage = escapeRegExp(deal.from.name);

  await pickUpInPlace(page, deal, total);
  const overSecond = announced(
    page,
    `${name} is over ${stage}, position 2 of ${total}\\.`,
  );
  await expect(async () => {
    await page.keyboard.press("ArrowDown");
    await expect(overSecond).toBeAttached({ timeout: 500 });
  }).toPass();
  await page.keyboard.press("Space");

  await expect(
    announced(page, `${name} moved to ${stage}, position 2 of ${total}\\.`),
  ).toBeAttached();
  const expected = [second, first, ...rest];
  await expect.poll(() => shownOrder(page, deal.from.name)).toEqual(expected);
  // Stored: the shown deals in that order (hidden lost deals keep theirs).
  await expect
    .poll(async () =>
      (await storedOrder(page, deal.from.id)).filter((id) =>
        shown.includes(id),
      ),
    )
    .toEqual(expected);

  await page.reload();
  await expect(deal.control).toBeVisible(NAVIGATION);
  await waitForContent(page);
  expect(await shownOrder(page, deal.from.name)).toEqual(expected);
});

test("Space on a picked-up deal drops it where it was and stores nothing", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/opportunities");
  const deal = await pickDeal(page);
  const shown = await shownOrder(page, deal.from.name);
  expect(shown.length, "the stage shows two deals or more").toBeGreaterThan(1);
  const stored = await storedOrder(page, deal.from.id);
  const total = shown.length;

  await pickUpInPlace(page, deal, total);
  await page.keyboard.press("Space");

  await expect(
    announced(
      page,
      `${escapeRegExp(deal.name)} dropped; it stays in ${escapeRegExp(deal.from.name)}, position 1 of ${total}\\.`,
    ),
  ).toBeAttached();
  await expect(deal.control).not.toHaveAttribute("aria-pressed", "true");
  expect(await shownOrder(page, deal.from.name), "the column's order").toEqual(
    shown,
  );

  await page.reload();
  await expect(deal.control).toBeVisible(NAVIGATION);
  await waitForContent(page);
  expect(await shownOrder(page, deal.from.name)).toEqual(shown);
  expect((await readDeal(page, deal.id)).stageId).toBe(deal.from.id);
  expect(await storedOrder(page, deal.from.id), "the stored order").toEqual(
    stored,
  );
});

test("positions are counted among the cards shown, not hidden deals", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/opportunities");
  const deal = await pickDeal(page);
  expect(
    (await storedOrder(page, deal.from.id)).length,
    "the stage holds two deals or more",
  ).toBeGreaterThan(1);

  // The deal's exact name leaves it the only card in its column.
  await main(page).getByLabel("Search deals", { exact: true }).fill(deal.name);
  await expect.poll(() => shownOrder(page, deal.from.name)).toEqual([deal.id]);

  await deal.control.focus();
  await page.keyboard.press("Space");
  // What the user hears on pick-up: dnd-kit's "Picked up" line is replaced
  // in the same render by the "is over" line for its own place.
  await expect(
    announced(
      page,
      `${escapeRegExp(deal.name)} is over ${escapeRegExp(deal.from.name)}, position 1 of 1\\.`,
    ),
  ).toBeAttached();
  await keyboardSensorReady(page);
  await page.keyboard.press("Escape");
  await expect(
    announced(
      page,
      `Moving ${escapeRegExp(deal.name)} was cancelled; it stays in ${escapeRegExp(deal.from.name)}, position 1 of 1\\.`,
    ),
  ).toBeAttached();
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("keyboard drag works with the snapping board", async ({
    page,
    gotoApp,
  }) => {
    await gotoApp("/opportunities");
    await moveByKeyboard(page);
  });
});
