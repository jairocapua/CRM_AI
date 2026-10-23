import type { Locator, Page } from "@playwright/test";

import {
  bookingDialog,
  chooseCalendar,
  expectViewLoaded,
  openTimes,
  readContacts,
  timeGroup,
  timeRadio,
  type SeededContact,
} from "./calendar-helpers";
import { expect, test } from "./fixtures";

/**
 * The booking dialog's form itself, apart from booking (calendars-booking
 * .spec.ts) and its load error (calendars-load-errors.spec.ts): its controls'
 * ids, a fresh form on every open, and the time cards at phone widths.
 *
 * Seed facts these tests rely on (LEARNINGS P7-T08, P7-T09): the demo clock
 * starts at 2026-09-08 09:00 UTC, and Discovery Call offers sixteen times on
 * each of Wednesday 9 and Thursday 10 September in Singapore, the first of
 * them at 12:00 AM, the widest label a time card holds. The phone test checks
 * that one is listed, so a seed change fails loudly instead of passing on
 * narrower labels.
 */

const ZONE = "Asia/Singapore";
const CALENDAR = "Discovery Call";
/** The day in view, which the dialog opens on. */
const DAY = "2026-09-09";
const OTHER_DAY = "2026-09-10";

test.use({ timezoneId: ZONE, locale: "en-US" });

/** The toolbar's Book button. */
const bookButton = (page: Page) =>
  page.getByRole("button", { name: "Book", exact: true });

async function openBookingDialog(
  page: Page,
  gotoApp: (path: string) => Promise<void>,
) {
  await gotoApp(`/calendars?view=month&date=${DAY}`);
  await expectViewLoaded(page, "Month");
  await bookButton(page).click();
  const dialog = bookingDialog(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Day", { exact: true })).toHaveValue(DAY);
  return dialog;
}

/** The id React's `useId` gave this open's form. */
async function formIdOf(dialog: Locator): Promise<string> {
  const id = await dialog.locator("form").getAttribute("id");
  if (!id) throw new Error("The booking form has no id");
  return id;
}

/** A contact no other contact shares a full name with. */
function uniquelyNamed(contacts: readonly SeededContact[]): SeededContact {
  const found = contacts.find(
    (contact) =>
      contacts.filter((other) => other.name === contact.name).length === 1,
  );
  if (!found) throw new Error("No contact with a unique name");
  return found;
}

test("the form's controls take their ids from the form's own id", async ({
  page,
  gotoApp,
}) => {
  const dialog = await openBookingDialog(page, gotoApp);
  const formId = await formIdOf(dialog);

  // Found by their labels, so each label still names its control.
  const controls = {
    calendar: dialog.getByRole("combobox", { name: "Calendar", exact: true }),
    contact: dialog.getByRole("combobox", { name: "Contact", exact: true }),
    day: dialog.getByLabel("Day", { exact: true }),
  };
  for (const [suffix, control] of Object.entries(controls)) {
    const id = `${formId}-${suffix}`;
    await expect(control).toHaveAttribute("id", id);
    // An attribute selector, not `#id`: whether useId's output ("_r_5_" now,
    // ":r5:" in older React) is a valid CSS identifier depends on React.
    await expect(page.locator(`[id="${id}"]`)).toHaveCount(1);
    await expect(dialog.locator(`label[for="${id}"]`)).toHaveCount(1);
  }
  // No fixed ids are left, so two forms on a page could not collide.
  await expect(page.locator('[id^="booking-"]')).toHaveCount(0);
});

test("reopening before the closing popup unmounts starts a fresh form", async ({
  page,
  gotoApp,
}) => {
  const dialog = await openBookingDialog(page, gotoApp);
  const contact = uniquelyNamed(await readContacts(page));
  const firstFormId = await formIdOf(dialog);

  // The first open: every field changed, a time chosen.
  await chooseCalendar(page, dialog, CALENDAR);
  const contactInput = dialog.getByRole("combobox", { name: "Contact" });
  await contactInput.fill(contact.name);
  await page
    .getByRole("option")
    .filter({ has: page.getByText(contact.name, { exact: true }) })
    .click();
  await expect(contactInput).toHaveValue(contact.name);
  await dialog.getByLabel("Day", { exact: true }).fill(OTHER_DAY);
  const [first] = await openTimes(dialog, OTHER_DAY, ZONE);
  if (!first) throw new Error("No open time");
  await timeRadio(dialog, first.label).click();
  await expect(timeRadio(dialog, first.label)).toHaveAttribute(
    "aria-checked",
    "true",
  );

  // Base UI keeps a closing popup mounted until its exit animation ends, and
  // for good while animations are paused (a hidden browser pane). A long exit
  // animation stands in for that, so the reopen lands in the same popup.
  await page.addStyleTag({
    content:
      '[data-slot="dialog-content"][data-closed],[data-slot="dialog-overlay"][data-closed]{animation-duration:60s !important}',
  });
  await dialog.evaluate((element) => {
    (element as HTMLElement).dataset.e2eFirstOpen = "";
  });
  const firstPopup = page.locator(
    '[data-slot="dialog-content"][data-e2e-first-open]',
  );

  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  // Closed, and still mounted.
  await expect(firstPopup).toHaveAttribute("data-closed", "");

  // The page behind the closing modal is aria-hidden and the overlay still
  // covers it, so the reopen is a dispatched click on the Book button.
  await page
    .getByRole("button", { name: "Book", exact: true, includeHidden: true })
    .dispatchEvent("click");
  // The same popup element, open again: not a fresh mount that would pass
  // without the form ever being reset.
  await expect(
    page.locator(
      '[data-slot="dialog-content"][data-e2e-first-open][data-open]',
    ),
  ).toHaveCount(1);
  await expect(dialog).toBeVisible();

  // Fresh defaults throughout.
  await expect(
    dialog
      .getByRole("combobox", { name: "Calendar" })
      .locator('[data-slot="select-value"]'),
  ).toHaveText("Pick a calendar");
  await expect(contactInput).toHaveValue("");
  await expect(dialog.getByLabel("Day", { exact: true })).toHaveValue(DAY);
  const group = timeGroup(dialog);
  await expect(
    group.getByText("Pick a calendar to see open times.", { exact: true }),
  ).toBeVisible();
  await expect(group.getByRole("radio")).toHaveCount(0);
  expect(await formIdOf(dialog)).not.toBe(firstFormId);
});

interface CardLayout {
  text: string;
  /** Distinct line boxes the time's text sits on. */
  lines: number;
  /** The text stays within the card's padding on the left and right. */
  inside: boolean;
  /** The card's left edge, rounded: one value per column. */
  left: number;
}

/** Each time card in the Time group: its text's lines, and where it sits. */
function cardLayouts(dialog: Locator): Promise<CardLayout[]> {
  return timeGroup(dialog)
    .locator('label[data-slot="field-label"]')
    .evaluateAll((cards) =>
      cards.map((card) => {
        // The card is a label around a Field (radio + title), and the Field
        // carries the card's padding.
        const field = card.querySelector('[data-slot="field"]');
        const title = field?.querySelector(
          ':scope > [data-slot="field-label"]',
        );
        if (!field || !title) throw new Error("A time card has no title");
        const range = document.createRange();
        range.selectNodeContents(title);
        const rects = [...range.getClientRects()].filter(
          (rect) => rect.width > 0 && rect.height > 0,
        );
        const text = range.getBoundingClientRect();
        const box = field.getBoundingClientRect();
        const style = getComputedStyle(field);
        const contentLeft = box.left + parseFloat(style.paddingLeft);
        const contentRight = box.right - parseFloat(style.paddingRight);
        return {
          text: title.textContent ?? "",
          lines: new Set(rects.map((rect) => Math.round(rect.top))).size,
          inside:
            text.left >= contentLeft - 0.5 && text.right <= contentRight + 0.5,
          left: Math.round(card.getBoundingClientRect().left),
        };
      }),
    );
}

test("time cards keep each time on one line at phone widths", async ({
  page,
  gotoApp,
}) => {
  await page.setViewportSize({ width: 400, height: 800 });
  const dialog = await openBookingDialog(page, gotoApp);
  await chooseCalendar(page, dialog, CALENDAR);
  const times = await openTimes(dialog, DAY, ZONE);
  // Tripwire: the widest label is among them.
  expect(times.map((time) => time.label)).toContain("12:00 AM");

  const widths: [number, number][] = [
    [320, 2],
    [375, 2],
    [400, 2],
    [639, 2],
    [640, 4],
    [1280, 4],
  ];
  for (const [width, columns] of widths) {
    await page.setViewportSize({ width, height: 800 });
    await expect(async () => {
      const cards = await cardLayouts(dialog);
      expect(cards).toHaveLength(times.length);
      for (const card of cards) {
        expect(card, `"${card.text}" at ${width}px`).toMatchObject({
          lines: 1,
          inside: true,
        });
      }
      expect(
        new Set(cards.map((card) => card.left)).size,
        `columns at ${width}px`,
      ).toBe(columns);
    }).toPass();
  }
});
