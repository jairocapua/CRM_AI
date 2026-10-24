# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`, gate failed; fix tasks in progress)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T59 in review.

## Last change
- P7-T59: opportunities.create() refuses an unknown pipelineId (422, field pipelineId) and a stageId outside its pipeline (422, field stageId).
- Shared private `stageOf()` helper now used by create() and update() (update() wording unchanged).
- Refused create writes nothing and does not move the demo clock; tests use a PIPELINE_FIXTURE.
- New Vitest red before the fix via integrityReport(); `npm run check` green (781 tests). No e2e (API-only).

## Next up
- P7-T60: e2e for changing pipeline in the Edit deal sheet. Then P7-T61, P7-T62 (won/lost status on update/create), then rerun the P7 gate.

## Waiting on you
- Review of P7-T59 (approve or rework).

## Open suggestions (non-blocking review notes)
- P7-T59: keep `const stage = stageOf(...)` in create(); maybe one message and drop stageMessage param; test create() with missing stageId (shape error first); check deal form maps a `pipelineId` 422 onto the Pipeline field.
- P7-T58: shared `stageChangedActivity()` helper; source-column position gaps; `rejects.toMatchObject` over `.catch((e) => e)`.
- P7-T57: routeHeading doc wording; off-nav routes table; 'Demo Data' casing.
- P7-T56: name the two 409 strings as constants; e2e assert old text count 0.
- P7-T55: comment why double rAF + 50 ms wait suffices. P7-T54: assert toBeChecked()/toHaveValue. P7-T53: ref to ComboboxChipsInput.
- Pre-existing React Compiler lint warnings (3): data-table.tsx:55, contact-form-sheet.tsx:183, opportunity-form-sheet.tsx:145.

## Blockers
- None.
