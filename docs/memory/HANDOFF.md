# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T25 approved (Autopilot review, 2026-10-23) with `progress.mjs set`, so no task is running; P7-T26 is next. The session stopped early on a usage limit.

## Last change
- contact-detail.tsx: non-404 load failure shows LoadError ('Could not load the contact', Retry) instead of an endless skeleton; 404 branch stays first.
- e2e/calendar-helpers.ts: armContactFault / failContactRead / restoreContactRead (by-key contact fault); 2 new tests in calendars-load-errors.spec.ts.
- check green, e2e 92 passed, SEED_VERSION 4; mutants M1-M4 each red. Spec header rewrap covers the first P7-T30 sub-item.
- New tasks: P7-T37 (contacts list error state), P7-T38 (useResource refetch unit test).

## Next up
- **Agent:** P7-T26 Past appointments: only Showed/No-show; Cancel and Confirmed for future only (P7-H3).

## Waiting on you
- None.

## Open suggestions (non-blocking review notes)
- Folded: P7-T27 covers the contact test's two toHaveURL checks; a docs/BACKLOG.md row covers moving the contact load-error tests/helpers and armContactFault's unused `set` accessor.

## Blockers
- None.
