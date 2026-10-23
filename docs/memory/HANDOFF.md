# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T44 in review (deep review).

## Last changes (this session)
- P7-T44: `book()` reads the start's day in the calendar's zone; outside 0100-9999 is now a 422 INVALID_START with a new message (was a RangeError).
- `parseStart` and the string-date check are gone; e.g. 0099-12-31T20:00-10:00 on Tokyo is now a 409. The non-instant message is unchanged.
- Tests: 5 new rows x 2 runtime zones in calendars.test.ts (Vitest 659 -> 669).

## Next up
- **Agent:** P7-T45 (once P7-T44 is approved).

## Waiting on you
- Review of P7-T44.
- P7-H4: should an ended appointment that is already Cancelled stay frozen? Not blocking.

## Open suggestions (non-blocking review notes)
- P7-T44: year-0000 instant west of UTC gives an ugly day "00-1-12-31" in the message (formatDay pad, src/lib/mock/slots.ts:46-49); still a correct 422.
- P7-T44: optional year-0000 row in the A1 table (status + code only); test comment at calendars.test.ts:635 runs past 80 columns.
- P7-T44: freeSlots on day 9999-12-31 could hit addDays -> RangeError, but only if within dateRangeDays of the demo clock (impossible with REF_DATE 2026).
- P7-T43: hook test U4 is characterization; `leave` -> `leaveOptions` rename; phone e2e lacks guarded user-menu path (backlogged); console.error spy mockImplementation.
- Earlier, not logged: team/page.tsx `Metadata` typing; smoke.spec.ts:66-68 comment; button.tsx JSDoc wording; select-a11y test title.

## Blockers
- None.
