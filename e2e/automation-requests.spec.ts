import type { Locator, Page } from "@playwright/test";

import { APP_NAME } from "../src/lib/constants";
import {
  DB_KEY,
  failReads,
  loadErrorAlert,
  readFaultThrows,
  restoreReads,
} from "./calendar-helpers";
import { expect, NAVIGATION, test, waitForBoot } from "./fixtures";

/**
 * `/automation/requests`: staff ask the developer for an automation with the
 * "New request" form, and see every request with its status, who asked and
 * the developer's reply. Status is read-only copy: the developer moves it.
 * A shipped request links to the automation it became.
 *
 * Load errors follow one fault, one alert (DECISIONS P7-T47): the requests
 * read is primary, the teammates (users) read that names who asked is
 * secondary. The fault helpers live in calendar-helpers.ts; their faults are
 * plain Errors, which `useResource` reports as "Something went wrong.".
 */

/** The seeded requests, newest first, as the page lists them. */
const SEEDED = [
  {
    title: "Tag contacts who open three emails in a week",
    status: "Requested",
    asker: "Jordan Reyes",
  },
  {
    title: "Thank customers after their first payment",
    status: "Requested",
    asker: "Aiko Tanaka",
  },
  {
    title: "Flag deals stuck in one stage for two weeks",
    status: "In review",
    asker: "Lena Okafor",
  },
  {
    title: "Delete contacts with no activity for 90 days",
    status: "Declined",
    asker: "Marcus Bell",
  },
  {
    title: "Win back people who miss a call",
    status: "Shipped",
    asker: "Sam Whitfield",
  },
  {
    title: "Remind people the day before their appointment",
    status: "Shipped",
    asker: "Priya Nair",
  },
] as const;

const REQUESTS_ERROR = "Could not load requests";
const TEAMMATES_ERROR = "Could not load teammates";
const FAULT_MESSAGE = "Something went wrong.";
const UNKNOWN = "Unknown teammate";

const main = (page: Page) => page.getByRole("main");
const requestForm = (page: Page) =>
  page.getByRole("form", { name: "New request", exact: true });
const requestList = (page: Page) =>
  main(page).getByRole("list", { name: "Requests", exact: true });
/** One request, by its title. */
const request = (page: Page, title: string) =>
  requestList(page).getByRole("article", { name: title, exact: true });
const statusOf = (item: Locator) => item.locator('[data-slot="badge"]');
const submitButton = (page: Page) =>
  requestForm(page).getByRole("button", { name: /^(Send request|Sending…)$/ });

/** Every request in the persisted store, read past the UI and the API. */
async function storedRequests(
  page: Page,
): Promise<
  { title: string; status: string; priority: string; createdBy?: string }[]
> {
  const raw = await page.evaluate((key) => localStorage.getItem(key), DB_KEY);
  const state = (
    JSON.parse(raw ?? "null") as {
      state: {
        automationRequests: Record<
          string,
          { title: string; status: string; priority: string }
        >;
      };
    } | null
  )?.state;
  return Object.values(state?.automationRequests ?? {});
}

/** The list shows every seeded request, in order, with `asker` names. */
async function expectSeededList(
  page: Page,
  asker: (expected: (typeof SEEDED)[number]) => string,
): Promise<void> {
  const items = requestList(page).getByRole("article");
  await expect(items).toHaveCount(SEEDED.length);
  for (const [i, expected] of SEEDED.entries()) {
    const item = items.nth(i);
    await expect(item).toHaveAccessibleName(expected.title);
    await expect(statusOf(item)).toHaveText(expected.status);
    await expect(item).toContainText(`Asked by ${asker(expected)}`);
  }
}

test("the page has its title and heading, and lists the seeded requests newest first", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/automation/requests");
  await expect(page).toHaveTitle(`Automation requests · ${APP_NAME}`);
  await expect(
    main(page).getByRole("heading", {
      level: 1,
      name: "Automation requests",
      exact: true,
    }),
  ).toBeVisible();
  await expectSeededList(page, (expected) => expected.asker);
  await expect(main(page).getByText(/coming soon/i)).toHaveCount(0);

  // Status is copy, never a control: nothing on a request but the shipped
  // automation's link can be operated.
  const list = requestList(page);
  for (const role of ["button", "switch", "combobox", "menuitem"] as const) {
    await expect(list.getByRole(role)).toHaveCount(0);
  }

  // The declined request carries the developer's reply.
  await expect(
    request(page, "Delete contacts with no activity for 90 days"),
  ).toContainText("a deleted contact cannot be brought back");
});

test("a request sent from the form is listed as Requested, and still is after a reload", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/automation/requests");
  await expect(requestList(page).getByRole("article")).toHaveCount(
    SEEDED.length,
  );

  const title = `Ping the owner when a big deal closes ${Date.now()}`;
  const form = requestForm(page);
  await form.getByLabel("Title", { exact: true }).fill(title);
  await form
    .getByLabel("What goes wrong today?", { exact: true })
    .fill("Owners hear about big wins days later.");
  await form
    .getByLabel("What should start it?", { exact: true })
    .fill("A deal worth more than $10,000 is marked won.");
  await form
    .getByLabel("What should happen?", { exact: true })
    .fill("Notify the deal's owner and Jordan.");
  const priority = form.getByRole("combobox", { name: "Priority" });
  await expect(priority).toContainText("Normal");
  await priority.click();
  await page.getByRole("option", { name: "High", exact: true }).click();
  await expect(priority).toContainText("High");

  await submitButton(page).click();
  // Pending: the button says so and takes no second submit.
  await expect(submitButton(page)).toHaveText("Sending…");
  await expect(submitButton(page)).toBeDisabled();

  const item = request(page, title);
  await expect(item).toBeVisible();
  await expect(statusOf(item)).toHaveText("Requested");
  await expect(item).toContainText("High priority");
  await expect(item).toContainText("Asked by Jordan Reyes");
  // Newest first, and the form is empty again for the next one.
  await expect(
    requestList(page).getByRole("article").first(),
  ).toHaveAccessibleName(title);
  await expect(form.getByLabel("Title", { exact: true })).toHaveValue("");
  await expect(priority).toContainText("Normal");
  await expect(submitButton(page)).toHaveText("Send request");

  await expect
    .poll(async () =>
      (await storedRequests(page)).find((r) => r.title === title),
    )
    .toMatchObject({
      title,
      status: "requested",
      priority: "high",
      createdBy: "usr_jordan",
    });

  await page.reload();
  await waitForBoot(page);
  await expect(statusOf(request(page, title))).toHaveText("Requested");
  await expect(requestList(page).getByRole("article")).toHaveCount(
    SEEDED.length + 1,
  );
});

test("an empty request shows each field's error and sends nothing", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/automation/requests");
  await expect(requestList(page).getByRole("article")).toHaveCount(
    SEEDED.length,
  );
  const form = requestForm(page);
  // Spaces only count as empty.
  await form.getByLabel("Title", { exact: true }).fill("   ");
  await submitButton(page).click();

  for (const [label, message] of [
    ["Title", "Give the request a title."],
    ["What goes wrong today?", "Say what goes wrong today."],
    ["What should start it?", "Say what should start it."],
    ["What should happen?", "Say what should happen."],
  ] as const) {
    const field = form.getByLabel(label, { exact: true });
    await expect(field).toHaveAttribute("aria-invalid", "true");
    await expect(form.getByText(message, { exact: true })).toBeVisible();
  }
  await expect(submitButton(page)).toHaveText("Send request");

  // Filling one field clears only its error on the next submit.
  await form.getByLabel("Title", { exact: true }).fill("Half a request");
  await submitButton(page).click();
  await expect(form.getByLabel("Title", { exact: true })).not.toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(
    form.getByLabel("What should happen?", { exact: true }),
  ).toHaveAttribute("aria-invalid", "true");

  // Nothing was sent: not listed, not stored.
  await expect(requestList(page).getByRole("article")).toHaveCount(
    SEEDED.length,
  );
  await expect(request(page, "Half a request")).toHaveCount(0);
  expect(await storedRequests(page)).toHaveLength(SEEDED.length);
});

test("a request the API refuses keeps what was typed and says why", async ({
  page,
  gotoApp,
}) => {
  // Every mutation fails at a 100% failure rate (Settings > Demo Data). The
  // setting lives in memory, so reach the page by links, not a reload.
  await gotoApp("/settings/demo-data");
  const failure = page.getByRole("slider").nth(1);
  await failure.focus();
  await failure.press("End");
  await expect(main(page).getByText("100%", { exact: true })).toBeVisible();
  await page
    .locator('[data-slot="sidebar"]')
    .getByRole("link", { name: "Automation", exact: true })
    .click();
  await expect(page).toHaveURL(/\/automation$/, NAVIGATION);
  await main(page)
    .getByRole("link", { name: "Request an automation", exact: true })
    .click();
  await expect(page).toHaveURL(/\/automation\/requests$/, NAVIGATION);
  await expect(requestList(page).getByRole("article")).toHaveCount(
    SEEDED.length,
  );

  const form = requestForm(page);
  const values = {
    Title: "Refused request",
    "What goes wrong today?": "It is refused.",
    "What should start it?": "Sending it.",
    "What should happen?": "Nothing.",
  } as const;
  for (const [label, value] of Object.entries(values)) {
    await form.getByLabel(label, { exact: true }).fill(value);
  }
  await submitButton(page).click();

  await expect(form.getByRole("alert")).toHaveText(
    "Network request failed. Please try again.",
  );
  await expect(submitButton(page)).toHaveText("Send request");
  await expect(submitButton(page)).toBeEnabled();
  for (const [label, value] of Object.entries(values)) {
    await expect(form.getByLabel(label, { exact: true })).toHaveValue(value);
  }
  await expect(request(page, "Refused request")).toHaveCount(0);
  expect(await storedRequests(page)).toHaveLength(SEEDED.length);
});

test("a shipped request links to the automation it became", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/automation/requests");
  const shipped = request(
    page,
    "Remind people the day before their appointment",
  );
  await expect(shipped).toContainText(
    "Shipped as Appointment Reminders: a confirmation text",
  );
  const link = shipped.getByRole("link", {
    name: "Appointment Reminders",
    exact: true,
  });
  await expect(link).toHaveAttribute(
    "href",
    "/automation/wf_appointment_reminders",
  );
  // Requests that did not ship link nowhere.
  await expect(
    request(page, "Flag deals stuck in one stage for two weeks").getByRole(
      "link",
    ),
  ).toHaveCount(0);

  await link.click();
  await expect(page).toHaveURL(
    /\/automation\/wf_appointment_reminders$/,
    NAVIGATION,
  );
  await expect(
    main(page).getByRole("heading", {
      level: 1,
      name: "Appointment Reminders",
      exact: true,
    }),
  ).toBeVisible();
});

/**
 * Opens the requests page from `/automation` by its link: a client-side
 * navigation, so a fault installed after `gotoApp` survives and the page's
 * reads are its first load.
 */
async function openRequestsByLink(page: Page): Promise<void> {
  await main(page)
    .getByRole("link", { name: "Request an automation", exact: true })
    .click();
  await expect(page).toHaveURL(/\/automation\/requests$/, NAVIGATION);
}

/** `/automation`, loaded, so its own reads are done before a fault. */
async function gotoAutomationList(
  page: Page,
  gotoApp: (path: string) => Promise<void>,
): Promise<void> {
  await gotoApp("/automation");
  await expect(main(page).getByRole("region").first()).toBeVisible({
    timeout: 15_000,
  });
}

test("a failed requests read shows one alert, and its Retry brings the list back", async ({
  page,
  gotoApp,
}) => {
  await gotoAutomationList(page, gotoApp);
  await failReads(page, "automationRequests");
  await openRequestsByLink(page);

  const alert = loadErrorAlert(page, REQUESTS_ERROR);
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(FAULT_MESSAGE);
  await expect(main(page).getByRole("alert")).toHaveCount(1);
  await expect(requestList(page)).toHaveCount(0);
  // The form does not depend on the list: a request can still be written.
  await expect(requestForm(page)).toBeVisible();

  await restoreReads(page);
  await alert.getByRole("button", { name: "Retry", exact: true }).click();
  await expectSeededList(page, (expected) => expected.asker);
  await expect(main(page).getByRole("alert")).toHaveCount(0);
});

test("requests and teammates failing together show one alert, and its Retry brings back both", async ({
  page,
  gotoApp,
}) => {
  await gotoAutomationList(page, gotoApp);
  await failReads(page, "automationRequests", "users");
  await openRequestsByLink(page);

  const alert = loadErrorAlert(page, REQUESTS_ERROR);
  await expect(alert).toBeVisible();
  // The alert shows once both reads have settled, so both failed by now.
  // One fault, one alert: no teammates alert beside it.
  expect(await readFaultThrows(page)).toBeGreaterThanOrEqual(2);
  await expect(main(page).getByRole("alert")).toHaveCount(1);

  await restoreReads(page);
  await alert.getByRole("button", { name: "Retry", exact: true }).click();
  // Real names, not "Unknown teammate", and no teammates alert next.
  await expectSeededList(page, (expected) => expected.asker);
  await expect(main(page).getByRole("alert")).toHaveCount(0);
});

test("a failed teammates read keeps the list with Unknown teammate, and Retry brings the names back", async ({
  page,
  gotoApp,
}) => {
  await gotoAutomationList(page, gotoApp);
  await failReads(page, "users");
  await openRequestsByLink(page);

  await expectSeededList(page, () => UNKNOWN);
  const alert = loadErrorAlert(page, TEAMMATES_ERROR);
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(FAULT_MESSAGE);
  await expect(main(page).getByRole("alert")).toHaveCount(1);

  await restoreReads(page);
  await alert.getByRole("button", { name: "Retry", exact: true }).click();
  await expectSeededList(page, (expected) => expected.asker);
  await expect(main(page).getByRole("alert")).toHaveCount(0);
});
