# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T45 in review (deep review).

## Last changes (this session)
- P7-T45: `api.opportunities.create()/update()` delete `expectedCloseAt`, `ownerId`, `lostReason` when sent `null` (was a 422 or a stored literal null).
- New exported `OpportunityPatch` type; `OpportunityDraft` built on it; helper `withoutRemoved()` with no cast. 404 -> 422 -> write order unchanged.
- Tests: 9 new cases, JUNK null row removed (Vitest 669 -> 676); e2e 120 passed.

## Next up
- **Agent:** P7-T46 (once P7-T45 is approved).

## Waiting on you
- Review of P7-T45.
- P7-H4: should an ended appointment that is already Cancelled stay frozen? Not blocking.

## Open suggestions (non-blocking review notes)
- P7-T45: withoutRemoved could be a loop over REMOVABLE (hasOwn + !== null), less code, still no cast.
- P7-T45: create() spreads `...draft` after defaults (can overwrite id/createdAt/position); P7-T46's allow-list should cover create() too.
- P7-T45: clearing lostReason on a lost deal leaves no reason; P7-T46 scope should say if allowed.
- P7-T45: test copies REMOVABLE list; note they must stay in step. Removable keys now sit last in key order (no consumer depends on it).
- P7-T44: year-0000 message pad "00-1-12-31" (slots.ts:46-49); optional year-0000 A1 row; freeSlots 9999-12-31 addDays edge (unreachable).
- P7-T43: hook test U4 characterization; `leave` -> `leaveOptions` rename; console.error spy mockImplementation.

## Blockers
- None.
