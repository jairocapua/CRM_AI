import type { Locator, Page } from "@playwright/test";

import {
  failReads,
  failUserList,
  loadErrorAlert,
  readContacts,
  restoreReads,
  restoreUserList,
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
 * The team page (P9-T03): the team list, inviting a teammate (Pending until
 * they first sign in), changing a teammate's role, and removing one with a
 * preview of what moves. Seeded: Jordan Reyes (`usr_jordan`, the current
 * user, Agency owner) and five teammates, each named by an automation, so
 * the API refuses to remove them; the happy path invites Casey first.
 */

const SEEDED_TEAM = 6;
const NETWORK_FAILURE = "Network request failed. Please try again.";

const table = (page: Page) =>
  page.getByRole("table", { name: "Team members", exact: true });
const rows = (page: Page) =>
  table(page)
    .getByRole("row")
    .filter({
      has: page.getByRole("cell"),
    });
const row = (page: Page, name: string) => rows(page).filter({ hasText: name });
const roleSelect = (page: Page, name: string) =>
  page.getByRole("combobox", { name: `Role for ${name}`, exact: true });
const removeButton = (page: Page, name: string) =>
  page.getByRole("button", { name: `Remove ${name}`, exact: true });

const inviteDialog = (page: Page) =>
  page.getByRole("dialog", { name: "Invite a teammate" });
const inviteForm = (page: Page) => settingsForm(page, "Invite a teammate");
const inviteInput = (page: Page, label: string) =>
  inviteForm(page).getByLabel(label, { exact: true });
const inviteSubmit = (page: Page) =>
  inviteForm(page).getByRole("button", {
    name: /^(Invite teammate|Inviting…)$/,
  });

const removeDialog = (page: Page) => page.getByRole("alertdialog");

/** The value a Select's trigger shows. */
const valueOf = (select: Locator) =>
  select.locator('[data-slot="select-value"]');

/** Picks `option` in a Select. */
async function choose(page: Page, select: Locator, option: string) {
  await select.click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function openTeam(page: Page) {
  await expect(pageHeading(page, "Team settings")).toBeVisible(NAVIGATION);
  await expect(rows(page).first()).toBeVisible(NAVIGATION);
}

/** Opens the invite dialog from the page's button. */
async function openInvite(page: Page) {
  await page
    .getByRole("main")
    .getByRole("button", { name: "Invite teammate", exact: true })
    .click();
  await expect(inviteDialog(page)).toBeVisible();
}

/** Opens the invite dialog and fills it for Casey Lin. */
async function fillInvite(
  page: Page,
  { email = "casey@northwind.studio", role = "Admin" } = {},
) {
  await openInvite(page);
  await inviteInput(page, "First name").fill("Casey");
  await inviteInput(page, "Last name").fill("Lin");
  await inviteInput(page, "Email").fill(email);
  await choose(
    page,
    inviteForm(page).getByRole("combobox", { name: "Role" }),
    role,
  );
  await inviteInput(page, "Job title (optional)").fill("Designer");
}

/** Invites Casey Lin and waits for her row. */
async function inviteCasey(page: Page) {
  await fillInvite(page);
  await inviteSubmit(page).click();
  await expect(toastNamed(page, "Casey Lin added to the team")).toBeVisible();
  await expect(inviteDialog(page)).toBeHidden();
  await expect(row(page, "Casey Lin")).toBeVisible();
}

/** The contact page's Owner value. */
const ownerValue = (page: Page) =>
  page
    .getByRole("main")
    .getByText("Owner", { exact: true })
    .locator("xpath=following-sibling::span[1]");

test("the team list marks you, and an invited teammate is Pending, after a reload too", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/team");
  await openTeam(page);
  await expect(rows(page)).toHaveCount(SEEDED_TEAM);
  const jordan = row(page, "Jordan Reyes");
  await expect(jordan).toContainText("You");
  await expect(jordan).toContainText("jordan@northwind.studio");
  await expect(
    row(page, "Priya Nair").getByRole("cell", { name: "Active", exact: true }),
  ).toBeVisible();

  await inviteCasey(page);

  const casey = row(page, "Casey Lin");
  await expect(rows(page)).toHaveCount(SEEDED_TEAM + 1);
  await expect(casey).toContainText("casey@northwind.studio");
  await expect(
    casey.getByRole("cell", { name: "Pending", exact: true }),
  ).toBeVisible();
  await expect(
    casey.getByRole("cell", { name: "Never signed in", exact: true }),
  ).toBeVisible();
  await expect(valueOf(roleSelect(page, "Casey Lin"))).toHaveText("Admin");
  // Seeded teammates have signed in; nobody else is Pending.
  await expect(
    table(page).getByRole("cell", { name: "Pending", exact: true }),
  ).toHaveCount(1);

  await page.reload();
  await waitForBoot(page);
  await openTeam(page);
  await expect(rows(page)).toHaveCount(SEEDED_TEAM + 1);
  await expect(
    row(page, "Casey Lin").getByRole("cell", { name: "Pending", exact: true }),
  ).toBeVisible();
  await expect(valueOf(roleSelect(page, "Casey Lin"))).toHaveText("Admin");
});

test("an empty invite shows each required field's error and stores nothing", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/team");
  await openTeam(page);
  await page
    .getByRole("main")
    .getByRole("button", { name: "Invite teammate", exact: true })
    .click();
  await inviteSubmit(page).click();

  for (const [label, message] of [
    ["First name", "Enter a first name."],
    ["Last name", "Enter a last name."],
    ["Email", "Enter an email address."],
  ] as const) {
    await expect(inviteInput(page, label)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await expect(inviteInput(page, label)).toHaveAccessibleDescription(message);
  }
  await expect(inviteInput(page, "Job title (optional)")).not.toHaveAttribute(
    "aria-invalid",
  );
  await expect(inviteDialog(page)).toBeVisible();
  await expect(toastNamed(page, "added to the team")).toHaveCount(0);

  await inviteForm(page).getByRole("button", { name: "Cancel" }).click();
  await expect(inviteDialog(page)).toBeHidden();
  await expect(rows(page)).toHaveCount(SEEDED_TEAM);
});

test("an email a teammate already has is refused on the email field", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/team");
  await openTeam(page);
  await fillInvite(page, { email: "PRIYA@northwind.studio" });
  await inviteSubmit(page).click();

  const email = inviteInput(page, "Email");
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(email).toHaveAccessibleDescription(
    "That email address already belongs to Priya Nair.",
  );
  await expect(email).toBeFocused();
  await expect(inviteDialog(page)).toBeVisible();
  await expect(inviteInput(page, "First name")).toHaveValue("Casey");

  await inviteForm(page).getByRole("button", { name: "Cancel" }).click();
  await expect(rows(page)).toHaveCount(SEEDED_TEAM);
});

test("a refused invite keeps what was typed and shows the API's sentence", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/demo-data");
  await failEveryMutation(page);
  await openSection(page, "Team", /\/settings\/team$/);
  await openTeam(page);

  await fillInvite(page);
  await inviteSubmit(page).click();

  await expect(
    inviteForm(page).getByRole("alert").filter({ hasText: NETWORK_FAILURE }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(inviteSubmit(page)).toHaveText("Invite teammate");
  await expect(inviteSubmit(page)).toBeFocused();
  await expect(inviteInput(page, "First name")).toHaveValue("Casey");
  await expect(inviteInput(page, "Last name")).toHaveValue("Lin");
  await expect(inviteInput(page, "Email")).toHaveValue(
    "casey@northwind.studio",
  );
  await expect(inviteInput(page, "Job title (optional)")).toHaveValue(
    "Designer",
  );
  await expect(
    valueOf(inviteForm(page).getByRole("combobox", { name: "Role" })),
  ).toHaveText("Admin");
  await expect(toastNamed(page, "Casey Lin added to the team")).toHaveCount(0);
  await expect(row(page, "Casey Lin")).toHaveCount(0);
});

test("the invite dialog cannot close while the invite is on its way", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/demo-data");
  await failEveryMutation(page, { slow: true });
  await openSection(page, "Team", /\/settings\/team$/);
  await openTeam(page);

  await fillInvite(page);
  await inviteSubmit(page).click();
  await expect(inviteSubmit(page)).toHaveText("Inviting…");
  const cancel = inviteForm(page).getByRole("button", { name: "Cancel" });
  await expect(cancel).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(inviteDialog(page)).toBeVisible();

  // The failure lands in the still-open form.
  await expect(
    inviteForm(page).getByRole("alert").filter({ hasText: NETWORK_FAILURE }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(inviteInput(page, "First name")).toHaveValue("Casey");
  await expect(cancel).toBeEnabled();
  await cancel.click();
  await expect(inviteDialog(page)).toBeHidden();
});

test("a closed invite leaves nothing unsaved: the section nav leaves without asking", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/team");
  const discard = page.getByRole("alertdialog", {
    name: "Discard unsaved changes?",
  });

  for (const close of ["Cancel", "Escape"] as const) {
    await openTeam(page);
    await openInvite(page);
    await inviteInput(page, "First name").fill("Casey");
    if (close === "Cancel") {
      await inviteForm(page).getByRole("button", { name: "Cancel" }).click();
    } else {
      await page.keyboard.press("Escape");
    }
    await expect(inviteDialog(page)).toBeHidden();

    await openSection(page, "Profile", /\/settings\/profile$/);
    await expect(discard).toHaveCount(0);
    await expect(pageHeading(page, "Profile")).toBeVisible(NAVIGATION);
    await openSection(page, "Team", /\/settings\/team$/);
  }
});

test("a role change persists across a reload; your own row has no role picker and no Remove", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/team");
  await openTeam(page);
  await expect(roleSelect(page, "Jordan Reyes")).toHaveCount(0);
  await expect(removeButton(page, "Jordan Reyes")).toHaveCount(0);
  await expect(row(page, "Jordan Reyes")).toContainText("Agency owner");
  await expect(valueOf(roleSelect(page, "Priya Nair"))).toHaveText("Admin");
  await expect(removeButton(page, "Priya Nair")).toBeVisible();

  await choose(page, roleSelect(page, "Priya Nair"), "User");
  await expect(toastNamed(page, "Role changed")).toContainText(
    "Priya Nair is now User.",
  );
  await expect(valueOf(roleSelect(page, "Priya Nair"))).toHaveText("User");

  await page.reload();
  await waitForBoot(page);
  await openTeam(page);
  await expect(valueOf(roleSelect(page, "Priya Nair"))).toHaveText("User");
  await expect(roleSelect(page, "Jordan Reyes")).toHaveCount(0);
});

test("a failed role change goes back to the stored role and says why", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/demo-data");
  await failEveryMutation(page);
  await openSection(page, "Team", /\/settings\/team$/);
  await openTeam(page);

  await choose(page, roleSelect(page, "Marcus Bell"), "Admin");
  await expect(toastNamed(page, NETWORK_FAILURE)).toBeVisible({
    timeout: 10_000,
  });
  await expect(valueOf(roleSelect(page, "Marcus Bell"))).toHaveText("User");
  await expect(toastNamed(page, "Role changed")).toHaveCount(0);
});

test("removing a teammate who owns a contact hands it to you and keeps the integrity report clean", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/team");
  await openTeam(page);
  await inviteCasey(page);

  // Give Casey a contact through the contact form's Owner select.
  const [contact] = await readContacts(page);
  await gotoApp(`/contacts/${contact!.id}`);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Edit contact" });
  await expect(sheet).toBeVisible();
  await choose(
    page,
    sheet.getByRole("combobox", { name: "Owner" }),
    "Casey Lin",
  );
  await sheet
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(sheet).toBeHidden();
  await expect(ownerValue(page)).toHaveText("Casey Lin");

  await gotoApp("/settings/team");
  await openTeam(page);
  await removeButton(page, "Casey Lin").click();
  const dialog = removeDialog(page);
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("1 contact moves to Jordan Reyes.");
  await expect(dialog).toContainText("Follows are dropped, not moved.");
  await expect(
    valueOf(dialog.getByRole("combobox", { name: "Move their records to" })),
  ).toHaveText("Jordan Reyes (you)");
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();

  await dialog
    .getByRole("button", { name: "Remove Casey", exact: true })
    .click();
  await expect(
    toastNamed(page, "Casey Lin removed from the team"),
  ).toContainText("Their records now belong to Jordan Reyes.");
  await expect(dialog).toBeHidden();
  await expect(row(page, "Casey Lin")).toHaveCount(0);
  await expect(rows(page)).toHaveCount(SEEDED_TEAM);
  await expect(
    page.getByRole("heading", { name: "Team members", exact: true }),
  ).toBeFocused();

  await gotoApp(`/contacts/${contact!.id}`);
  await expect(ownerValue(page)).toHaveText("Jordan Reyes", NAVIGATION);

  await gotoApp("/settings/demo-data");
  await expect(
    page.getByText("No problems found — every reference resolves."),
  ).toBeVisible(NAVIGATION);
});

test("a removed teammate's row goes at once, before the team is read again", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/team");
  await openTeam(page);
  await inviteCasey(page);
  await removeButton(page, "Casey Lin").click();
  const dialog = removeDialog(page);
  await expect(dialog).toContainText("Nothing to reassign.");

  // The removal lists no users, so it succeeds; the team's refetch after it
  // fails, so the table keeps its last data, Casey's row included.
  await failUserList(page);
  await dialog
    .getByRole("button", { name: "Remove Casey", exact: true })
    .click();
  const toast = toastNamed(page, "Casey Lin removed from the team");
  await expect(toast).toBeVisible();
  // Nothing moved, so the toast does not say it did.
  await expect(toast).not.toContainText("Their records now belong to");
  await expect(dialog).toBeHidden();
  await expect(row(page, "Casey Lin")).toHaveCount(0);
  await expect(rows(page)).toHaveCount(SEEDED_TEAM);
  await expect(
    page.getByRole("heading", { name: "Team members", exact: true }),
  ).toBeFocused();
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
});

test("the records can go to another teammate picked in the dialog", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/team");
  await openTeam(page);
  await inviteCasey(page);
  const [contact] = await readContacts(page);
  await gotoApp(`/contacts/${contact!.id}`);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Edit contact" });
  await choose(
    page,
    sheet.getByRole("combobox", { name: "Owner" }),
    "Casey Lin",
  );
  await sheet
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await expect(ownerValue(page)).toHaveText("Casey Lin");

  await gotoApp("/settings/team");
  await openTeam(page);
  await removeButton(page, "Casey Lin").click();
  const dialog = removeDialog(page);
  await choose(
    page,
    dialog.getByRole("combobox", { name: "Move their records to" }),
    "Priya Nair",
  );
  await expect(dialog).toContainText("1 contact moves to Priya Nair.");
  await dialog
    .getByRole("button", { name: "Remove Casey", exact: true })
    .click();
  await expect(
    toastNamed(page, "Casey Lin removed from the team"),
  ).toContainText("Their records now belong to Priya Nair.");

  await gotoApp(`/contacts/${contact!.id}`);
  await expect(ownerValue(page)).toHaveText("Priya Nair", NAVIGATION);
});

test("a seeded teammate an automation names cannot be removed, and the dialog says why", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/team");
  await openTeam(page);
  await removeButton(page, "Priya Nair").click();

  const dialog = removeDialog(page);
  await expect(
    dialog.getByRole("heading", { name: "Priya Nair can't be removed yet" }),
  ).toBeVisible();
  await expect(dialog).toContainText(
    "Priya Nair is named in the Speed to Lead automation. Ask your developer to change it before removing Priya.",
  );
  await expect(dialog.getByRole("button", { name: /^Remove/ })).toHaveCount(0);
  await expect(
    dialog.getByRole("combobox", { name: "Move their records to" }),
  ).toHaveCount(0);
  const close = dialog.getByRole("button", { name: "Close", exact: true });
  await expect(close).toBeFocused();
  await close.click();
  await expect(dialog).toBeHidden();
  await expect(removeButton(page, "Priya Nair")).toBeFocused();
  await expect(row(page, "Priya Nair")).toBeVisible();
  await expect(rows(page)).toHaveCount(SEEDED_TEAM);
});

test("a failed removal keeps the dialog open and focus on its button", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/team");
  await openTeam(page);
  await inviteCasey(page);
  await openSection(page, "Demo data", /\/settings\/demo-data$/);
  await failEveryMutation(page, { slow: true });
  await openSection(page, "Team", /\/settings\/team$/);
  await openTeam(page);

  await removeButton(page, "Casey Lin").click();
  const dialog = removeDialog(page);
  await expect(dialog).toContainText("Nothing to reassign.");
  const confirm = dialog.getByRole("button", {
    name: /^(Remove Casey|Removing…)$/,
  });
  await confirm.click();

  await expect(confirm).toHaveText("Removing…");
  await expect(confirm).toHaveAttribute("aria-disabled", "true");
  await expect(confirm).toBeFocused();

  await expect(toastNamed(page, NETWORK_FAILURE)).toBeVisible({
    timeout: 10_000,
  });
  await expect(confirm).toHaveText("Remove Casey");
  await expect(confirm).toBeFocused();
  await expect(dialog).toBeVisible();
  await expect(toastNamed(page, "Casey Lin removed from the team")).toHaveCount(
    0,
  );

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(row(page, "Casey Lin")).toBeVisible();
});

test("on a phone the team fits the screen: no sideways scroll, names whole", async ({
  page,
  gotoApp,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await gotoApp("/settings/team");
  await openTeam(page);
  await expect(rows(page)).toHaveCount(SEEDED_TEAM);

  const container = page.locator('[data-slot="table-container"]');
  const { scrollWidth, clientWidth } = await container.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  // Status and last seen move under the name.
  await expect(row(page, "Sam Whitfield")).toContainText(
    /Active\s*Last seen .+ ago/,
  );
  await expect(
    table(page).getByRole("columnheader", { name: "Last seen" }),
  ).toBeHidden();
});

test("the team failing to load shows one alert, and Retry brings it back", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/profile");
  await failUserList(page);
  await openSection(page, "Team", /\/settings\/team$/);

  const alert = loadErrorAlert(page, "Could not load the team");
  await expect(alert).toBeVisible(NAVIGATION);
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(1);
  await expect(table(page)).toHaveCount(0);

  await restoreUserList(page);
  await alert.getByRole("button", { name: "Retry" }).click();
  await expect(rows(page)).toHaveCount(SEEDED_TEAM);
  await expect(alert).toHaveCount(0);
});

test("the removal preview failing shows an alert in the dialog, and Retry brings it back", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/settings/team");
  await openTeam(page);
  await failReads(page, "contacts");
  await removeButton(page, "Priya Nair").click();

  const dialog = removeDialog(page);
  const alert = dialog
    .getByRole("alert")
    .filter({ hasText: "Could not check what Priya holds" });
  await expect(alert).toBeVisible();
  await expect(dialog.getByRole("alert")).toHaveCount(1);
  await expect(dialog.getByRole("button", { name: /^Remove/ })).toHaveCount(0);
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);

  await restoreReads(page);
  await alert.getByRole("button", { name: "Retry" }).click();
  await expect(alert).toHaveCount(0);
  await expect(dialog).toContainText(
    "Priya Nair is named in the Speed to Lead automation.",
  );
});
