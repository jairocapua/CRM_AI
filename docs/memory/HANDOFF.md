# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T15 in review.

## Last change
- P7-T15: zonedTimes names the end date when an appointment ends on a later date ("11:45 PM – Tuesday, September 8, 12:30 AM"); midnight end stays on start date; year only if it differs.
- appointmentFocusFallback moved to calendars/appointment-focus.ts; phone month chips gap-1; chip comments reworded.
- check + e2e (57) green; no src/lib change, SEED_VERSION 4. Added P7-T27 (e2e cross-route toHaveURL flake).

## Next up
- **Agent:** P7-T16 Check Base UI Select hidden input in the a11y tree.

## Waiting on you
- Review of P7-T15 (deep review).

## Open suggestions (non-blocking review notes)
- Kolkata e2e: put "does not cross in row.timezone" into the `find`, keep the throw.
- Loop midnight/year unit tests over runtime zones with `inZone`.
- Reword KOLKATA_START comment "the seed's own case" unless seed really has 2026-09-07T18:15Z.
- `zone` shows start's offset only; a crossing that also spans DST shows one offset.
- No jsdom unit test for appointmentFocusFallback (e2e covers it).
- India viewer label reads 'Asia/Calcutta' (zoneLabel, pre-existing).
- Earlier: Escape before cancel refetch drops focus (P10-T02); 44px targets/touch-action; focus after Retry; dashboard card error state; failReads limits.

## Blockers
- None.
