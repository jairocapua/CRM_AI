import {
  bookingDialog,
  chooseCalendar,
  expectViewLoaded,
  localDayIn,
  openTimes,
  readCalendarAvailability,
  timeRadio,
} from "./calendar-helpers";
import { expect, NAVIGATION, test } from "./fixtures";

/**
 * The availability editor: a calendar's weekly hours, saved through the API,
 * decide which times the booking dialog offers.
 *
 * Checked against two oracles the editor does not share: the persisted
 * database (what was saved) and the booking dialog (what the slot engine now
 * offers). The viewer is in Singapore while Discovery Call keeps Los Angeles
 * hours, so the edit is made in the calendar's zone and read back in the
 * viewer's.
 *
 * Seed facts this relies on, pinned by tripwires below so a seed change fails
 * loudly instead of passing trivially: at the anchor, 2026-09-08 09:00 UTC,
 * Discovery Call (30-minute slots) offers all sixteen of its Tuesday slots,
 * 09:00 to 16:30 PDT, which are 00:00 to 07:30 on Wednesday 9 September in
 * Singapore, and all sixteen of its Wednesday slots, which fall on Thursday
 * 10 September there.
 */

const ZONE = "Asia/Singapore";
const CALENDAR_ZONE = "America/Los_Angeles";
const CALENDAR = "Discovery Call";
/** Wednesday in Singapore: Discovery Call's Tuesday 8 September in LA. */
const DAY = "2026-09-09";
/** Thursday in Singapore: Discovery Call's Wednesday, left as it was. */
const OTHER_DAY = "2026-09-10";
const TUESDAY = 2;
const SLOT_MS = 30 * 60_000;
/** 12:00 PDT on Tuesday 8 September, the shortened window's new end. */
const NEW_CLOSE = Date.parse("2026-09-08T19:00:00.000Z");

test.use({ timezoneId: ZONE, locale: "en-US" });

test("shortening a day's window removes the later slots from booking", async ({
  page,
  gotoApp,
}) => {
  await gotoApp(`/calendars?view=day&date=${DAY}`);
  await expectViewLoaded(page, "Day");

  // The baseline: what the booking dialog offers before the edit.
  await page.getByRole("button", { name: "Book", exact: true }).click();
  let dialog = bookingDialog(page);
  await chooseCalendar(page, dialog, CALENDAR);
  await expect(dialog.getByLabel("Day", { exact: true })).toHaveValue(DAY);
  const before = await openTimes(dialog, DAY, ZONE);
  // Tripwires: the whole Tuesday, 09:00–16:30 PDT, is open.
  expect(before).toHaveLength(16);
  expect(before.at(0)?.label).toBe("12:00 AM");
  expect(before.at(-1)?.label).toBe("7:30 AM");
  expect(
    new Set(before.map((time) => localDayIn(CALENDAR_ZONE, time.start))),
  ).toEqual(new Set(["2026-09-08"]));
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // The editor, from the Calendars toolbar, opens on the first calendar.
  await page.getByRole("link", { name: "Availability", exact: true }).click();
  await expect(page).toHaveURL(/\/calendars\/availability$/, NAVIGATION);
  await expect(
    page
      .getByRole("combobox", { name: "Calendar" })
      .locator('[data-slot="select-value"]'),
  ).toHaveText(CALENDAR);

  const tuesday = page.getByRole("group", { name: "Tuesday", exact: true });
  const start = tuesday.getByLabel("Start of window 1", { exact: true });
  const end = tuesday.getByLabel("End of window 1", { exact: true });
  await expect(start).toHaveValue("09:00");
  await expect(end).toHaveValue("17:00");
  const saved = await readCalendarAvailability(page, CALENDAR);

  await end.fill("12:00");
  await page.getByRole("button", { name: "Save availability" }).click();
  await expect(
    page.getByText("Availability saved", { exact: true }),
  ).toBeVisible();

  // Exactly Tuesday changed in the store, and to exactly the new hours.
  await expect
    .poll(() => readCalendarAvailability(page, CALENDAR))
    .toEqual(
      saved.map((rule) =>
        rule.weekday === TUESDAY
          ? {
              weekday: TUESDAY,
              enabled: true,
              windows: [{ start: "09:00", end: "12:00" }],
            }
          : rule,
      ),
    );

  // Back on the calendars (a client navigation, so nothing reloads), the
  // dialog offers only the slots that end by 12:00 PDT.
  await page.getByRole("link", { name: "Back to calendars" }).click();
  await expect(page).toHaveURL(/\/calendars$/, NAVIGATION);
  await page.getByRole("button", { name: "Book", exact: true }).click();
  dialog = bookingDialog(page);
  await chooseCalendar(page, dialog, CALENDAR);
  await dialog.getByLabel("Day", { exact: true }).fill(DAY);
  const after = await openTimes(dialog, DAY, ZONE);

  const kept = before.filter(
    (time) => Date.parse(time.start) + SLOT_MS <= NEW_CLOSE,
  );
  expect(kept.map((time) => time.label)).toEqual([
    "12:00 AM",
    "12:30 AM",
    "1:00 AM",
    "1:30 AM",
    "2:00 AM",
    "2:30 AM",
  ]);
  expect(after.map((time) => time.start)).toEqual(
    kept.map((time) => time.start),
  );
  expect(after.length).toBeLessThan(before.length);
  await expect(timeRadio(dialog, "3:00 AM")).toHaveCount(0);
  await expect(timeRadio(dialog, "7:30 AM")).toHaveCount(0);

  // An untouched weekday still offers all its hours.
  await dialog.getByLabel("Day", { exact: true }).fill(OTHER_DAY);
  const other = await openTimes(dialog, OTHER_DAY, ZONE);
  expect(other).toHaveLength(16);
  expect(
    new Set(other.map((time) => localDayIn(CALENDAR_ZONE, time.start))),
  ).toEqual(new Set(["2026-09-09"]));
});
