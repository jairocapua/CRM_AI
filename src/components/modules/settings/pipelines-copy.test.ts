import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api";
import {
  isClosedStage,
  keepsStatusSentence,
  pipelineDeletionSentence,
  pipelineErrorField,
  stageDragAnnouncements,
  stageErrorField,
  stageMoveSentence,
  stageOutcome,
  stageRemovedDescription,
} from "./pipelines-copy";

describe("stageMoveSentence", () => {
  it("says how many deals move and where, or that none are in the stage", () => {
    expect(stageMoveSentence(0, "Contacted")).toBe(
      "No deals are in this stage.",
    );
    expect(stageMoveSentence(1, "Contacted")).toBe(
      "1 deal moves to Contacted.",
    );
    expect(stageMoveSentence(12, "New Lead")).toBe(
      "12 deals move to New Lead.",
    );
  });
});

describe("keepsStatusSentence", () => {
  it("is null when no moved deal is closed", () => {
    expect(keepsStatusSentence({ won: 0, lost: 0, abandoned: 0 })).toBeNull();
  });

  it("names the one closed status there is", () => {
    expect(keepsStatusSentence({ won: 3, lost: 0, abandoned: 0 })).toBe(
      "Won deals stay won.",
    );
    expect(keepsStatusSentence({ won: 0, lost: 1, abandoned: 0 })).toBe(
      "Lost deals stay lost.",
    );
    expect(keepsStatusSentence({ won: 0, lost: 0, abandoned: 2 })).toBe(
      "Abandoned deals stay abandoned.",
    );
  });

  it("lists several closed statuses", () => {
    expect(keepsStatusSentence({ won: 3, lost: 1, abandoned: 0 })).toBe(
      "Won and lost deals keep their status.",
    );
    expect(keepsStatusSentence({ won: 0, lost: 1, abandoned: 1 })).toBe(
      "Lost and abandoned deals keep their status.",
    );
    expect(keepsStatusSentence({ won: 1, lost: 1, abandoned: 1 })).toBe(
      "Won, lost and abandoned deals keep their status.",
    );
  });
});

describe("pipelineDeletionSentence", () => {
  it("says what goes with the deals, in the number they are", () => {
    expect(pipelineDeletionSentence(0)).toBe("It has no deals.");
    expect(pipelineDeletionSentence(1)).toBe(
      "1 deal is deleted with it, with its timeline entries; its tasks stay, detached from the deal.",
    );
    expect(pipelineDeletionSentence(46)).toBe(
      "46 deals are deleted with it, with their timeline entries; their tasks stay, detached from the deal.",
    );
  });
});

describe("stageRemovedDescription", () => {
  it("says where the deals went, only when some moved", () => {
    expect(stageRemovedDescription(0, "Contacted")).toBeUndefined();
    expect(stageRemovedDescription(1, "Contacted")).toBe(
      "1 deal moved to Contacted.",
    );
    expect(stageRemovedDescription(4, "Contacted")).toBe(
      "4 deals moved to Contacted.",
    );
  });
});

describe("stageOutcome", () => {
  it("is Won, Lost or nothing", () => {
    expect(stageOutcome({ isWon: true })).toBe("Won");
    expect(stageOutcome({ isLost: true })).toBe("Lost");
    expect(stageOutcome({ isWon: false, isLost: false })).toBeNull();
    expect(stageOutcome({})).toBeNull();
    expect(isClosedStage({ isLost: true })).toBe(true);
    expect(isClosedStage({ isWon: false })).toBe(false);
  });
});

describe("stageDragAnnouncements", () => {
  const say = stageDragAnnouncements([
    { id: "a", name: "New Lead" },
    { id: "b", name: "Contacted" },
    { id: "c", name: "Closed Won" },
  ]);

  it("names the stage and its position at each step", () => {
    expect(say.onDragStart({ active: { id: "b" } })).toBe(
      "Picked up Contacted, position 2 of 3.",
    );
    expect(say.onDragOver({ active: { id: "b" }, over: { id: "c" } })).toBe(
      "Contacted is over position 3 of 3.",
    );
    expect(say.onDragOver({ active: { id: "b" }, over: null })).toBe(
      "Contacted is not over a position.",
    );
    expect(say.onDragEnd({ active: { id: "b" }, over: { id: "a" } })).toBe(
      "Contacted dropped at position 1 of 3.",
    );
    expect(say.onDragEnd({ active: { id: "b" }, over: null })).toBe(
      "Contacted dropped; it stays at position 2 of 3.",
    );
    expect(say.onDragCancel({ active: { id: "b" } })).toBe(
      "Moving Contacted was cancelled; it stays at position 2 of 3.",
    );
  });
});

describe("pipelineErrorField / stageErrorField", () => {
  it("marks the input a refusal is about", () => {
    const on = (field?: string) => new ApiError("No.", 409, "X", field);
    expect(pipelineErrorField(on("name"))).toBe("name");
    expect(pipelineErrorField(on("stages"))).toBeNull();
    expect(pipelineErrorField(on())).toBeNull();
    expect(stageErrorField(on("name"))).toBe("name");
    expect(stageErrorField(on("color"))).toBe("color");
    expect(stageErrorField(on("probability"))).toBe("probability");
    expect(stageErrorField(on("isWon"))).toBeNull();
    expect(stageErrorField(new Error("name"))).toBeNull();
  });
});
