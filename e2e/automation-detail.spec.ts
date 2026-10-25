import type { Locator, Page } from "@playwright/test";

import { APP_NAME } from "../src/lib/constants";
import {
  failReads,
  failUserList,
  loadErrorAlert,
  readFaultThrows,
  restoreReads,
  restoreUserList,
} from "./calendar-helpers";
import { expect, NAVIGATION, test, waitForBoot } from "./fixtures";

/**
 * `/automation/[id]` shows one automation read-only: its header (status,
 * description), a Details panel (trigger, owner, folder, the source file),
 * "How this behaves" sentences from its settings, and its steps as a nested
 * ordered list. A fork closes its list with one nested list per branch,
 * named by the branch label, and every path ends with an End step. The
 * diagram (P8-T05) is not part of this page yet; below 768px only the list
 * ever renders.
 *
 * The pages are prerendered from the registry (`generateStaticParams`), so a
 * hard refresh on one is a real server hit on a built page, not a client
 * route change.
 *
 * A failed read shows one alert per fault (DECISIONS P7-T47).
 * `workflows.get` also reads the users table, so a users fault fails it too:
 * only "Could not load the automation" shows, and its Retry re-reads both.
 * The users read failing alone (`failUserList`) still draws the page, with
 * "Unknown owner" and one owners alert. The fault helpers live in
 * calendar-helpers.ts and need a client-side route change to the page.
 */

const SPEED_TO_LEAD = "/automation/wf_speed_to_lead";

/** The page's top-level step list, named by its "Steps" heading. */
function stepList(page: Page): Locator {
  return page
    .getByRole("main")
    .getByRole("list", { name: "Steps", exact: true });
}

/** The direct `<li>` children of a list, in order. */
function itemsOf(list: Locator): Locator {
  return list.locator(":scope > li");
}

/** A Details `<dd>` for the `<dt>` that reads exactly `term`. */
function detail(page: Page, term: string): Locator {
  return page
    .getByRole("main")
    .getByRole("complementary")
    .locator("dl > div")
    .filter({ has: page.locator("dt", { hasText: new RegExp(`^${term}$`) }) })
    .locator("dd");
}

/** Waits for the detail page's reads to finish (no skeleton left). */
async function settled(page: Page): Promise<void> {
  await expect(
    page.getByRole("main").locator('[data-slot="skeleton"]'),
  ).toHaveCount(0, { timeout: 15_000 });
}

/**
 * Speed to Lead's steps in order, then both branches with their labels and
 * steps, each path ending in End.
 */
async function expectSpeedToLeadSteps(page: Page): Promise<void> {
  const steps = stepList(page);
  await expect(steps).toBeVisible();

  const top = itemsOf(steps);
  await expect(top).toHaveCount(5);
  const expected = [
    ["Form submitted", "When a form is submitted: Free Website Audit"],
    ["Notify sales", "Notifies Jordan Reyes and Priya Nair: New audit request"],
    ["Send SMS", "Texts: Hi {{contact.first_name}}"],
    ["Wait 30 minutes", "Waits 30 minutes"],
    ["Replied?", "Splits into 2 paths: Replied or No reply"],
  ];
  for (const [i, [label, summary]] of expected.entries()) {
    await expect(top.nth(i)).toContainText(label!);
    await expect(top.nth(i)).toContainText(summary!);
  }

  // The fork's branches are lists of their own, named by their labels and
  // nested inside the fork's item.
  const fork = top.nth(4);
  const replied = fork.getByRole("list", { name: "Replied", exact: true });
  const silent = fork.getByRole("list", { name: "No reply", exact: true });
  await expect(replied).toBeVisible();
  await expect(silent).toBeVisible();

  const repliedSteps = itemsOf(replied);
  await expect(repliedSteps).toHaveCount(2);
  await expect(repliedSteps.nth(0)).toContainText("Assign rep");
  await expect(repliedSteps.nth(0)).toContainText(
    "Assigns in turn to Priya Nair, Marcus Bell and Lena Okafor",
  );
  await expect(repliedSteps.nth(1)).toContainText("End");

  const silentSteps = itemsOf(silent);
  await expect(silentSteps).toHaveCount(2);
  await expect(silentSteps.nth(0)).toContainText("Send audit email");
  await expect(silentSteps.nth(0)).toContainText("Emails “Your website audit”");
  await expect(silentSteps.nth(1)).toContainText("End");
}

test("a hard refresh on Speed to Lead shows its steps and both branches", async ({
  page,
  gotoApp,
}) => {
  await gotoApp(SPEED_TO_LEAD);
  await page.reload();
  await waitForBoot(page);
  await settled(page);

  await expect(page).toHaveURL(new RegExp(`${SPEED_TO_LEAD}$`));
  await expect(page).toHaveTitle(`Automation · ${APP_NAME}`);
  const main = page.getByRole("main");
  await expect(
    main.getByRole("heading", { level: 1, name: "Speed to Lead", exact: true }),
  ).toBeVisible();
  await expect(main.getByText("Live", { exact: true })).toBeVisible();

  await expectSpeedToLeadSteps(page);
});

test("shows details, the source file and how the automation behaves", async ({
  page,
  gotoApp,
}) => {
  await gotoApp(SPEED_TO_LEAD);
  await settled(page);

  await expect(detail(page, "Trigger")).toHaveText(
    "When a form is submitted: Free Website Audit",
  );
  await expect(detail(page, "Owner")).toHaveText("Priya Nair");
  await expect(detail(page, "Folder")).toHaveText("Lead Capture");
  await expect(detail(page, "Source")).toHaveText(
    "src/lib/automations/speed-to-lead.ts",
  );

  const behaviour = page
    .getByRole("main")
    .getByRole("region", { name: "How this behaves", exact: true })
    .getByRole("listitem");
  await expect(behaviour).toHaveText([
    "A contact goes through this automation once, even if it is triggered again.",
    "It stops for a contact as soon as they reply.",
  ]);

  // Read-only: nothing to switch, edit or run. (The shell's header, inside
  // <main> too, has buttons of its own, so this checks the page's parts.)
  const main = page.getByRole("main");
  for (const part of [
    main.getByRole("region", { name: "Steps", exact: true }),
    main.getByRole("complementary"),
  ]) {
    await expect(part).toBeVisible();
    for (const role of ["button", "switch", "checkbox", "textbox"] as const) {
      await expect(part.getByRole(role)).toHaveCount(0);
    }
  }
});

test.describe("on a 375px phone", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("the step list renders", async ({ page, gotoApp }) => {
    await gotoApp(SPEED_TO_LEAD);
    await settled(page);
    await expectSpeedToLeadSteps(page);

    // The list fits the screen: nothing scrolls sideways.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test("an unknown id shows Automation not found", async ({ page, gotoApp }) => {
  await gotoApp("/automation/wf_does_not_exist");
  const main = page.getByRole("main");
  await expect(
    main.getByText("Automation not found", { exact: true }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(main.getByRole("list", { name: "Steps" })).toHaveCount(0);

  await main.getByRole("link", { name: "Automation", exact: true }).click();
  await expect(page).toHaveURL(/\/automation$/, NAVIGATION);
});

const AUTOMATION_ERROR = "Could not load the automation";
const OWNERS_ERROR = "Could not load owners";
const FAULT_MESSAGE = "Something went wrong.";

/**
 * Opens Speed to Lead from the list by its card link: a client-side route
 * change, so a fault installed on the list page is still there when the
 * detail page mounts and runs its reads.
 */
async function openSpeedToLeadByLink(page: Page): Promise<void> {
  const link = page
    .getByRole("main")
    .getByRole("link", { name: "Speed to Lead", exact: true });
  await expect(link).toBeVisible({ timeout: 15_000 });
  return link.click();
}

test("a failed first load shows one alert, and its Retry brings back the automation and its owner", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/automation");
  await settled(page);
  // `workflows.get` resolves owners from the users table, so this one fault
  // fails the automation and users reads alike; tag names still load.
  await failReads(page, "users");
  await openSpeedToLeadByLink(page);
  await expect(page).toHaveURL(new RegExp(`${SPEED_TO_LEAD}$`), NAVIGATION);

  const main = page.getByRole("main");
  const alert = loadErrorAlert(page, AUTOMATION_ERROR);
  await expect(alert).toBeVisible({ timeout: 15_000 });
  await expect(alert).toContainText(FAULT_MESSAGE);
  // The alert shows only once every read has settled, so both failed by
  // now. One fault, one alert: no owners alert, and no page behind it.
  expect(await readFaultThrows(page)).toBeGreaterThanOrEqual(2);
  await expect(main.getByRole("alert")).toHaveCount(1);
  await expect(loadErrorAlert(page, OWNERS_ERROR)).toHaveCount(0);
  await expect(main.getByRole("heading", { level: 1 })).toHaveCount(0);

  // The fault clears, and one Retry re-reads the automation and the users:
  // the owner and the named steps come back, and no alert is left.
  await restoreReads(page);
  await alert.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(
    main.getByRole("heading", { level: 1, name: "Speed to Lead", exact: true }),
  ).toBeVisible();
  await expect(detail(page, "Owner")).toHaveText("Priya Nair");
  await expectSpeedToLeadSteps(page);
  await expect(main.getByRole("alert")).toHaveCount(0);
});

test("a failed users read still draws the page with Unknown owner, and Retry brings the owner back", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/automation");
  await settled(page);
  await failUserList(page);
  await openSpeedToLeadByLink(page);
  await expect(page).toHaveURL(new RegExp(`${SPEED_TO_LEAD}$`), NAVIGATION);

  // The automation and tag names load; only the owners are missing.
  const main = page.getByRole("main");
  const alert = loadErrorAlert(page, OWNERS_ERROR);
  await expect(alert).toBeVisible({ timeout: 15_000 });
  await expect(alert).toContainText(FAULT_MESSAGE);
  await expect(main.getByRole("alert")).toHaveCount(1);
  await expect(
    main.getByRole("heading", { level: 1, name: "Speed to Lead", exact: true }),
  ).toBeVisible();
  await expect(itemsOf(stepList(page))).toHaveCount(5);
  await expect(detail(page, "Owner")).toHaveText("Unknown owner");

  await restoreUserList(page);
  await alert.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(detail(page, "Owner")).toHaveText("Priya Nair");
  await expectSpeedToLeadSteps(page);
  await expect(main.getByRole("alert")).toHaveCount(0);
});

test("a straight automation lists every step and one End", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/automation/wf_birthday_greeting");
  await settled(page);

  const top = itemsOf(stepList(page));
  await expect(top).toHaveCount(4);
  await expect(top.nth(0)).toContainText("On the contact's birthday");
  await expect(top.nth(1)).toContainText("Waits until 09:00");
  await expect(top.nth(3)).toContainText("End");
  await expect(stepList(page).getByRole("list")).toHaveCount(0);
  await expect(page.getByRole("main")).toContainText("In development");
});
