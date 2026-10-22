# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T09 in review.

## Last change
- P7-T09: availability editor at `/calendars/availability?calendar=<slug>` (weekly hours + booking rules), saves via `api.calendars.update`; linked from the Calendars toolbar.
- zod schema `src/lib/validation/availability.ts` (34 tests) rejects reversed, overlapping and malformed windows on enabled days.
- time-grid packing fix: blocks pack on `max(end, start + 25 min)`, so back-to-back 15-min bookings sit side by side.
- e2e `calendars-availability.spec.ts`: shortening Tuesday removes the later booking slots. New tasks P7-T19 (Link-as-button), P7-T20 (unsaved guard / empty open day).

## Next up
- **Agent:** P7-T10 Harness polish: browser install and smoke content checks (once P7-T09 is approved).

## Waiting on you
- Review of P7-T09 (open /calendars/availability, try overlap errors, 375px layout).
- P7-H3: decide whether past appointments can be cancelled or re-statused.

## Open suggestions (non-blocking review notes)
- Folded (P7-T09 review): editor load-error Retry → P7-T13; API-side availability checks → P7-T11; windows to midnight → docs/BACKLOG.md.
- time-grid.test pins MIN_BLOCK_PX/HOUR_HEIGHT_PX literals; better invariant `minutesToPx(MIN_BLOCK_MINUTES) === MIN_BLOCK_PX`.
- Cosmetic: wrap day FieldSets in FieldGroup; use `isSubmitting` instead of a separate `saving` guard.
- ui/pagination.tsx Link-as-button is generated shadcn code (left out of P7-T19).
- Pre-existing lint warnings "Compilation Skipped" in data-table, contact-form-sheet, opportunity-form-sheet.

## Blockers
- None.
