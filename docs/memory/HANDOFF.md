# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.
> Since 2026-10-25 the build may also run from Hermes Agent, which has no `Workflow` tool: the orchestrator follows `.claude/workflows/build-phase.js` step by step with helper agents (implementer, then verifier + reviewer in parallel, up to 2 fix rounds) and does the recorder steps itself.

## Now
- **Phase:** P7 Calendars (`active`, gate failed on 2026-10-24; fix tasks in progress)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T63 approved on Autopilot (verifier pass, reviewer no must-fix). P7-T64 added from its review.

## Last change
- P7-T63: the deal form sends `lostReason` in its single `create()`/`update()` write; the `moveDropsReason` → second `setStatus()` path is gone, so an edited reason on a lost deal saves with no timeline entry and a move into a lost stage logs exactly one Lost entry.
- `enterStage()` deletes `lostReason` whenever the deal does not end up lost, so `create()`, `move()` and `update()` agree with `setStatus()`.
- Tests: 5 Vitest cases in `opportunities.test.ts`, 2 new e2e cases + 1 extended in `e2e/deal-form.spec.ts` (`readDealActivities()` helper in `e2e/calendar-helpers.ts`).

## Next up
- P7-T64: Lost entry text and same-stage move status (from the P7-T63 review).
- Then rerun the P7 gate.

## Waiting on you (owner)
- Before merging P7: open `/calendars?view=week&date=2026-09-08` in your timezone and check times, zone label, now line, overlaps.

## Open suggestions (non-blocking)
- P7-T63: partial save if `setStatus()` fails after `update()` wrote the reason (only a concurrent delete's 404 can cause it).
- P7-T60: statusBadge() locator is fragile; pickOpenSalesDeal should exclude isLost stages.
- P7-T59: test create() with a missing stageId; map a `pipelineId` 422 onto the Pipeline field.

## Blockers
- None.
