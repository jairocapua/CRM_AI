# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`, gate failed on 2026-10-24; fix tasks in progress)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T61 in review.

## Last change
- P7-T61: update()'s pipeline move now derives status, closedAt and the won/lost/stage_changed entry from the target stage, through helpers shared with move() (`stageStatus` exported, `enterStage`, `stageEntryActivity`).
- move() now deletes closedAt on an open stage instead of storing undefined.
- Deal form uses `api.opportunities.stageStatus` (lost stages predicted too) and adds a `moveDropsReason` guard. The e2e Test B now expects `Won` then `Reopened`.
- New task P7-T63: deal form keeps a changed lost reason.

## Next up
- **P7-T62** (depends on T61): same derivation for create(). Supersede the P7-T59 DECISIONS line and remove create()'s "until P7-T62" doc note.
- Then P7-T63, then rerun the P7 gate: `Workflow({ name: 'build-phase', args: { gate: 'P7' } })`.

## Waiting on you (owner)
- Review of P7-T61 (Autopilot reviews it).
- Before merging P7: open `/calendars?view=week&date=2026-09-08` in your own timezone and check appointment times, zone label, now line and overlaps.

## Open suggestions (non-blocking)
- P7-T61: `moveDropsReason` is untested and logs a second Lost entry (P7-T63 should fix both); `enterStage` keeps a stale `lostReason` on an open stage (setStatus clears it); `stageEntryActivity` could reuse the status from `enterStage`.
- P7-T60: statusBadge() locator is layout-fragile; pickOpenSalesDeal should exclude isLost stages; move db readers to `e2e/db-helpers.ts`.
- P7-T59: test create() with a missing stageId; map a `pipelineId` 422 onto the Pipeline field.
- Pre-existing React Compiler lint warnings (3): data-table.tsx, contact-form-sheet.tsx, opportunity-form-sheet.tsx.

## Blockers
- None.
