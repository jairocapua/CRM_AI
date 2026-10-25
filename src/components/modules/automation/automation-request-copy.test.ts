import { describe, expect, it } from "vitest";

import type { AutomationRequestStatus } from "@/types";

import {
  PRIORITIES,
  PRIORITY_LABELS,
  askerName,
  requestStatusLabel,
} from "./automation-request-copy";

describe("requestStatusLabel()", () => {
  it.each([
    ["requested", "Requested"],
    ["in_review", "In review"],
    ["shipped", "Shipped"],
    ["declined", "Declined"],
    ["withdrawn", "Withdrawn"],
  ] as const)("calls %s %s", (status, label) => {
    expect(requestStatusLabel(status)).toBe(label);
  });

  it("throws rather than show a status it has no words for", () => {
    expect(() =>
      requestStatusLabel("building" as AutomationRequestStatus),
    ).toThrow('No label for request status "building"');
  });
});

describe("priorities", () => {
  it("are offered lowest first, each with a label", () => {
    expect(PRIORITIES).toEqual(["low", "normal", "high"]);
    expect(PRIORITIES.map((p) => PRIORITY_LABELS[p])).toEqual([
      "Low",
      "Normal",
      "High",
    ]);
  });
});

describe("askerName()", () => {
  const users = new Map([
    ["usr_priya", { firstName: "Priya", lastName: "Nair" }],
  ]);

  it("names the teammate who asked", () => {
    expect(askerName("usr_priya", users)).toBe("Priya Nair");
  });

  it("never shows an id for a teammate who is gone or unknown", () => {
    expect(askerName("usr_gone", users)).toBe("Unknown teammate");
    expect(askerName(undefined, users)).toBe("Unknown teammate");
  });
});
