import type { Locator, Page } from "@playwright/test";

import {
  expectPosition,
  expectViewLoaded,
  localDayIn,
  longDayLabel,
  readSeededAppointments,
  viewRegion,
  type SeededAppointment,
} from "./calendar-helpers";
import { expect, test } from "./fixtures";

/**
 * The month view: a weeks-by-days grid of September 2026 (30 August to 3
 * October), each appointment a chip on the viewer's local day, "+N more" on a
 * crowded day, and a way into day view.
 *
 * Checked against an oracle the UI does not share: the persisted database,
 * bucketed by `Intl.DateTimeFormat` in the test's own zone.
 *
 * The seed books every appointment in Los Angeles business hours (16:00 to
 * 22:45 UTC; every seeded calendar is in America/Los_Angeles), so a viewer in
 * Los Angeles sees the UTC day and a viewer in Singapore the next one. One
 * zone could not tell local days from UTC days (or from the calendar's), so
 * the placement check runs in three, each asserting how many appointments its
 * zone moves off their UTC day: Singapore all, Kolkata (UTC+5:30) only those
 * from 18:30 UTC on, Los Angeles none. Bucketing by UTC, by the calendar's
 * zone or by any one fixed offset fails at least one of them.
 */

const MONTH_URL = "/calendars?view=month&date=2026-09-08";
const GRID_FIRST = "2026-08-30";
const GRID_LAST = "2026-10-03";

test.use({ locale: "en-US" });

/** Appointments per local day in `zone`, over the September grid only. */
function oracle(rows: readonly SeededAppointment[], zone: string) {
  const byDay = new Map<string, number>();
  for (const row of rows) {
    const day = localDayIn(zone, row.startAt);
    if (day < GRID_FIRST || day > GRID_LAST) continue;
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }
  return byDay;
}

/** What each `[data-day]` cell shows: chips plus the N of "+N more". */
async function cellCounts(cells: Locator): Promise<Record<string, number>> {
  const pairs = await cells.evaluateAll((elements) =>
    elements.map((cell) => {
      const chips = cell.querySelectorAll("li").length;
      const more = cell.querySelector('button[aria-label$=" more"]');
      const extra = more
        ? Number(
            /^\+(\d+) more$/.exec(more.getAttribute("aria-label") ?? "")?.[1],
          )
        : 0;
      return [cell.getAttribute("data-day") ?? "", chips + extra] as const;
    }),
  );
  return Object.fromEntries(pairs);
}

async function openSeptember(page: Page) {
  await expectPosition(page, "Month", "September 2026");
  await expectViewLoaded(page, "Month");
}

/** How many in-grid appointments each zone moves off their UTC day. */
const ZONES = [
  { zone: "Asia/Singapore", moved: "all" },
  { zone: "Asia/Kolkata", moved: "some" },
  { zone: "America/Los_Angeles", moved: "none" },
] as const;

for (const { zone, moved } of ZONES) {
  test.describe(`viewed from ${zone}`, () => {
    test.use({ timezoneId: zone });

    test("places every seeded appointment on its local day", async ({
      page,
      gotoApp,
    }) => {
      await gotoApp(MONTH_URL);
      await openSeptember(page);

      const cells = viewRegion(page, "Month").locator("[data-day]");
      await expect(cells).toHaveCount(35);
      await expect(cells.first()).toHaveAttribute("data-day", GRID_FIRST);
      await expect(cells.last()).toHaveAttribute("data-day", GRID_LAST);

      const rows = await readSeededAppointments(page);
      const expected = oracle(rows, zone);
      const shown = await cellCounts(cells);

      // What this zone proves, so no run passes vacuously (see above).
      const inGrid = rows.filter((row) => {
        const day = localDayIn(zone, row.startAt);
        return day >= GRID_FIRST && day <= GRID_LAST;
      });
      const offUtc = inGrid.filter(
        (row) =>
          localDayIn(zone, row.startAt) !== localDayIn("UTC", row.startAt),
      ).length;
      if (moved === "all") expect(offUtc).toBe(inGrid.length);
      if (moved === "some") {
        expect(offUtc).toBeGreaterThan(0);
        expect(offUtc).toBeLessThan(inGrid.length);
      }
      if (moved === "none") expect(offUtc).toBe(0);

      const days = Object.keys(shown);
      expect(days).toHaveLength(35);

      // Every cell, empty ones included, matches the oracle exactly.
      expect(shown).toEqual(
        Object.fromEntries(days.map((day) => [day, expected.get(day) ?? 0])),
      );
      const total = [...expected.values()].reduce((sum, n) => sum + n, 0);
      expect(total).toBeGreaterThan(0);
      if (zone === "Asia/Singapore") {
        // The seed's recorded count for this grid (docs/memory/LEARNINGS.md,
        // P7-T04): a tripwire, so a seed change is noticed here first.
        expect(total).toBe(58);
      }
    });
  });
}

test.describe("the September grid from Asia/Singapore", () => {
  test.use({ timezoneId: "Asia/Singapore" });

  test("an evening-UTC appointment lands on the next local day", async ({
    page,
    gotoApp,
  }) => {
    await gotoApp(MONTH_URL);
    await openSeptember(page);
    const grid = viewRegion(page, "Month");

    // 2026-09-08T17:00Z, the first in the dashboard's Upcoming card, is
    // 1:00 AM on 9 September in Singapore (and 8 September in UTC).
    const sep9 = grid.getByRole("group", {
      name: "Wednesday, September 9, 2026",
      exact: true,
    });
    await expect(
      sep9.getByRole("listitem").filter({ hasText: "1:00 AM" }),
    ).toHaveCount(1);
    const sep8 = grid.getByRole("group", {
      name: "Tuesday, September 8, 2026",
      exact: true,
    });
    await expect(sep8).toHaveAttribute("aria-current", "date");
    await expect(
      sep8.getByRole("listitem").filter({ hasText: "1:00 AM" }),
    ).toHaveCount(0);
  });

  test("a crowded day shows +N more and opens the day view", async ({
    page,
    gotoApp,
  }) => {
    await gotoApp(MONTH_URL);
    await openSeptember(page);
    const grid = viewRegion(page, "Month");

    const counts = [
      ...oracle(await readSeededAppointments(page), "Asia/Singapore"),
    ].sort((a, b) => b[1] - a[1]);
    const [busiest, busiestCount] = counts[0] ?? ["", 0];
    // Never vacuous: a seed with no crowded day fails here, loudly.
    expect(busiestCount).toBeGreaterThan(3);

    const crowded = grid.getByRole("group", {
      name: longDayLabel(busiest),
      exact: true,
    });
    await expect(crowded).toHaveAttribute("data-day", busiest);
    await expect(crowded.getByRole("listitem")).toHaveCount(2);
    const more = crowded.getByRole("button", {
      name: `+${busiestCount - 2} more`,
      exact: true,
    });
    await expect(more).toBeVisible();

    // A day with three or fewer shows them all and no "+N more".
    const [quiet, quietCount] = counts.find(([, n]) => n <= 3) ?? ["", 0];
    expect(quietCount).toBeGreaterThan(0);
    const quietCell = grid.getByRole("group", {
      name: longDayLabel(quiet),
      exact: true,
    });
    await expect(quietCell.getByRole("listitem")).toHaveCount(quietCount);
    await expect(quietCell.getByRole("button", { name: /more$/ })).toHaveCount(
      0,
    );

    // "+N more" opens that day in day view, as a history entry.
    await more.click();
    await expect(page).toHaveURL(
      new RegExp(`/calendars\\?view=day&date=${busiest}$`),
    );
    await expectPosition(page, "Day", longDayLabel(busiest));
    await expectViewLoaded(page, "Day");

    await page.goBack();
    await expect(page).toHaveURL(/\/calendars\?view=month&date=2026-09-08$/);
    await openSeptember(page);

    // So does the day number, on any day.
    await grid
      .getByRole("button", {
        name: "Open day view, Tuesday, September 15, 2026",
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(/\/calendars\?view=day&date=2026-09-15$/);
    await expectPosition(page, "Day", "Tuesday, September 15, 2026");
  });

  test("chips are coloured by calendar", async ({ page, gotoApp }) => {
    await gotoApp(MONTH_URL);
    await openSeptember(page);
    const chips = viewRegion(page, "Month").getByRole("listitem");

    // Each calendar's tint, from the database rather than hard-coded.
    const colors = new Map(
      (await readSeededAppointments(page)).map((row) => [
        row.calendarName,
        row.calendarColor,
      ]),
    );
    let checked = 0;
    for (const [name, color] of colors) {
      const chip = chips.filter({ hasText: name });
      if ((await chip.count()) === 0) continue;
      await expect(chip.first()).toHaveClass(
        new RegExp(`\\bbg-${color}-100\\b`),
      );
      checked++;
    }
    // At least two calendars, in two different colours, are on the grid.
    expect(checked).toBeGreaterThanOrEqual(2);
    expect(new Set(colors.values()).size).toBeGreaterThanOrEqual(2);
  });
});
