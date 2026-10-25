import type { Locator, Page } from "@playwright/test";

import {
  DB_KEY,
  failReads,
  loadErrorAlert,
  readFaultThrows,
  restoreReads,
} from "./calendar-helpers";
import { expect, NAVIGATION, test } from "./fixtures";

/**
 * Run history on `/automation/[id]` (P8-T07): a paged table of who went
 * through the automation, newest first, and a run sheet opened from a row
 * that marks the automation's steps with how each went. Contacts link
 * through to their page.
 *
 * The runs are seeded (src/lib/mock/seed/runs.ts), so specs read them from
 * the persisted store as an oracle and pick runs by what they are (the
 * newest failed run), never by a hard-coded id: run ids are nanoids that
 * change on every build.
 *
 * Load errors follow one fault, one alert (DECISIONS P7-T47): the runs read
 * failing alone shows "Could not load run history" in its section; while
 * the automation's own alert shows, that is the only alert, and its Retry
 * re-reads the runs too.
 */

const SPEED_TO_LEAD_ID = "wf_speed_to_lead";
const SPEED_TO_LEAD = `/automation/${SPEED_TO_LEAD_ID}`;
const PAGE_SIZE = 10;

const STEP_STATUS = { ok: "Done", skipped: "Skipped", failed: "Failed" };

interface StoredRun {
  id: string;
  workflowId: string;
  contactId: string;
  status: "completed" | "failed" | "active" | "dropped";
  startedAt: string;
  endedAt?: string;
  error?: string;
  steps: {
    nodeId: string;
    at: string;
    status: keyof typeof STEP_STATUS;
    detail?: string;
  }[];
}

interface Run extends StoredRun {
  contactName: string;
}

/**
 * One automation's runs from the persisted store, newest first (the table's
 * default order), each with its contact's name.
 */
async function readRuns(page: Page, workflowId: string): Promise<Run[]> {
  const read = () => page.evaluate((key) => localStorage.getItem(key), DB_KEY);
  await expect.poll(read).not.toBeNull();
  const { state } = JSON.parse((await read()) ?? "null") as {
    state: {
      workflowRuns: Record<string, StoredRun>;
      contacts: Record<string, { firstName: string; lastName: string }>;
    };
  };
  const runs = Object.values(state.workflowRuns)
    .filter((r) => r.workflowId === workflowId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .map((r) => {
      const contact = state.contacts[r.contactId];
      if (!contact) throw new Error(`No contact ${r.contactId}`);
      return { ...r, contactName: `${contact.firstName} ${contact.lastName}` };
    });
  return runs;
}

const runHistory = (page: Page): Locator =>
  page
    .getByRole("main")
    .getByRole("region", { name: "Run history", exact: true });

/** The table's data rows (the header row is in `thead`). */
const rowsOf = (section: Locator): Locator => section.locator("tbody tr");

/** Waits for every read on the page, the runs table's included. */
async function settled(page: Page): Promise<void> {
  await expect(
    page.getByRole("main").locator('[data-slot="skeleton"]'),
  ).toHaveCount(0, { timeout: 15_000 });
}

/** A step's own row in a step list (not its branches), by node id. */
const stepRow = (scope: Locator, nodeId: string): Locator =>
  scope.locator(`li[data-step-id="${nodeId}"] > div`).first();

/** Goes to the table page that holds `index` (0-based, newest first). */
async function showPageOf(section: Locator, index: number, pages: number) {
  const target = Math.floor(index / PAGE_SIZE) + 1;
  for (let p = 1; p < target; p++) {
    await section.getByRole("button", { name: "Next", exact: true }).click();
    await expect(section).toContainText(`Page ${p + 1} of ${pages}`);
  }
  await expect(section.locator('[data-slot="skeleton"]')).toHaveCount(0);
}

test("Speed to Lead's run history lists its runs, newest first, a page at a time", async ({
  page,
  gotoApp,
}) => {
  await gotoApp(SPEED_TO_LEAD);
  await settled(page);
  const runs = await readRuns(page, SPEED_TO_LEAD_ID);
  // Not vacuous: more than one page of runs.
  expect(runs.length).toBeGreaterThan(PAGE_SIZE);
  const pages = Math.ceil(runs.length / PAGE_SIZE);

  const section = runHistory(page);
  await expect(section).toContainText(`${runs.length} runs`);
  await expect(section).toContainText(`Page 1 of ${pages}`);
  const rows = rowsOf(section);
  await expect(rows).toHaveCount(PAGE_SIZE);
  for (const [i, run] of runs.slice(0, PAGE_SIZE).entries()) {
    await expect(
      rows.nth(i).getByRole("link", { name: run.contactName, exact: true }),
    ).toHaveAttribute("href", `/contacts/${run.contactId}`);
  }

  await section.getByRole("button", { name: "Next", exact: true }).click();
  await expect(section).toContainText(`Page 2 of ${pages}`);
  await expect(rows).toHaveCount(Math.min(PAGE_SIZE, runs.length - PAGE_SIZE));
  await expect(rows.first()).toContainText(runs[PAGE_SIZE]!.contactName);
});

/** The first row's contact link, which tells which run leads the table. */
const firstContactLink = (section: Locator): Locator =>
  rowsOf(section).first().locator('a[href^="/contacts/"]');

test("the Started header flips between oldest and newest first, its arrow showing which, and goes back to page 1", async ({
  page,
  gotoApp,
}) => {
  await gotoApp(SPEED_TO_LEAD);
  await settled(page);
  const runs = await readRuns(page, SPEED_TO_LEAD_ID);
  expect(runs.length).toBeGreaterThan(PAGE_SIZE);
  const pages = Math.ceil(runs.length / PAGE_SIZE);
  const newest = runs[0]!;
  const oldest = runs.at(-1)!;
  // Not vacuous: the two ends are different contacts.
  expect(oldest.contactId).not.toBe(newest.contactId);

  const section = runHistory(page);
  const header = section.getByRole("columnheader", { name: "Started" });
  const sortButton = header.getByRole("button", { name: "Started" });
  const arrowUp = header.locator(".lucide-arrow-up");
  const arrowDown = header.locator(".lucide-arrow-down");

  // Newest first by default, marked with the down arrow.
  await expect(firstContactLink(section)).toHaveAttribute(
    "href",
    `/contacts/${newest.contactId}`,
  );
  await expect(arrowDown).toHaveCount(1);

  // One click: oldest first, the up arrow.
  await sortButton.click();
  await expect(firstContactLink(section)).toHaveAttribute(
    "href",
    `/contacts/${oldest.contactId}`,
  );
  await expect(arrowUp).toHaveCount(1);
  await expect(arrowDown).toHaveCount(0);

  // From page 2, a second click: newest first again, the down arrow, page 1.
  await section.getByRole("button", { name: "Next", exact: true }).click();
  await expect(section).toContainText(`Page 2 of ${pages}`);
  await sortButton.click();
  await expect(arrowDown).toHaveCount(1);
  await expect(arrowUp).toHaveCount(0);
  await expect(section).toContainText(`Page 1 of ${pages}`);
  await expect(firstContactLink(section)).toHaveAttribute(
    "href",
    `/contacts/${newest.contactId}`,
  );
});

test("a failed run opens in a sheet with each step's status, and its contact link opens the contact", async ({
  page,
  gotoApp,
}) => {
  await gotoApp(SPEED_TO_LEAD);
  await settled(page);
  const runs = await readRuns(page, SPEED_TO_LEAD_ID);
  const index = runs.findIndex((r) => r.status === "failed");
  expect(index, "Speed to Lead has a failed run").toBeGreaterThanOrEqual(0);
  const run = runs[index]!;

  const section = runHistory(page);
  await showPageOf(section, index, Math.ceil(runs.length / PAGE_SIZE));
  // By the contact's link: names can repeat, and `hasText` matches a part.
  const row = rowsOf(section).filter({
    has: page.locator(`a[href="/contacts/${run.contactId}"]`),
  });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText("Failed");
  // The open button's name says whose run it is, and holds its visible time.
  const open = row.getByRole("button", { name: /^View run for / });
  const started = (await open.textContent()) ?? "";
  expect(started).not.toBe("");
  await expect(open).toHaveAccessibleName(
    `View run for ${run.contactName} from ${started}`,
  );
  await open.click();

  const sheet = page.getByRole("dialog", {
    name: `Run for ${run.contactName}`,
    exact: true,
  });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("Speed to Lead");
  await expect(sheet).toContainText(run.error!);

  const steps = sheet.getByRole("list", {
    name: "Steps in this run",
    exact: true,
  });
  await expect(steps).toBeVisible();

  // Every step the run reached shows its status, in words, and its detail.
  for (const step of run.steps) {
    const mark = stepRow(steps, step.nodeId);
    await expect(mark, step.nodeId).toHaveAttribute("data-status", step.status);
    await expect(
      mark.getByText(STEP_STATUS[step.status], { exact: true }),
      step.nodeId,
    ).toBeVisible();
    if (step.detail) await expect(mark).toContainText(step.detail);
  }
  const last = run.steps.at(-1)!;
  expect(last.status).toBe("failed");
  await expect(
    stepRow(steps, last.nodeId).getByText("Failed", { exact: true }),
  ).toBeVisible();

  // Steps it never reached show no status at all.
  const allIds = await steps
    .locator("li[data-step-id]")
    .evaluateAll((items) => items.map((li) => li.getAttribute("data-step-id")));
  const reached = new Set(run.steps.map((s) => s.nodeId));
  const unreached = allIds.filter(
    (id): id is string => id !== null && !reached.has(id),
  );
  expect(
    unreached.length,
    "a failed run leaves steps unreached",
  ).toBeGreaterThan(0);
  for (const id of unreached) {
    const mark = stepRow(steps, id);
    await expect(mark, id).not.toHaveAttribute("data-status");
    await expect(mark.getByText(/^(Done|Skipped|Failed)$/), id).toHaveCount(0);
  }
  // One status per reached step, no more.
  await expect(steps.getByText(/^(Done|Skipped|Failed)$/)).toHaveCount(
    run.steps.length,
  );

  // The contact's name is a link to their page.
  await sheet.getByRole("link", { name: run.contactName, exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(`/contacts/${run.contactId}$`),
    NAVIGATION,
  );
  await expect(
    page
      .getByRole("main")
      .getByRole("heading", { level: 1, name: run.contactName, exact: true }),
  ).toBeVisible({ timeout: 15_000 });
});

test("a draft automation shows No runs yet and no table", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/automation/wf_birthday_greeting");
  await settled(page);

  const section = runHistory(page);
  await expect(section.getByText("No runs yet", { exact: true })).toBeVisible();
  await expect(section).toContainText("still in development");
  await expect(section.getByRole("table")).toHaveCount(0);
  await expect(rowsOf(section)).toHaveCount(0);
});

const RUNS_ERROR = "Could not load run history";
const AUTOMATION_ERROR = "Could not load the automation";

/** Client-side route change from the list, so a fault installed there holds. */
async function openSpeedToLeadByLink(page: Page): Promise<void> {
  const link = page
    .getByRole("main")
    .getByRole("link", { name: "Speed to Lead", exact: true });
  await expect(link).toBeVisible({ timeout: 15_000 });
  await link.click();
  await expect(page).toHaveURL(new RegExp(`${SPEED_TO_LEAD}$`), NAVIGATION);
}

test("the runs failing alone shows their own alert, and its Retry brings the table back", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/automation");
  await settled(page);
  await failReads(page, "workflowRuns");
  await openSpeedToLeadByLink(page);

  const main = page.getByRole("main");
  const section = runHistory(page);
  const alert = loadErrorAlert(page, RUNS_ERROR);
  await expect(alert).toBeVisible({ timeout: 15_000 });
  await expect(section.getByRole("alert")).toHaveCount(1);
  await expect(main.getByRole("alert")).toHaveCount(1);
  // The rest of the page draws.
  await expect(
    main.getByRole("heading", { level: 1, name: "Speed to Lead", exact: true }),
  ).toBeVisible();
  await expect(
    main.getByRole("list", { name: "Steps", exact: true }),
  ).toBeVisible();
  await expect(section.getByRole("table")).toHaveCount(0);

  await restoreReads(page);
  await alert.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(rowsOf(section)).toHaveCount(PAGE_SIZE);
  await expect(main.getByRole("alert")).toHaveCount(0);
});

test("the automation and its runs failing together show one alert, and its Retry brings back both", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/automation");
  await settled(page);
  // users fails `workflows.get` (it resolves the owner) and `users.list`;
  // workflowRuns fails the run history.
  await failReads(page, "users", "workflowRuns");
  await openSpeedToLeadByLink(page);

  const main = page.getByRole("main");
  const alert = loadErrorAlert(page, AUTOMATION_ERROR);
  await expect(alert).toBeVisible({ timeout: 15_000 });
  // All three reads have failed (automation, users, runs), so an absent
  // runs alert means something.
  await expect.poll(() => readFaultThrows(page)).toBeGreaterThanOrEqual(3);
  await expect(main.getByRole("alert")).toHaveCount(1);
  await expect(loadErrorAlert(page, RUNS_ERROR)).toHaveCount(0);

  await restoreReads(page);
  await alert.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(
    main.getByRole("heading", { level: 1, name: "Speed to Lead", exact: true }),
  ).toBeVisible();
  await expect(rowsOf(runHistory(page))).toHaveCount(PAGE_SIZE);
  await expect(main.getByRole("alert")).toHaveCount(0);
});

test("the run history still lists its runs while contact reads fail: it reads each contact by its id", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/automation");
  await settled(page);
  const runs = await readRuns(page, SPEED_TO_LEAD_ID);
  await failReads(page, "contacts");
  await openSpeedToLeadByLink(page);
  await settled(page);

  const main = page.getByRole("main");
  const section = runHistory(page);
  // Not vacuous: the fault is on. Tag names count each tag's contacts by
  // reading every contact, so that read fails, and its alert is the page's
  // only one.
  await expect(loadErrorAlert(page, "Could not load tag names")).toBeVisible({
    timeout: 15_000,
  });
  await expect(main.getByRole("alert")).toHaveCount(1);
  await expect(section.getByRole("alert")).toHaveCount(0);

  const rows = rowsOf(section);
  await expect(rows).toHaveCount(PAGE_SIZE);
  for (const [i, run] of runs.slice(0, PAGE_SIZE).entries()) {
    await expect(
      rows.nth(i).getByRole("link", { name: run.contactName, exact: true }),
    ).toHaveAttribute("href", `/contacts/${run.contactId}`);
  }
  await restoreReads(page);
});

test.describe("on a 375px phone", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("the run history fits the screen and a running run opens in a full-width sheet", async ({
    page,
    gotoApp,
  }) => {
    await gotoApp(SPEED_TO_LEAD);
    await settled(page);
    const runs = await readRuns(page, SPEED_TO_LEAD_ID);
    // Runs in flight sit at the anchor, so the newest is one of them.
    const newest = runs[0]!;
    expect(newest.status).toBe("active");

    const section = runHistory(page);
    await section.scrollIntoViewIfNeeded();
    // The page never scrolls sideways; a wide table scrolls in its border.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    // The open button and the contact come first, so both are on screen.
    const row = rowsOf(section).first();
    const open = row.getByRole("button", {
      name: `View run for ${newest.contactName} from `,
    });
    await expect(open).toBeInViewport();
    await expect(
      row.getByRole("link", { name: newest.contactName, exact: true }),
    ).toBeInViewport();

    await open.click();
    const sheet = page.getByRole("dialog", {
      name: `Run for ${newest.contactName}`,
      exact: true,
    });
    await expect(sheet).toBeVisible();
    // Polled: the sheet slides in from the right.
    await expect
      .poll(async () => {
        const box = await sheet.boundingBox();
        return box && { x: Math.round(box.x), width: Math.round(box.width) };
      })
      .toEqual({ x: 0, width: 375 });
    await expect(
      sheet.getByRole("link", { name: newest.contactName, exact: true }),
    ).toBeInViewport();
    const steps = sheet.getByRole("list", {
      name: "Steps in this run",
      exact: true,
    });
    await expect(steps).toBeVisible();
    await expect(sheet).toContainText("Running");

    // The steps it finished read Done; the wait it sits in has no status
    // yet, only its note.
    const waiting = newest.steps.at(-1)!;
    expect(waiting.detail).toBe("Waiting");
    for (const step of newest.steps.slice(0, -1)) {
      await expect(stepRow(steps, step.nodeId), step.nodeId).toHaveAttribute(
        "data-status",
        "ok",
      );
    }
    const wait = stepRow(steps, waiting.nodeId);
    await expect(wait).not.toHaveAttribute("data-status");
    await expect(wait.getByText("Done", { exact: true })).toHaveCount(0);
    await expect(wait).toContainText("Waiting · ");
    await expect(steps.getByText(/^(Done|Skipped|Failed)$/)).toHaveCount(
      newest.steps.length - 1,
    );

    await sheet.getByRole("button", { name: "Close", exact: true }).click();
    await expect(sheet).toHaveCount(0);
    await expect(open).toBeFocused();
  });
});
