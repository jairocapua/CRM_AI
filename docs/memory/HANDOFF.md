# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T35 in review.

## Last change
- P7-T35: shared `parseInstant` in `src/lib/dates.ts`; book()'s `parseStart` uses it (INSTANT removed from calendars.ts).
- `api.opportunities` create/update return 422 INVALID_OPPORTUNITY (field expectedCloseAt) for a bad close date and store valid ones as UTC ISO; the check runs after the 404 and before nowIso.
- +79 Vitest cases (639 total, red on HEAD + mutants); new e2e deal-form Singapore round trip (110 passed).
- New tasks: P7-T44 (book zoned-day check), P7-T45 (opportunity null-removes), P7-T46 (opportunity update allow-list).

## Next up
- **Agent:** P7-T36 Booking dialog: error state and Retry when calendars.list fails.

## Waiting on you
- Review of P7-T35 (Autopilot reviews it).
- P7-H4: should an ended, already-Cancelled appointment stay frozen? Not blocking.

## Open suggestions (non-blocking review notes)
- opportunities.ts:128-130 comment says "no key at all", but the form sends an explicit undefined key; reword or drop it.
- No test pins "check before nowIso" (mutant m9 stays green); add a clock high-water test (calendars.test.ts:1370 pattern).
- deal-form.spec.ts: add a comment that the persisted poll carries the proof, and explain the status === "open" filter.
- A6 wording "timezoneId removed" holds only off UTC+8; consider "with the browser in UTC".
- calendars.test.ts "starts from an empty calendar in late October" is close to the 5s timeout under load; backlog if seen again.
- book() INVALID_START message wording is off for the year-range refusals (folded into P7-T44).

## Blockers
- None.
