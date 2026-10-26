import { describe, expect, it } from "vitest";

import type { Pipeline, PipelineStage } from "@/types";
import {
  selectedPipeline,
  shownPipelines,
  shownStages,
  storedOrderOf,
} from "./pipelines-view";

const stage = (id: string, position: number): PipelineStage => ({
  id,
  name: id.toUpperCase(),
  position,
  color: "slate",
  probability: 10,
});

const pipeline = (
  id: string,
  {
    updatedAt = "2026-01-01T00:00:00.000Z",
    isDefault = false,
    position = 0,
    stages = [stage("a", 0), stage("b", 1), stage("c", 2)],
    name = id,
  }: Partial<Pipeline> = {},
): Pipeline => ({
  id,
  name,
  position,
  isDefault,
  currency: "USD",
  stages,
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt,
});

describe("shownPipelines", () => {
  const listed = [
    pipeline("p1", { isDefault: true, name: "Sales" }),
    pipeline("p2", { position: 1, name: "Renewals" }),
  ];

  it("shows the newer of the listed copy and the saved one", () => {
    const newer = pipeline("p2", {
      position: 1,
      name: "Retention",
      updatedAt: "2026-02-01T00:00:00.000Z",
    });
    const older = pipeline("p1", {
      name: "Old",
      updatedAt: "2025-12-01T00:00:00.000Z",
    });
    const saved = new Map([
      ["p2", newer],
      ["p1", older],
    ]);
    expect(shownPipelines(listed, saved, new Set()).map((p) => p.name)).toEqual(
      ["Sales", "Retention"],
    );
  });

  it("adds a pipeline created since the list was read, last", () => {
    const created = pipeline("p3", { position: 2, name: "Partners" });
    expect(
      shownPipelines(listed, new Map([["p3", created]]), new Set()).map(
        (p) => p.id,
      ),
    ).toEqual(["p1", "p2", "p3"]);
  });

  it("drops a deleted pipeline at once, listed or saved", () => {
    const created = pipeline("p3", { position: 2 });
    expect(
      shownPipelines(
        listed,
        new Map([["p3", created]]),
        new Set(["p1", "p3"]),
      ).map((p) => p.id),
    ).toEqual(["p2"]);
    expect(shownPipelines(undefined, new Map(), new Set())).toEqual([]);
  });
});

describe("selectedPipeline", () => {
  const shown = [
    pipeline("p1"),
    pipeline("p2", { isDefault: true }),
    pipeline("p3"),
  ];

  it("is the one picked, else the default, else the first", () => {
    expect(selectedPipeline(shown, "p3")?.id).toBe("p3");
    expect(selectedPipeline(shown, "gone")?.id).toBe("p2");
    expect(selectedPipeline(shown, null)?.id).toBe("p2");
    expect(selectedPipeline([pipeline("p1"), pipeline("p3")], null)?.id).toBe(
      "p1",
    );
    expect(selectedPipeline([], null)).toBeUndefined();
  });
});

describe("shownStages", () => {
  const p = pipeline("p1", {
    stages: [stage("c", 2), stage("a", 0), stage("b", 1)],
  });

  it("lists the stages in board order without removed ones", () => {
    expect(shownStages(p, new Set(), null).map((s) => s.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(shownStages(p, new Set(["b"]), null).map((s) => s.id)).toEqual([
      "a",
      "c",
    ]);
    expect(storedOrderOf(p)).toBe("a,b,c");
    expect(shownStages(undefined, new Set(), null)).toEqual([]);
  });

  it("shows a picked order while the stored one is what it was picked over", () => {
    const picked = { pipelineId: "p1", ids: ["c", "a", "b"], over: "a,b,c" };
    expect(shownStages(p, new Set(), picked).map((s) => s.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
    // Read back: the stored order changed, so it shows.
    const stored = pipeline("p1", {
      stages: [stage("c", 0), stage("a", 1), stage("b", 2)],
    });
    expect(shownStages(stored, new Set(), picked).map((s) => s.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
    const otherOrder = pipeline("p1", {
      stages: [stage("b", 0), stage("a", 1), stage("c", 2)],
    });
    expect(shownStages(otherOrder, new Set(), picked).map((s) => s.id)).toEqual(
      ["b", "a", "c"],
    );
    // Another pipeline's pick never applies.
    expect(
      shownStages(p, new Set(), { ...picked, pipelineId: "p2" }).map(
        (s) => s.id,
      ),
    ).toEqual(["a", "b", "c"]);
  });
});
