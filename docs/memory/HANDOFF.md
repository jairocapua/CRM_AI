# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`, gate failed on 2026-10-24; fix tasks in progress)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T55–T60 approved (Autopilot review, 2026-10-24). P7-T60 was approved with `progress.mjs set`, so no task is running. Session handed off after 6 approvals, per CLAUDE.md.

## Last changes (this session)
- P7-T55/T56: TagPicker Retry focus flag; ended+cancelled 409 rewording.
- P7 gate (d7a972c) failed on two gaps, both now fixed: P7-T57 smoke-tests `/settings/demo-data`; P7-T58 makes `update({ pipelineId })` require a `stageId` from the new pipeline (single write + `stage_changed` activity).
- P7-T59: create() checks pipeline and stage via the shared `stageOf()` helper.
- P7-T60: `e2e/deal-pipeline-move.spec.ts` drives the Edit deal sheet across pipelines.

## Next up
- **P7-T61:** update()'s pipeline move into a won/lost stage must derive status/closedAt and the won/lost activity like move(); share one stage-change helper with move().
- **P7-T62** (depends on T61): the same for create(); acceptance is written in the phase file. It supersedes the P7-T59 DECISIONS line "create() still stores status 'open'"; update that line and create()'s doc comment.
- Then rerun the P7 gate: `Workflow({ name: 'build-phase', args: { gate: 'P7' } })`.
- Check after T61: P7-T60 Test B (won stage, explicit Open) must stay green. The form's `statusAfterMove` reads `record.status`, so it should still call setStatus(open).

## Waiting on you (owner)
- Before merging P7: open `/calendars?view=week&date=2026-09-08` in your own timezone and check appointment times, the zone label, the now line and overlaps (the gate's one human check).

## Open suggestions (non-blocking; most are in docs/BACKLOG.md)
- P7-T60: statusBadge() locator is layout-fragile (use data-slot/role); pickOpenSalesDeal should also exclude isLost stages; Test B could assert the stage reset; move the db readers to `e2e/db-helpers.ts`.
- P7-T59: keep `const stage = stageOf(...)` in create(); one stage message; test create() with a missing stageId; map a `pipelineId` 422 onto the Pipeline field.
- P7-T58: shared `stageChangedActivity()` helper (fold into T61); column position gaps; `rejects.toMatchObject`.
- Pre-existing React Compiler lint warnings (3): data-table.tsx:55, contact-form-sheet.tsx:183, opportunity-form-sheet.tsx:145.

## Blockers
- None.
