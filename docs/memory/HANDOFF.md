# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`, 59/60 done)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T56 in review.

## Last change
- P7-T56: setStatus() 409 SLOT_UNAVAILABLE for an ended, cancelled, rebooked appointment now says it "cannot be marked Showed or No Show"; not-yet-ended (incl. end instant) keeps "Book a new slot instead." (P7-H4).
- One apiNowMs() read drives both the 422 check and the wording; no write, clock mark unmoved.
- New Vitest REBOOKED rows (red on old code) + e2e injecting an ended cancelled twin; gate green (772 tests).

## Next up
- **Gate:** no agent tasks left in P7; once P7-T56 is approved, run the P7 gate ("run the gate for P7").

## Waiting on you
- Review of P7-T56 (Autopilot reviewer). No pending human tasks.

## Open suggestions (non-blocking review notes)
- P7-T56: move the two 409 strings into named constants by canMoveToStatus; comment that the end-instant row is a guard, not red evidence; e2e assert old text has count 0; comment that the twin shares the source's exact interval.
- P7-T55: comment why double rAF + 50 ms wait suffices; reflow long JSDoc (~tag-picker.tsx:59-62).
- P7-T54: assert toBeChecked()/toHaveValue after fills; fold helper into openNewDealWithRequiredFields.
- P7-T53: ref to ComboboxChipsInput instead of data-slot query; rename deal-sheet test.
- P7-T52: multiselect could use role="group" with aria-invalid.
- Pre-existing React Compiler lint warnings (3): data-table.tsx:55, contact-form-sheet.tsx:183, opportunity-form-sheet.tsx:145.

## Blockers
- None.
