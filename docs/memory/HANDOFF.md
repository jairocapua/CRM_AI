# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.
> Since 2026-10-25 the build may also run from Hermes Agent, which has no `Workflow` tool: the orchestrator follows `.claude/workflows/build-phase.js` step by step with helper agents (implementer, then verifier + reviewer in parallel, up to 2 fix rounds) and does the recorder steps itself.

## Now
- **Phase:** P7 Calendars (`active`, gate failed on 2026-10-24; all fix tasks now done)
- **Branch:** `phase/p7-calendars` (already merged to `master` on GitHub via PR #1 at `6f04958`; later commits need another PR)
- **Status:** P7-T64 approved on Autopilot (verifier pass, reviewer's only must-fix was the DECISIONS.md entry, added at record time).

## Last change
- P7-T64: `move()` within the deal's own stage is a pure reorder (keeps status, closedAt, lostReason, stageEnteredAt; logs nothing). Seeded lost/won deals in open stages no longer reopen on a same-column reorder.
- Lost-stage timeline entries now read `Moved "<deal>" to <stage> - <reason>` when the deal has a reason (move(), update()'s pipeline move, create()).
- 5 new Vitest cases in `opportunities.test.ts`; 6 of them go red without the fix.

## Next up
- Rerun the P7 gate (`run the gate for P7`).

## Waiting on you (owner)
- Before merging P7: open `/calendars?view=week&date=2026-09-08` in your timezone and check times, zone label, now line, overlaps.

## Open suggestions (non-blocking)
- P7-T64: `src/lib/api/opportunities.ts:357` doc line is 118 chars (Prettier won't wrap comments); no e2e drags a board card.
- P7-T63: partial save if `setStatus()` fails after `update()` wrote the reason (only a concurrent delete's 404 can cause it).
- P7-T60: statusBadge() locator is fragile; pickOpenSalesDeal should exclude isLost stages.
- P7-T59: test create() with a missing stageId; map a `pipelineId` 422 onto the Pipeline field.

## Blockers
- None.
