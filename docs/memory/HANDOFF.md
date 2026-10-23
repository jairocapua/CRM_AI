# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T25 in review.

## Last change
- contact-detail.tsx: non-404 load failure shows LoadError ('Could not load the contact', Retry) instead of an endless skeleton; 404 branch stays first.
- e2e/calendar-helpers.ts: armContactFault / failContactRead / restoreContactRead (by-key contact fault); 2 new tests in calendars-load-errors.spec.ts.
- check green, e2e 92 passed, SEED_VERSION 4; mutants M1-M4 each red. Spec header rewrap covers the first P7-T30 sub-item.
- New tasks: P7-T37 (contacts list error state), P7-T38 (useResource refetch unit test).

## Next up
- **Agent:** P7-T26 (once P7-T25 is approved).

## Waiting on you
- Review of P7-T25.

## Open suggestions (non-blocking review notes)
- Rename calendars-load-errors.spec.ts / move contact fault helpers out of calendar-helpers.ts (not calendar-specific).
- P7-T27 should also cover the two new cross-route toHaveURL checks in the contact-page test.
- armContactFault's `set` accessor is effectively unused (writes copy the object): note it as defensive or remove.
- Not checked in the Browser pane; only the 404 state is checkable by hand there.

## Blockers
- None.
