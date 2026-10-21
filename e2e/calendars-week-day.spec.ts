import type { Page } from "@playwright/test";

import {
  dayList,
  expectPosition,
  expectViewLoaded,
  localDayIn,
  localTimeIn,
  readSeededAppointments,
  segmentsIn,
  viewRegion,
  type DaySegmentOracle,
  type ViewName,
} from "./calendar-helpers";
import { expect, test } from "./fixtures";

/**
 * The week and day views: a 24-hour grid per day, each appointment a block at
 * its wall-clock time in the viewer's zone, overlapping ones side by side, a
 * now line from the demo clock, and a scroll to the earliest appointment on
 * open.
 *
 * Checked against an oracle the UI does not share: the persisted database,
 * cut into local days and minutes by `Intl.DateTimeFormat` in the test's own
 * zone. Positions are read from the DOM as boxes: a block's top must sit at
 * its start minute's share of the day column's height.
 *
 * The seed books every appointment in Los Angeles business hours (16:00 to
 * 22:45 UTC), so the three zones prove different things: Singapore moves
 * every appointment off its UTC day, Kolkata (UTC+5:30) has half-hour offsets
 * and one appointment that crosses local midnight (23:45 to 00:30 on 7–8
 * September), and Los Angeles keeps the UTC day. Placing blocks by UTC hours,
 * by the calendar's zone or by any one fixed offset fails at least one.
 */

test.use({ locale: "en-US" });

const WEEK_URL = "/calendars?view=week&date=2026-09-08";
const WEEK_LABEL = "Sep 6 – 12, 2026";
const WEEK_DAYS = dayList("2026-09-06", "2026-09-12");
const MINUTES_PER_DAY = 24 * 60;

interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

interface ColumnGeometry extends Box {
  day: string;
  blocks: (Box & { id: string; text: string })[];
}

/** Every day column's box and the boxes of the blocks inside it. */
async function readColumns(page: Page, view: ViewName) {
  return viewRegion(page, view)
    .locator("[data-day]")
    .evaluateAll((columns) => {
      const box = (el: Element) => {
        const r = el.getBoundingClientRect();
        return {
          top: r.top,
          bottom: r.bottom,
          left: r.left,
          right: r.right,
          width: r.width,
          height: r.height,
        };
      };
      return columns.map((column) => ({
        day: column.getAttribute("data-day") ?? "",
        ...box(column),
        blocks: [...column.querySelectorAll("[data-appointment-id]")].map(
          (block) => ({
            id: block.getAttribute("data-appointment-id") ?? "",
            text: block.textContent ?? "",
            ...box(block),
          }),
        ),
      }));
    }) as Promise<ColumnGeometry[]>;
}

/** Where a minute of the day sits in a column whose box starts at `top`. */
const expectedTop = (top: number, height: number, minutes: number) =>
  top + (minutes / MINUTES_PER_DAY) * height;

function block(column: ColumnGeometry, id: string) {
  const found = column.blocks.find((b) => b.id === id);
  if (!found) throw new Error(`No block ${id} on ${column.day}`);
  return found;
}

/**
 * The segments whose block is not at its start minute (within a pixel), as
 * readable records: empty when every block is placed right.
 */
function misplaced(
  columns: readonly ColumnGeometry[],
  segments: readonly DaySegmentOracle[],
) {
  return segments.flatMap((segment) => {
    const column = columns.find((c) => c.day === segment.day);
    if (!column) throw new Error(`No column ${segment.day}`);
    const top = block(column, segment.row.id).top - column.top;
    const want = expectedTop(0, column.height, segment.start);
    return Math.abs(top - want) <= 1
      ? []
      : [{ day: segment.day, id: segment.row.id, top, want }];
  });
}

/** How each zone's segments relate to UTC days and midnight. */
const ZONES = [
  { zone: "Asia/Singapore", proves: "every appointment off its UTC day" },
  { zone: "Asia/Kolkata", proves: "one appointment cut at local midnight" },
  { zone: "America/Los_Angeles", proves: "the UTC day, nothing cut" },
] as const;

for (const { zone, proves } of ZONES) {
  test.describe(`week view from ${zone}`, () => {
    test.use({ timezoneId: zone });

    test(`places every appointment at its local time (${proves})`, async ({
      page,
      gotoApp,
    }) => {
      await gotoApp(WEEK_URL);
      await expectPosition(page, "Week", WEEK_LABEL);
      await expectViewLoaded(page, "Week");

      const rows = await readSeededAppointments(page);
      const segments = segmentsIn(zone, rows, WEEK_DAYS);
      const ids = new Set(segments.map((s) => s.row.id));
      expect(segments.length).toBeGreaterThan(0);

      // What this zone proves, so no run passes vacuously (see above).
      const cut = segments.length - ids.size;
      // Each appointment's first part, on its local start day.
      const firsts = segments.filter(
        (s) => s.day === localDayIn(zone, s.row.startAt),
      );
      expect(firsts).toHaveLength(ids.size);
      const offUtc = firsts.filter(
        (s) => s.day !== localDayIn("UTC", s.row.startAt),
      ).length;
      if (zone === "Asia/Singapore") {
        expect(offUtc).toBe(ids.size);
        expect(cut).toBe(0);
        // The seed's recorded count for this week (docs/memory/LEARNINGS.md,
        // P7-T04): a tripwire, so a seed change is noticed here first.
        expect(ids.size).toBe(11);
      }
      if (zone === "Asia/Kolkata") {
        expect(cut).toBe(1);
        expect(offUtc).toBeGreaterThan(0);
        expect(offUtc).toBeLessThan(ids.size);
      }
      if (zone === "America/Los_Angeles") {
        expect(offUtc).toBe(0);
        expect(cut).toBe(0);
      }

      const columns = await readColumns(page, "Week");
      expect(columns.map((c) => c.day)).toEqual(WEEK_DAYS);

      // Every column, empty ones included, has exactly the oracle's blocks.
      expect(
        Object.fromEntries(columns.map((c) => [c.day, c.blocks.length])),
      ).toEqual(
        Object.fromEntries(
          WEEK_DAYS.map((day) => [
            day,
            segments.filter((s) => s.day === day).length,
          ]),
        ),
      );

      for (const segment of segments) {
        const column = columns.find((c) => c.day === segment.day);
        if (!column) throw new Error(`No column ${segment.day}`);
        // Each part shows the appointment's real local start time, the
        // second half of a cut one included.
        expect(block(column, segment.row.id).text).toContain(
          localTimeIn(zone, segment.row.startAt),
        );
      }
      // And sits at its start minute, within a pixel.
      expect(misplaced(columns, segments)).toEqual([]);
    });
  });
}

test.describe("from Asia/Singapore", () => {
  test.use({ timezoneId: "Asia/Singapore" });

  test("day view sets overlapping appointments side by side", async ({
    page,
    gotoApp,
  }) => {
    const day = "2026-09-15";
    await gotoApp(`/calendars?view=day&date=${day}`);
    await expectPosition(page, "Day", "Tuesday, September 15, 2026");
    await expectViewLoaded(page, "Day");

    const segments = segmentsIn(
      "Asia/Singapore",
      await readSeededAppointments(page),
      [day],
    );
    const overlaps = segments.flatMap((a, i) =>
      segments
        .slice(i + 1)
        .filter((b) => a.start < b.end && b.start < a.end)
        .map((b) => [a, b] as const),
    );
    const touches = segments.flatMap((a) =>
      segments.filter((b) => a.end === b.start).map((b) => [a, b] as const),
    );
    // Never vacuous: one overlapping pair and one block that starts exactly
    // when one of that pair ends (the seed's 00:00, 00:00 and 01:00).
    expect(overlaps).toHaveLength(1);
    expect(touches).toHaveLength(1);
    const [[first, second]] = overlaps as [(typeof overlaps)[number]];
    const [[ending, next]] = touches as [(typeof touches)[number]];
    expect([first.row.id, second.row.id]).toContain(ending.row.id);
    // The next block overlaps nothing, so its group is one column wide.
    expect(
      segments.filter(
        (s) => s !== next && s.start < next.end && next.start < s.end,
      ),
    ).toHaveLength(0);

    const [column] = await readColumns(page, "Day");
    if (!column) throw new Error("No day column");
    expect(column.day).toBe(day);
    const a = block(column, first.row.id);
    const b = block(column, second.row.id);
    const after = block(column, next.row.id);
    const before = block(column, ending.row.id);

    // Side by side: same top, half the width each, not covering each other.
    expect(Math.abs(a.top - b.top)).toBeLessThanOrEqual(1);
    for (const half of [a, b]) {
      expect(half.width / column.width).toBeGreaterThan(0.45);
      expect(half.width / column.width).toBeLessThan(0.55);
    }
    const [left, right] = a.left <= b.left ? [a, b] : [b, a];
    expect(left.right).toBeLessThanOrEqual(right.left + 0.5);

    // Back to back: full width again, starting where the other ends.
    expect(after.width / column.width).toBeGreaterThanOrEqual(0.9);
    expect(Math.abs(after.top - before.bottom)).toBeLessThanOrEqual(1);
    expect(after.text).toContain(
      localTimeIn("Asia/Singapore", next.row.startAt),
    );
  });

  test("the now line follows the demo clock, not the wall clock", async ({
    page,
    gotoApp,
  }) => {
    // The wall clock says 11:00 on Thursday 10 September in Singapore; the
    // demo clock starts at the seed's anchor, 17:00 on Tuesday 8 September.
    await page.clock.setFixedTime(new Date("2026-09-10T03:00:00Z"));
    await gotoApp(WEEK_URL);
    await expectPosition(page, "Week", WEEK_LABEL);
    await expectViewLoaded(page, "Week");

    const lines = viewRegion(page, "Week").locator("[data-now-line]");
    await expect(lines).toHaveCount(1);
    const sep8 = viewRegion(page, "Week").locator('[data-day="2026-09-08"]');
    await expect(sep8.locator("[data-now-line]")).toHaveCount(1);
    await expect(sep8).toHaveAttribute("aria-current", "date");

    const [line, column] = await Promise.all([
      lines.boundingBox(),
      sep8.boundingBox(),
    ]);
    if (!line || !column) throw new Error("No box for the now line");
    const center = line.y + line.height / 2;
    expect(
      Math.abs(center - expectedTop(column.y, column.height, 17 * 60)),
    ).toBeLessThanOrEqual(2);

    // A day without the demo's today has no line.
    await page.getByRole("button", { name: "Next week", exact: true }).click();
    await expectPosition(page, "Week", "Sep 13 – 19, 2026");
    await expectViewLoaded(page, "Week");
    await expect(
      viewRegion(page, "Week").locator("[data-now-line]"),
    ).toHaveCount(0);
  });
});

/** The scroll container's box and offset, and one block's box in it. */
async function scrollState(page: Page, view: ViewName, id: string) {
  const region = viewRegion(page, view);
  const grid = region.getByRole("region", { name: /^Time grid/ });
  await expect(grid).toBeVisible();
  return grid.evaluate((scroller, blockId) => {
    const target = scroller.querySelector(
      `[data-appointment-id="${CSS.escape(blockId)}"]`,
    );
    const header = scroller.querySelector("[data-time-grid-header]");
    if (!target || !header) return null;
    const outer = scroller.getBoundingClientRect();
    const inner = target.getBoundingClientRect();
    return {
      scrollTop: scroller.scrollTop,
      // The sticky day header covers the top of the scroll box.
      visibleTop: header.getBoundingClientRect().bottom,
      visibleBottom: outer.bottom,
      blockTop: inner.top,
      blockBottom: inner.bottom,
    };
  }, id);
}

const SCROLL_CASES = [
  {
    name: "a Los Angeles week opens at its first morning appointment",
    zone: "America/Los_Angeles",
    view: "Week",
    url: WEEK_URL,
    days: WEEK_DAYS,
  },
  {
    // From Asia, Los Angeles hours fall after midnight: the opening view must
    // not be the empty working morning.
    name: "a Singapore day opens at its small-hours appointment",
    zone: "Asia/Singapore",
    view: "Day",
    url: "/calendars?view=day&date=2026-09-10",
    days: ["2026-09-10"],
  },
] as const;

for (const { name, zone, view, url, days } of SCROLL_CASES) {
  test.describe(`scroll from ${zone}`, () => {
    test.use({ timezoneId: zone });

    test(name, async ({ page, gotoApp }) => {
      await gotoApp(url);
      await expectViewLoaded(page, view);

      const segments = segmentsIn(
        zone,
        await readSeededAppointments(page),
        days,
      );
      expect(segments.length).toBeGreaterThan(0);
      const earliest = segments.reduce((min, s) =>
        s.start < min.start ? s : min,
      );
      // Not vacuous: an earliest start at midnight would need no scroll.
      expect(earliest.start).toBeGreaterThan(60);
      await expect(
        viewRegion(page, view).locator(
          `[data-appointment-id="${earliest.row.id}"]`,
        ),
      ).toContainText(localTimeIn(zone, earliest.row.startAt));

      await expect
        .poll(
          async () =>
            (await scrollState(page, view, earliest.row.id))?.scrollTop,
        )
        .toBeGreaterThan(0);
      const state = await scrollState(page, view, earliest.row.id);
      if (!state) throw new Error("No scroll state");
      // The earliest block is in the scroll box, below the sticky header.
      expect(state.blockTop).toBeGreaterThanOrEqual(state.visibleTop - 1);
      expect(state.blockBottom).toBeLessThanOrEqual(state.visibleBottom + 1);
    });
  });
}
