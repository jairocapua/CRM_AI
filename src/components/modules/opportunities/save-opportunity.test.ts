/**
 * The deal form's save (P10-T02): a new deal whose status write fails after
 * `create()` stored it resolves `createdWithoutStatus` instead of throwing,
 * so the form closes and a second Save cannot create a duplicate. Every
 * other failure still throws, keeping the sheet open.
 */
import { describe, expect, it, vi } from "vitest";

import type { Opportunity, PipelineStage } from "@/types";
import type { OpportunityDraft } from "@/lib/api";
import { ApiError } from "@/lib/api/http";

import { saveOpportunity, type DealSaveApi } from "./save-opportunity";

const STAGES: PipelineStage[] = [
  { id: "s-new", name: "New", probability: 10, position: 0 },
  { id: "s-won", name: "Won", probability: 100, position: 1, isWon: true },
] as PipelineStage[];

const PATCH = {
  name: "Audit deal",
  contactId: "c-1",
  pipelineId: "p-1",
  stageId: "s-new",
} as OpportunityDraft;

const STORED = {
  id: "o-1",
  pipelineId: "p-1",
  stageId: "s-new",
  status: "open",
} as Opportunity;

const failure = () =>
  new ApiError("Network request failed. Please try again.", 503);

function fakeDeals(overrides: Partial<DealSaveApi> = {}) {
  return {
    create: vi.fn<DealSaveApi["create"]>(async () => STORED),
    update: vi.fn<DealSaveApi["update"]>(async () => STORED),
    listForBoard: vi.fn<DealSaveApi["listForBoard"]>(async () => []),
    move: vi.fn<DealSaveApi["move"]>(async () => STORED),
    setStatus: vi.fn<DealSaveApi["setStatus"]>(async () => STORED),
    stageStatus: vi.fn<DealSaveApi["stageStatus"]>((stage) =>
      stage?.isWon ? "won" : "open",
    ),
    ...overrides,
  };
}

describe("saveOpportunity", () => {
  it("reports a new deal whose status write failed as created, not failed", async () => {
    const error = failure();
    const deals = fakeDeals({
      setStatus: vi.fn<DealSaveApi["setStatus"]>(async () => {
        throw error;
      }),
    });
    const result = await saveOpportunity(deals, {
      opportunity: null,
      patch: PATCH,
      status: "lost",
      lostReason: "Budget",
      stages: STAGES,
    });
    expect(result).toEqual({
      kind: "createdWithoutStatus",
      record: STORED,
      error,
    });
    expect(deals.create).toHaveBeenCalledTimes(1);
    expect(deals.setStatus).toHaveBeenCalledWith("o-1", "lost", "Budget");
  });

  it("saves a new deal with its chosen status", async () => {
    const deals = fakeDeals();
    const result = await saveOpportunity(deals, {
      opportunity: null,
      patch: PATCH,
      status: "lost",
      lostReason: undefined,
      stages: STAGES,
    });
    expect(result).toEqual({ kind: "saved", record: STORED });
    expect(deals.setStatus).toHaveBeenCalledTimes(1);
  });

  it("skips setStatus when the stage already gave the chosen status", async () => {
    const deals = fakeDeals();
    await saveOpportunity(deals, {
      opportunity: null,
      patch: PATCH,
      status: "open",
      lostReason: undefined,
      stages: STAGES,
    });
    expect(deals.setStatus).not.toHaveBeenCalled();
  });

  it("throws when create() itself fails, so the sheet stays open", async () => {
    const error = failure();
    const deals = fakeDeals({
      create: vi.fn<DealSaveApi["create"]>(async () => {
        throw error;
      }),
    });
    await expect(
      saveOpportunity(deals, {
        opportunity: null,
        patch: PATCH,
        status: "lost",
        lostReason: undefined,
        stages: STAGES,
      }),
    ).rejects.toBe(error);
    expect(deals.setStatus).not.toHaveBeenCalled();
  });

  it("throws when an edit's stage move fails: saving again repeats it harmlessly", async () => {
    const error = failure();
    const deals = fakeDeals({
      move: vi.fn<DealSaveApi["move"]>(async () => {
        throw error;
      }),
    });
    await expect(
      saveOpportunity(deals, {
        opportunity: STORED,
        patch: { ...PATCH, stageId: "s-won" },
        status: "won",
        lostReason: undefined,
        stages: STAGES,
      }),
    ).rejects.toBe(error);
    expect(deals.update).toHaveBeenCalledTimes(1);
    expect(deals.create).not.toHaveBeenCalled();
  });
});
