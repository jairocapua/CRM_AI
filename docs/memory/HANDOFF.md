# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`, gate failed; fix tasks in progress)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T60 in review.

## Last change
- P7-T60: new `e2e/deal-pipeline-move.spec.ts` (2 tests) drives the Edit deal sheet across pipelines.
- Test A: Sales -> Client Onboarding / Kickoff Call, Lost "Budget cut"; checks store, detail rows, Lost badge, timeline, both boards (Show lost).
- Test B: -> Renewals / Renewed defaults Status to Won; explicit Open wins (stored open, closedAt null).
- `e2e/calendar-helpers.ts` gains readDeal/readPipelines; both tests seen red on mutations; check + e2e (142) green.

## Next up
- P7-T61, then P7-T62 (won/lost status on update/create), then rerun the P7 gate.

## Waiting on you
- Review of P7-T60 (approve or rework).

## Open suggestions (non-blocking review notes)
- P7-T60: statusBadge() locator is layout-fragile (use data-slot/role); pickOpenSalesDeal exclude isLost stages; Test B assert stage reset to Renewals' first stage; move db readers to `e2e/db-helpers.ts`.
- P7-T59: keep `const stage = stageOf(...)` in create(); single message; test create() missing stageId; map `pipelineId` 422 onto Pipeline field.
- P7-T58: shared `stageChangedActivity()` helper; column position gaps; `rejects.toMatchObject`.
- P7-T57: routeHeading doc wording; off-nav routes table; 'Demo Data' casing.
- P7-T56: name the two 409 strings; e2e assert old text count 0. P7-T55: comment double rAF. P7-T54: toBeChecked()/toHaveValue. P7-T53: ref to ComboboxChipsInput.
- Pre-existing React Compiler lint warnings (3): data-table.tsx:55, contact-form-sheet.tsx:183, opportunity-form-sheet.tsx:145.

## Blockers
- None.
