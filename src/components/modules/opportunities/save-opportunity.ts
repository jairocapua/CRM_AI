import type { Opportunity, PipelineStage } from "@/types";
import type { OpportunityDraft } from "@/lib/api";
import type * as api from "@/lib/api";

/** The deal calls the form's save makes; `api.opportunities` in the app. */
export type DealSaveApi = Pick<
  typeof api.opportunities,
  "create" | "update" | "listForBoard" | "move" | "setStatus" | "stageStatus"
>;

export interface DealSaveInput {
  /** The deal being edited, or null for a new one. */
  opportunity: Opportunity | null;
  /** Every field but `status` (see below). */
  patch: OpportunityDraft;
  /** The status chosen in the form. */
  status: Opportunity["status"];
  lostReason: string | undefined;
  /** The stages of the pipeline chosen in the form. */
  stages: readonly PipelineStage[];
}

export type DealSaveResult =
  | { kind: "saved"; record: Opportunity }
  /**
   * `create()` stored the deal, then the status write after it failed. The
   * deal exists, so the form must not offer the same Save again: a second
   * press would create a duplicate.
   */
  | { kind: "createdWithoutStatus"; record: Opportunity; error: unknown };

/**
 * The deal form's save (P10-T02 extracted it to test the partial failure).
 *
 * `status` is not in the patch: `setStatus()` owns it, with `closedAt` and
 * the won/lost activity, so a status change goes through it below.
 * `update()` reads `stageId` only when the pipeline changes: it then moves
 * the deal to that stage of the new pipeline in the same write, with the
 * status that stage gives (as `move()` does). `create()` also takes the
 * status from the new deal's stage. A stage change inside the same pipeline
 * goes through `move()`, which owns column `position` and `stageEnteredAt`
 * there. Each keeps `lostReason` only when it leaves the deal in a lost
 * stage.
 *
 * Throws when the first write (`create()`/`update()`) fails, or when a later
 * write of an edit fails (saving the edit again repeats it harmlessly). A
 * new deal whose status write fails resolves `createdWithoutStatus`.
 */
export async function saveOpportunity(
  deals: DealSaveApi,
  { opportunity, patch, status, lostReason, stages }: DealSaveInput,
): Promise<DealSaveResult> {
  const record = opportunity
    ? await deals.update(opportunity.id, patch)
    : await deals.create(patch);

  try {
    const pipelineChanged =
      opportunity && opportunity.pipelineId !== patch.pipelineId;
    const stageChanged =
      opportunity && !pipelineChanged && opportunity.stageId !== patch.stageId;
    if (stageChanged) {
      const column = await deals.listForBoard(patch.pipelineId);
      const appendAt = column.filter((d) => d.stageId === patch.stageId).length;
      await deals.move(record.id, {
        stageId: patch.stageId,
        position: appendAt,
      });
    }

    // `create()`, `move()` and `update()`'s pipeline move all derive the
    // status from the destination stage: `record.status` is what `create()`
    // or the pipeline move left, and `stageStatus()` predicts what `move()`
    // leaves. An explicit choice is applied after any of them and wins, so a
    // new deal in a Won stage saved as Open is reopened here.
    const statusAfterMove = stageChanged
      ? deals.stageStatus(stages.find((s) => s.id === patch.stageId))
      : (record.status ?? "open");
    // Only a status the save did not already leave needs `setStatus()`: the
    // reason is already stored, so calling it for the reason alone would log
    // a second Lost entry.
    if (status !== statusAfterMove) {
      await deals.setStatus(record.id, status, lostReason);
    }
  } catch (error) {
    if (opportunity) throw error;
    return { kind: "createdWithoutStatus", record, error };
  }
  return { kind: "saved", record };
}
