# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T23 in review (deep review).

## Last change
- `dateInputToIso` (validation/opportunity.ts) now uses shared `isCalendarDay`/`parseCalendarDay`, still local midnight; date-fns parse/isValid gone.
- Schema refuses non-empty bad days ('Enter a valid date.'); deal sheet shows it under Expected close (data-invalid, aria-invalid, FieldError).
- New opportunity.test.ts (25, 8 red on old code) + e2e/deal-form.spec.ts; check green (513), e2e 89/89, SEED_VERSION 4.

## Next up
- **Agent:** P7-T24 (next by tracker order).

## Waiting on you
- Review of P7-T23.
- P7-T32 is a duplicate: delete it from the phase file.

## Open suggestions (non-blocking review notes)
- New task P7-T35: validate expectedCloseAt in api.opportunities create/update.
- Deal name and Value inputs lack aria-invalid (only Expected close has it); align the form.
- deal-form.spec sets timezoneId Singapore with no zone-dependent assertion: drop it or add an edit-deal round trip.
- errorsFor helper collapses same-field issues; use issues.length if exactness matters.
- `new Date(y, m-1, d)` duplicated in calendar-nav.ts mustParseDay; a shared `localMidnight` in @/lib/dates could replace both.
- Not checked in Browser pane (dev lock held by another session); covered by e2e.
- Earlier: P7-T22 notes folded into P7-T34.

## Blockers
- None.
