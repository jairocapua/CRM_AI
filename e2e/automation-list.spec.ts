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
import { expect, NAVIGATION, test } from "./fixtures";

/**
 * `/automation` lists the registry's eight automations (src/lib/automations/)
 * in one section per folder, each card a read-only summary: trigger, owner
 * and lifecycle status. Automations are code, so staff get no switches, and
 * a new one is asked for through the "Request an automation" link, which
 * opens the requests page (a placeholder until P8-T08).
 *
 * A failed read shows one alert per fault (DECISIONS P7-T47). The
 * automations read also reads the users and tags tables, so a fault there
 * fails all three reads: only the automations alert shows, and its Retry
 * re-reads all three. The users read failing alone (`failUserList`) leaves
 * the cards up with "Unknown owner" and one owners alert above them. The
 * fault helpers live in calendar-helpers.ts; their faults are plain Errors,
 * which `useResource` reports as "Something went wrong.".
 */

interface Expected {
  name: string;
  trigger: string;
  owner: string;
  status: string;
}

/**
 * Folder -> automations, in page order (folders A to Z, names A to Z). The
 * owners are seeded users found by slug, the tags seeded tags found by name,
 * so neither changes on a reseed.
 */
const FOLDERS: [string, Expected[]][] = [
  [
    "Lead Capture",
    [
      {
        name: "Speed to Lead",
        trigger: "When a form is submitted: Free Website Audit",
        owner: "Priya Nair",
        status: "Live",
      },
    ],
  ],
  [
    "Nurture",
    [
      {
        name: "Birthday Greeting",
        trigger: "On the contact's birthday",
        owner: "Jordan Reyes",
        status: "In development",
      },
      {
        name: "New Lead Nurture",
        trigger: "When a contact is created",
        owner: "Lena Okafor",
        status: "Live",
      },
    ],
  ],
  [
    "Retention",
    [
      {
        name: "Churn Risk Alert",
        trigger: "When the tag Churn Risk is added",
        owner: "Aiko Tanaka",
        status: "In development",
      },
      {
        name: "Review Request",
        trigger: "When someone on the team starts it",
        owner: "Aiko Tanaka",
        status: "Live",
      },
    ],
  ],
  [
    "Sales",
    [
      {
        name: "Proposal Follow-Up",
        trigger: "When the tag Proposal Sent is added",
        owner: "Marcus Bell",
        status: "Paused by the developer",
      },
    ],
  ],
  [
    "Scheduling",
    [
      {
        name: "Appointment Reminders",
        trigger: "When an appointment is booked",
        owner: "Aiko Tanaka",
        status: "Live",
      },
      {
        name: "No-Show Recovery",
        trigger: "When the tag Needs Follow Up is added",
        owner: "Sam Whitfield",
        status: "Live",
      },
    ],
  ],
];

/** A card's `<dd>` for the `<dt>` that reads exactly `term`. */
function detail(card: Locator, term: string): Locator {
  return card
    .locator("dl > div")
    .filter({
      has: card.page().locator("dt", { hasText: new RegExp(`^${term}$`) }),
    })
    .locator("dd");
}

test("lists 8 automations in 5 folders, each with trigger and owner", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/automation");
  const main = page.getByRole("main");
  await expect(main.locator('[data-slot="skeleton"]')).toHaveCount(0, {
    timeout: 15_000,
  });

  // One region per folder, named by its heading, in alphabetical order.
  const folders = main.getByRole("region");
  await expect(folders).toHaveCount(5);
  for (const [i, [folder]] of FOLDERS.entries()) {
    await expect(folders.nth(i)).toHaveAccessibleName(folder);
    await expect(
      folders
        .nth(i)
        .getByRole("heading", { level: 2, name: folder, exact: true }),
    ).toBeVisible();
  }

  await expect(main.getByRole("region").getByRole("listitem")).toHaveCount(8);

  for (const [folder, automations] of FOLDERS) {
    const cards = main
      .getByRole("region", { name: folder, exact: true })
      .getByRole("listitem");
    await expect(cards).toHaveCount(automations.length);

    for (const [i, expected] of automations.entries()) {
      const card = cards.nth(i);
      await expect(
        card.getByRole("heading", { level: 3, name: expected.name }),
      ).toBeVisible();
      const trigger = detail(card, "Trigger");
      const owner = detail(card, "Owner");
      await expect(trigger).toHaveText(expected.trigger);
      await expect(owner).toHaveText(expected.owner);
      await expect(
        card.getByText(expected.status, { exact: true }),
      ).toBeVisible();
    }
  }
});

test("cards show lifecycle state, not editor controls", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/automation");
  const folders = page.getByRole("main").getByRole("region");
  await expect(folders).toHaveCount(5, { timeout: 15_000 });

  for (const role of ["button", "switch", "checkbox", "menuitem"] as const) {
    await expect(folders.getByRole(role)).toHaveCount(0);
  }
});

test("Request an automation is a link to the requests page", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/automation");
  const request = page
    .getByRole("main")
    .getByRole("link", { name: "Request an automation", exact: true });
  await expect(request).toBeVisible();
  await expect(request).toHaveAttribute("href", "/automation/requests");
  await expect(
    page.getByRole("main").getByRole("button", { name: /Request/ }),
  ).toHaveCount(0);

  // It leads to a real page, not a 404 (the fixture's console watcher fails
  // the test on the 404's console error, from the prefetch or the click).
  await request.click();
  await expect(page).toHaveURL(/\/automation\/requests$/, NAVIGATION);
  await expect(page).toHaveTitle(`Automation requests · ${APP_NAME}`);
  await expect(
    page.getByRole("main").getByRole("heading", {
      level: 1,
      name: "Automation requests",
      exact: true,
    }),
  ).toBeVisible();
});

const AUTOMATIONS_ERROR = "Could not load automations";
const OWNERS_ERROR = "Could not load owners";
const FAULT_MESSAGE = "Something went wrong.";
const UNKNOWN_OWNER = "Unknown owner";

/** Every expected card, in page order. */
const CARDS: Expected[] = FOLDERS.flatMap(([, automations]) => automations);

/**
 * Opens `/automation` from the requests page by the sidebar link: a
 * client-side navigation, so a fault installed after `gotoApp` survives and
 * the list's three reads are its first load.
 */
async function openListByLink(page: Page): Promise<void> {
  await page
    .locator('[data-slot="sidebar"]')
    .getByRole("link", { name: "Automation", exact: true })
    .click();
  await expect(page).toHaveURL(/\/automation$/, NAVIGATION);
}

/**
 * All eight cards are drawn, in order, each with its name and trigger, and
 * the owner `owner` gives it.
 */
async function expectCards(
  page: Page,
  owner: (expected: Expected) => string,
): Promise<void> {
  const cards = page
    .getByRole("main")
    .getByRole("region")
    .getByRole("listitem");
  await expect(cards).toHaveCount(CARDS.length);
  for (const [i, expected] of CARDS.entries()) {
    const card = cards.nth(i);
    await expect(
      card.getByRole("heading", { level: 3, name: expected.name }),
    ).toBeVisible();
    await expect(detail(card, "Trigger")).toHaveText(expected.trigger);
    await expect(detail(card, "Owner")).toHaveText(owner(expected));
  }
}

test("a failed first load shows one alert, and its Retry brings back every read", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/automation/requests");
  // The automations read resolves owners and tag names from the users and
  // tags tables, so this one fault fails the automations, users and tags
  // reads alike.
  await failReads(page, "users", "tags");
  await openListByLink(page);

  const main = page.getByRole("main");
  const alert = loadErrorAlert(page, AUTOMATIONS_ERROR);
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(FAULT_MESSAGE);
  // The alert shows only once all three reads have settled, so all three
  // failed by now. One fault, one alert: no owners or tag names alert.
  expect(await readFaultThrows(page)).toBeGreaterThanOrEqual(3);
  await expect(main.getByRole("alert")).toHaveCount(1);
  await expect(main.getByRole("region")).toHaveCount(0);

  // The fault clears, and one Retry brings back the cards with real owners
  // and tag names, and leaves no alert behind.
  await restoreReads(page);
  await alert.getByRole("button", { name: "Retry", exact: true }).click();
  await expectCards(page, (expected) => expected.owner);
  await expect(main.getByRole("alert")).toHaveCount(0);
});

test("a failed users read keeps the cards with Unknown owner, and Retry brings the names back", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/automation/requests");
  await failUserList(page);
  await openListByLink(page);

  // The automations and tag names load; only the owners are missing.
  const main = page.getByRole("main");
  await expectCards(page, () => UNKNOWN_OWNER);
  const alert = loadErrorAlert(page, OWNERS_ERROR);
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(FAULT_MESSAGE);
  await expect(main.getByRole("alert")).toHaveCount(1);

  await restoreUserList(page);
  await alert.getByRole("button", { name: "Retry", exact: true }).click();
  await expectCards(page, (expected) => expected.owner);
  await expect(main.getByRole("alert")).toHaveCount(0);
});
