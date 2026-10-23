# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T22 in review (deep review).

## Last change
- calendars.update() drops undefined keys before validating/merging; `maxBookingsPerDay: null` deletes the cap (0 still 422).
- 422 INVALID_CALENDAR message now '<label>: <rule>' (e.g. "Time zone: Not a valid value."); dotted path in new optional `ApiError.field`.
- New `CalendarPatch` type; per-parse zod error map; 21 BAD_PATCHES rows + undefined/null tests, all seen red.
- check green (488 tests); e2e 87/87; no mock/UI/e2e change, SEED_VERSION 4.

## Next up
- **Agent:** P7-T23 (next by tracker order).

## Waiting on you
- Review of P7-T22.
- P7-T32 is a duplicate: delete it from the phase file.

## Open suggestions (non-blocking review notes)
- New task P7-T34: validate/allow-list keys outside the settings schema, keep prev.createdAt.
- settingLabel numbers windows by patch order; editor sorts by start time. Add a comment before wiring `field` into the form.
- Later UI task: map ApiError.field onto form inputs (form.setError) for a server 422.
- withoutUndefined return type could exclude undefined (cosmetic).
- No test for fallback label 'Calendar settings' / `!issue` branch.
- Earlier: P7-T21 notes (booking spec wording, calendar-helpers readers, config comment -> P7-T27, test.slow on :259).

## Blockers
- None.
