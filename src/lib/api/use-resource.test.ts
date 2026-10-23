import { describe, expect, it } from "vitest";

import { ApiError } from "./http";
import { loadErrorOf } from "./use-resource";

describe("loadErrorOf", () => {
  const error = new ApiError("Something went wrong.", 500);

  it("gives the error when the read failed with no data loaded", () => {
    expect(loadErrorOf({ data: undefined, error })).toBe(error);
  });

  it("gives null when a refetch failed with data still loaded", () => {
    expect(loadErrorOf({ data: { rows: [] }, error })).toBeNull();
  });

  it("gives null while the first read is still loading", () => {
    expect(loadErrorOf({ data: undefined, error: null })).toBeNull();
  });

  it("gives null when the data loaded without an error", () => {
    expect(loadErrorOf({ data: { rows: [] }, error: null })).toBeNull();
  });

  // Tuples, because it.each spreads an array case into arguments.
  it.each<[unknown]>([[null], [0], [""], [[]], [false]])(
    "treats falsy but loaded data (%j) as loaded",
    (data) => {
      expect(loadErrorOf({ data, error })).toBeNull();
    },
  );
});
