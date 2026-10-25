import { describe, expect, it } from "vitest";

import { timeZoneOptions, zoneLabel } from "./time-zones";

describe("timeZoneOptions()", () => {
  it("lists the runtime's zones, the stored one among them", () => {
    const zones = timeZoneOptions("America/Los_Angeles");
    expect(zones).toEqual(Intl.supportedValuesOf("timeZone"));
    expect(zones).toContain("Asia/Singapore");
  });

  it("adds a stored zone the list lacks, in order, and nothing for an empty one", () => {
    const known = Intl.supportedValuesOf("timeZone");
    const zones = timeZoneOptions("Etc/Unlisted");
    expect(zones).toHaveLength(known.length + 1);
    expect(zones).toContain("Etc/Unlisted");
    expect(zones).toEqual([...zones].sort((a, b) => a.localeCompare(b)));
    expect(timeZoneOptions("")).toEqual(known);
  });
});

describe("zoneLabel()", () => {
  it("reads underscores as spaces", () => {
    expect(zoneLabel("America/Los_Angeles")).toBe("America/Los Angeles");
    expect(zoneLabel("Asia/Singapore")).toBe("Asia/Singapore");
  });
});
