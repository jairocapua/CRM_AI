# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`, gate failed; fix tasks in progress)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T58 in review.

## Last change
- P7-T58: opportunities.update() refuses a pipelineId change without a stageId from the new pipeline (422 INVALID_OPPORTUNITY).
- A valid pipeline move is one write (stage, position, stageEnteredAt) plus an `opportunity.stage_changed` timeline entry.
- Deal form sends stageId in the patch; calls move() only for same-pipeline stage changes.
- New Vitest (red before the fix via integrityReport()); `npm run check` green, e2e 140 passed.

## Next up
- P7-T59: create() accepts stageId outside its pipeline. P7-T60: e2e for changing pipeline in the Edit deal sheet.
- Then rerun the P7 gate.

## Waiting on you
- Review of P7-T58 (approve or rework).

## Open suggestions (non-blocking review notes)
- P7-T58: pipeline move into an isWon/isLost stage keeps old status (move() derives it); derive or refuse. Backlog.
- P7-T58: shared `stageChangedActivity()` helper for update()/move(); source-column position gaps (same as move()).
- P7-T58: test uses `.catch((e) => e)`; `rejects.toMatchObject` reads clearer.
- P7-T57: routeHeading doc comment wording; off-nav routes table; 'Demo Data' vs 'Demo data' casing.
- P7-T56: name the two 409 strings as constants; e2e assert old text count 0.
- P7-T55: comment why double rAF + 50 ms wait suffices.
- P7-T54: assert toBeChecked()/toHaveValue after fills.
- P7-T53: ref to ComboboxChipsInput instead of data-slot query.
- Pre-existing React Compiler lint warnings (3): data-table.tsx:55, contact-form-sheet.tsx:183, opportunity-form-sheet.tsx:145.

## Blockers
- None.
