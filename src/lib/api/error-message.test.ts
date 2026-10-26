import { describe, expect, it } from "vitest";

import { errorMessage } from "./error-message";
import { ApiError } from "./http";

describe("errorMessage", () => {
  it("shows an ApiError's own sentence", () => {
    const error = new ApiError(
      "Network request failed. Please try again.",
      503,
    );
    expect(errorMessage(error, "Could not save.")).toBe(
      "Network request failed. Please try again.",
    );
  });

  it("falls back for anything else thrown", () => {
    expect(
      errorMessage(new TypeError("x is undefined"), "Could not save."),
    ).toBe("Could not save.");
    expect(errorMessage("boom", "Could not save.")).toBe("Could not save.");
  });
});
