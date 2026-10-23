# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T26 in review.

## Last change
- New pure rule `hasEnded` / `canMoveToStatus` in src/lib/validation/appointment.ts (ended = end strictly before demo now).
- calendars.ts setStatus()/cancel(): ended appointment to Confirmed/Cancelled throws ApiError 422 PAST_APPOINTMENT, nothing written, clock high-water mark untouched.
- Details dialog: ended appointments get Confirmed/Cancelled disabled and no Cancel button.
- Gate green; 11 new API Vitest cases, rule tables, 1 e2e; mutants each red. SEED_VERSION 4.

## Next up
- **Agent:** P7-T27 (once P7-T26 is approved).

## Waiting on you
- Review of P7-T26.
- P7-H4: decide whether an ended, already-Cancelled appointment should stay frozen.

## Open suggestions (non-blocking review notes)
- e2e/calendars-details.spec.ts header comment (lines 23-25): rewrap the over-long line by hand.
- Dialog reads apiNow() at render: an appointment ending while its dialog is open keeps Cancel/Confirmed (and Undo) until re-render; API 422 catches it. Timer only if noticed.
- calendars.test.ts first test flaked once on a cold cache (5s timeout); consider raising its timeout or warming the import.
- If more appointment rules arrive, move them out of validation/ (e.g. src/lib/appointments/rules.ts).

## Blockers
- None.
