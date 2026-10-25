# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.
> Since 2026-10-25 the build may also run from Hermes Agent, which has no `Workflow` tool: the orchestrator follows `.claude/workflows/build-phase.js` step by step with helper agents (implementer, then verifier + reviewer in parallel, up to 2 fix rounds) and does the recorder steps itself.

## Now
- **Phase:** P7 Calendars — **gate passed** on 2026-10-25 (re-run after the 2026-10-24 failure); phase `done`.
- **Branch:** `phase/p7-calendars`. GitHub `master` already holds it up to `6f04958` (PR #1); the commits after that (P7-T64 and this gate record) still need merging.
- **Status:** waiting on the owner to do the human check and merge. Next phase: P8 Automation (branch `phase/p8-automation`, cut from `master` after the merge).

## Last change
- Gate verify: `npm run check` green (799 Vitest), `npm run e2e` 146 passed (no flakes), `@tanstack/react-table` 8.21.3, tracker OK. Exit criteria 1–4 proven by `calendars-booking.spec.ts:139`, `calendars.spec.ts:26`, `smoke.spec.ts` + the console-watching fixture.
- Gate review: no must-fix; every earlier gate finding (P7-T57..T64) confirmed resolved in code. Four non-blocking suggestions went to `docs/BACKLOG.md`.

## Next up
- After the merge: "Autopilot: continue the build per CLAUDE.md" starts P8 (`node scripts/progress.mjs next --phase P8`).

## Waiting on you (owner)
- Human check: open `/calendars?view=week&date=2026-09-08` from your timezone — times in local time, zone label right, "now" line at the right time, overlapping appointments side by side (LA business hours land around midnight–08:00 in Asia; expected).
- Merge P7 into `master`. Locally: `git switch master && git pull && git merge --no-ff phase/p7-calendars`. Or, since you used GitHub before: push the branch and open a second PR.

## Open suggestions (non-blocking)
- P7-T63: partial save if `setStatus()` fails after `update()` wrote the reason (only a concurrent delete's 404 can cause it).
- P7-T60: statusBadge() locator is fragile; pickOpenSalesDeal should exclude isLost stages.
- P7-T59: test create() with a missing stageId; map a `pipelineId` 422 onto the Pipeline field.
- Gate review items are in `docs/BACKLOG.md` (doc-comment tidy, creation wording, move() stage check, create-then-setStatus e2e).

## Blockers
- None.
