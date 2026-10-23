# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T21 in review (deep review).

## Last change
- playwright.config.ts: suite-wide test timeout 60s (was Playwright's 30s default); expect timeout and workers unchanged.
- calendars-booking.spec.ts: `test.slow()` on the two long flows (:153, :317), no split, no assertion change.
- Comment fixes in e2e/calendar-helpers.ts (failReads/restoreReads), Kolkata find merged in calendars-details.spec.ts, one test comment in appointment-display.test.ts.
- check green; e2e 87/87.

## Next up
- **Agent:** P7-T22 Calendar update: reject explicit undefined keys and use a plain-language 422 message.

## Waiting on you
- Review of P7-T21.
- P7-T32 is a duplicate: delete it from the phase file.

## Open suggestions (non-blocking review notes)
- booking spec :157/:321: "Playwright's old 30s default" wording; add "measured in P7-T21" to the durations.
- calendar-helpers.ts:437-443: mention other appointments-table readers (templates.ts:112, analytics.ts:135, settings.ts:195/200).
- playwright.config.ts:47-54: point the comment at P7-T27.
- If P7-T27 does not cap workers, consider test.slow() on booking :259 (24.5s under load).
- Earlier: P7-T20 notes (spec A5 gap, onDirtyChange stability, setDirty before push, ConfirmDialog pending state, availability.spec:69 into P7-T27).

## Blockers
- None.
