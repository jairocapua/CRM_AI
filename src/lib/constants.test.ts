import { describe, expect, it } from "vitest";

import { TAG_COLOR_LABELS, TAG_COLORS } from "./constants";

describe("TAG_COLOR_LABELS", () => {
  it("names every tag colour once", () => {
    expect(Object.keys(TAG_COLOR_LABELS).sort()).toEqual(
      [...TAG_COLORS].sort(),
    );
    expect(new Set(Object.values(TAG_COLOR_LABELS)).size).toBe(
      TAG_COLORS.length,
    );
  });
});
