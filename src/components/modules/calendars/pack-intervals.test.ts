import { describe, expect, it } from "vitest";

import { packIntervals } from "./pack-intervals";

/**
 * Side-by-side placement for a time grid: which column each interval takes
 * and how many columns its overlap group shares. Intervals are half-open,
 * [start, end), in minutes. Every expectation is a literal placement.
 */

const iv = (start: number, end: number) => ({ start, end });

describe("packIntervals", () => {
  it("no overlap: each interval has the full width", () => {
    expect(packIntervals([iv(540, 600), iv(660, 720)])).toEqual([
      { column: 0, columns: 1 },
      { column: 0, columns: 1 },
    ]);
  });

  it("two overlaps: side by side, half the width each", () => {
    expect(packIntervals([iv(540, 600), iv(570, 630)])).toEqual([
      { column: 0, columns: 2 },
      { column: 1, columns: 2 },
    ]);
  });

  it("a chain of three: the third reuses the first's freed column", () => {
    // A overlaps B, B overlaps C, A and C do not: two columns are enough,
    // and all three share that width because they form one overlap group.
    expect(packIntervals([iv(540, 600), iv(570, 630), iv(615, 660)])).toEqual([
      { column: 0, columns: 2 },
      { column: 1, columns: 2 },
      { column: 0, columns: 2 },
    ]);
  });

  it("back-to-back: touching is not overlapping, so both keep the full width", () => {
    // 09:00–10:00 then 10:00–11:00.
    expect(packIntervals([iv(540, 600), iv(600, 660)])).toEqual([
      { column: 0, columns: 1 },
      { column: 0, columns: 1 },
    ]);
  });

  it("back-to-back after an overlap: the next group starts at full width", () => {
    // The seed's Singapore 15 September: two at 00:00 (one 60, one 45
    // minutes), then one at 01:00, exactly when the longer ends.
    expect(packIntervals([iv(0, 60), iv(0, 45), iv(60, 90)])).toEqual([
      { column: 0, columns: 2 },
      { column: 1, columns: 2 },
      { column: 0, columns: 1 },
    ]);
  });

  it("back-to-back inside a group: the next takes the column just freed", () => {
    // B ends at 00:45 while A runs to 01:00; C starts at 00:45, so it fits
    // under B rather than opening a third column.
    expect(packIntervals([iv(0, 60), iv(0, 45), iv(45, 90)])).toEqual([
      { column: 0, columns: 2 },
      { column: 1, columns: 2 },
      { column: 1, columns: 2 },
    ]);
  });

  it("equal starts: the longer takes the left column", () => {
    expect(packIntervals([iv(960, 1005), iv(960, 1020)])).toEqual([
      { column: 1, columns: 2 },
      { column: 0, columns: 2 },
    ]);
  });

  it("three mutual overlaps: three columns", () => {
    expect(packIntervals([iv(540, 660), iv(570, 630), iv(600, 690)])).toEqual([
      { column: 0, columns: 3 },
      { column: 1, columns: 3 },
      { column: 2, columns: 3 },
    ]);
  });

  it("separate groups get their own column counts", () => {
    expect(packIntervals([iv(540, 600), iv(570, 630), iv(700, 760)])).toEqual([
      { column: 0, columns: 2 },
      { column: 1, columns: 2 },
      { column: 0, columns: 1 },
    ]);
  });

  it("the input order does not move any interval", () => {
    const a = iv(540, 600);
    const b = iv(570, 630);
    const c = iv(615, 660);
    const d = iv(700, 760);
    // Placements come back in input order, so compare per interval.
    const [pc, pa, pd, pb] = packIntervals([c, a, d, b]);
    expect({ pa, pb, pc, pd }).toEqual({
      pa: { column: 0, columns: 2 },
      pb: { column: 1, columns: 2 },
      pc: { column: 0, columns: 2 },
      pd: { column: 0, columns: 1 },
    });
  });

  it("identical intervals take columns in input order", () => {
    // The workspace lists live appointments before cancelled ones, so a live
    // booking sharing a cancelled one's exact slot is drawn leftmost.
    const live = iv(540, 600);
    const cancelled = iv(540, 600);
    expect(packIntervals([live, cancelled])).toEqual([
      { column: 0, columns: 2 },
      { column: 1, columns: 2 },
    ]);
    expect(packIntervals([cancelled, live])).toEqual([
      { column: 0, columns: 2 },
      { column: 1, columns: 2 },
    ]);
  });

  it("no intervals: no placements", () => {
    expect(packIntervals([])).toEqual([]);
  });
});
