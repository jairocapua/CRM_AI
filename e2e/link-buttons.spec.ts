import type { Locator, Page } from "@playwright/test";

import { expect, NAVIGATION, test } from "./fixtures";

/**
 * Links drawn as buttons stay links: an `<a href>` with no role, so screen
 * readers announce "link" and the browser's link behaviours (open in a new
 * tab, copy address) keep working.
 *
 * Two causes, both covered here:
 *
 * - The role. Base UI's Button with `nativeButton={false}` always sets
 *   `role="button"`, even on an `<a href>`
 *   (node_modules/@base-ui/react/internals/use-button/useButton.mjs, the
 *   `isNativeButton ? { type: 'button' } : { role: 'button' }` branch). So
 *   `<Button render={<Link/>} nativeButton={false}>` is a link announced as a
 *   button. These controls are `<LinkButton>` (src/components/ui/button.tsx):
 *   Next's Link with the cn()-merged classes.
 * - The look. `Button` passes its cva output through `cn()`, which drops the
 *   earlier of two conflicting classes. A raw `buttonVariants()` string keeps
 *   both, and Tailwind's CSS order picks the winner: `border-transparent`
 *   beats the outline variant's `border-border` (no visible border),
 *   `rounded-lg` beats size sm/icon-sm's 8px radius, and the base 16px icon
 *   rule beats size sm's 14px. Padding has a cause of its own: sm narrows a
 *   side's padding to 6px only beside an icon that carries `data-icon`, so a
 *   link icon without it keeps the full 10px. So each link is checked against
 *   the size, corners, padding, icon and border of the button it replaced.
 *
 * Light mode is pinned, with a tripwire on `<html>`: in dark mode the outline
 * variant's `dark:border-input` paints a border anyway, so a dark run would
 * pass without testing the border at all.
 */

test.use({ colorScheme: "light", locale: "en-US" });

/** `getComputedStyle` reads `transparent` back as this. */
const TRANSPARENT = "rgba(0, 0, 0, 0)";

interface ButtonLook {
  height: string;
  width: string;
  radius: string;
  paddingLeft: string;
  paddingRight: string;
  borderColor: string;
  borderWidth: string;
  background: string;
  fontSize: string;
  /** The first icon's rendered width, or null when there is no icon. */
  iconWidth: string | null;
}

/**
 * The computed styles that tell one button size and variant from another.
 * The mouse is parked in the corner first, so no hover state leaks in.
 */
async function buttonLook(page: Page, control: Locator): Promise<ButtonLook> {
  await page.mouse.move(0, 0);
  await expect(control).toBeVisible();
  return control.evaluate((element) => {
    const style = getComputedStyle(element);
    const icon = element.querySelector("svg");
    return {
      height: style.height,
      width: style.width,
      radius: style.borderTopLeftRadius,
      paddingLeft: style.paddingLeft,
      paddingRight: style.paddingRight,
      borderColor: style.borderTopColor,
      borderWidth: style.borderTopWidth,
      background: style.backgroundColor,
      fontSize: style.fontSize,
      iconWidth: icon ? getComputedStyle(icon).width : null,
    };
  });
}

/**
 * What a variant and size fix, in one object so a failure lists every
 * difference at once: height, corners, side padding, icon size and whether a
 * border shows (outline has one, ghost does not). Expected values come from
 * the tokens: `--radius` 0.625rem (`rounded-lg` 10px, `--radius-md` 8px) and
 * the 0.25rem spacing step (`h-7` 28px, `h-8` 32px, `size-3.5` 14px, `size-4`
 * 16px). Padding is the size's `px-2.5` (10px), narrowed by sm to `pl-1.5` /
 * `pr-1.5` (6px) on the side of an icon that carries `data-icon`
 * (`inline-start` / `inline-end`). The icon sizes set no padding (0px).
 */
function sizeLook({
  height,
  radius,
  paddingLeft,
  paddingRight,
  iconWidth,
  borderColor,
  borderWidth,
}: ButtonLook) {
  const border =
    borderColor !== TRANSPARENT && borderWidth !== "0px" ? "visible" : "none";
  return { height, radius, paddingLeft, paddingRight, iconWidth, border };
}

/** A plain link: the right destination and no role overriding "link". */
async function expectPlainLink(link: Locator, href: string): Promise<void> {
  await expect(link).toHaveAttribute("href", href);
  await expect(link).not.toHaveAttribute("role");
}

/** No link anywhere on the screen is announced as a button. */
async function expectNoLinkButtons(page: Page): Promise<void> {
  await expect(page.locator('a[role="button"]')).toHaveCount(0);
}

/** Fails if the page is not in light mode, see the header. */
async function expectLightMode(page: Page): Promise<void> {
  await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
}

/** The first thread in the inbox list. */
const firstInboxRow = (page: Page) =>
  page.getByRole("main").locator('a[href^="/conversations/"]').first();

test("dashboard: Open board is a link styled as a small ghost button", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/dashboard");
  await expectLightMode(page);

  const card = page.locator('[data-slot="card"]').filter({
    has: page.locator('[data-slot="card-title"]', {
      hasText: /^Deals by stage$/,
    }),
  });
  const link = card.getByRole("link", { name: "Open board", exact: true });
  await expectPlainLink(link, "/opportunities");
  await expect(card.getByRole("button", { name: "Open board" })).toHaveCount(0);
  await expectNoLinkButtons(page);

  expect(sizeLook(await buttonLook(page, link))).toEqual({
    height: "28px",
    radius: "8px",
    paddingLeft: "10px",
    paddingRight: "6px",
    iconWidth: "14px",
    border: "none",
  });

  // The keyboard path: a link follows on Enter.
  await link.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/opportunities$/, NAVIGATION);
  await expect(
    page
      .getByRole("main")
      .getByRole("heading", { level: 1, name: "Opportunities", exact: true }),
  ).toBeVisible();
});

test("inbox: View contact is a link styled as a small outline button", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/conversations");
  await expectLightMode(page);
  await firstInboxRow(page).click();

  const main = page.getByRole("main");
  const link = main.getByRole("link", { name: "View contact", exact: true });
  await expect(link).toBeVisible(NAVIGATION);

  // The thread header's contact name links to the same record: an oracle the
  // details pane does not share. The header is found from its own Contact
  // details toggle (the nearest box around it that holds a contact link), so
  // the lookup does not depend on where the details pane sits in the DOM.
  const header = main
    .getByRole("button", { name: "Contact details", exact: true })
    .locator('xpath=ancestor::*[.//a[starts-with(@href, "/contacts/")]][1]');
  await expect(header).toHaveCount(1);
  await expect(header.getByRole("link", { name: "View contact" })).toHaveCount(
    0,
  );
  const headerLink = header.locator('a[href^="/contacts/"]');
  await expect(headerLink).toHaveCount(1);
  const href = await headerLink.getAttribute("href");
  expect(href).toMatch(/^\/contacts\/[^/]+$/);
  const contactName = (await headerLink.innerText()).trim();
  expect(contactName).not.toBe("");

  await expectPlainLink(link, href!);
  await expect(main.getByRole("button", { name: "View contact" })).toHaveCount(
    0,
  );
  await expectNoLinkButtons(page);

  expect(sizeLook(await buttonLook(page, link))).toEqual({
    height: "28px",
    radius: "8px",
    paddingLeft: "6px",
    paddingRight: "10px",
    iconWidth: "14px",
    border: "visible",
  });

  await link.click();
  await expect(page).toHaveURL(new RegExp(`${href}$`), NAVIGATION);
  await expect(
    page
      .getByRole("main")
      .getByRole("heading", { level: 1, name: contactName, exact: true }),
  ).toBeVisible();
});

test("inbox: Back to inbox on a missing conversation is a link styled as an outline button", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/conversations/missing-thread");
  await expectLightMode(page);
  const main = page.getByRole("main");
  await expect(main.getByText("Conversation not found")).toBeVisible();

  const link = main.getByRole("link", { name: "Back to inbox", exact: true });
  await expectPlainLink(link, "/conversations");
  await expect(main.getByRole("button", { name: "Back to inbox" })).toHaveCount(
    0,
  );
  await expectNoLinkButtons(page);

  expect(sizeLook(await buttonLook(page, link))).toEqual({
    height: "32px",
    radius: "10px",
    paddingLeft: "10px",
    paddingRight: "10px",
    iconWidth: null,
    border: "visible",
  });

  await link.click();
  await expect(page).toHaveURL(/\/conversations$/, NAVIGATION);
  await expect(main.getByText("Select a conversation")).toBeVisible();
});

test.describe("phone", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("the thread header Back to inbox is a link styled as an icon button", async ({
    page,
    gotoApp,
  }) => {
    await gotoApp("/conversations");
    await expectLightMode(page);
    await firstInboxRow(page).click();

    const main = page.getByRole("main");
    // Named by its aria-label: the link holds only an arrow icon.
    const link = main.getByRole("link", { name: "Back to inbox", exact: true });
    await expect(link).toBeVisible(NAVIGATION);
    await expectPlainLink(link, "/conversations");
    await expect(
      main.getByRole("button", { name: "Back to inbox" }),
    ).toHaveCount(0);
    await expectNoLinkButtons(page);

    const look = await buttonLook(page, link);
    expect(look.width).toBe("28px");
    expect(sizeLook(look)).toEqual({
      height: "28px",
      radius: "8px",
      paddingLeft: "0px",
      paddingRight: "0px",
      iconWidth: "16px",
      border: "none",
    });

    await link.click();
    await expect(page).toHaveURL(/\/conversations$/, NAVIGATION);
    await expect(firstInboxRow(page)).toBeVisible();
  });
});

test("calendars: Availability and Back to calendars keep the outline look of the Today button", async ({
  page,
  gotoApp,
}) => {
  await gotoApp("/calendars");
  await expectLightMode(page);

  // The toolbar's Today is a real `<Button variant="outline">`: the look an
  // outline link must match. Padding is left out, since the links carry an
  // inline-start icon and Today does not.
  const outlineLook = ({
    borderColor,
    borderWidth,
    radius,
    height,
    background,
    fontSize,
  }: ButtonLook) => ({
    borderColor,
    borderWidth,
    radius,
    height,
    background,
    fontSize,
  });
  const today = outlineLook(
    await buttonLook(
      page,
      page.getByRole("button", { name: "Today", exact: true }),
    ),
  );
  // Tripwire: a transparent Today would make the comparison pass trivially.
  expect(today.borderColor).not.toBe(TRANSPARENT);

  const availability = page.getByRole("link", {
    name: "Availability",
    exact: true,
  });
  await expectPlainLink(availability, "/calendars/availability");
  expect(outlineLook(await buttonLook(page, availability))).toEqual(today);

  await availability.click();
  await expect(page).toHaveURL(/\/calendars\/availability$/, NAVIGATION);

  const back = page.getByRole("link", {
    name: "Back to calendars",
    exact: true,
  });
  await expectPlainLink(back, "/calendars");
  expect(outlineLook(await buttonLook(page, back))).toEqual(today);
});
