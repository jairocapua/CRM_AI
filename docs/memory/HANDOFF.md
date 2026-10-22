# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T07–T12 approved (Autopilot review, 2026-10-22/23); P7-T13 is next. Session handed off to a fresh one after 6 approvals, per CLAUDE.md.

## Last change
- P7-T12: new zone-free `src/lib/dates.ts` (CalendarDay, DayParts, isCalendarDay, parseCalendarDay) is the one YYYY-MM-DD rule; years 0000-0099 refused.
- calendar-nav.ts, mock/slots.ts, api/calendars.ts, booking-dialog.tsx and bookingFormSchema now use it; CalendarDay re-exported type-only.
- Booking form now refuses '0099-01-01' ("Pick a day."), matching page and API. No seed/UI change (SEED_VERSION 4); check + e2e (49) green.
- New task P7-T23: deal form Expected close to use isCalendarDay.

## Next up
- **Agent:** P7-T13 Calendars: error state and retry when appointments fail to load.

## Waiting on you
- P7-H3: decide whether past appointments can be cancelled or re-statused.

## Open suggestions (non-blocking review notes)
- CalendarDay reachable from three paths; point importers at `@/lib/dates` and drop re-exports.
- Consider renaming dates.ts to calendar-day.ts or a header note vs format.ts.
- Accepted edge: a zone-skipped day (2011-12-30 Pacific/Apia) is now accepted; dayStart returns next local midnight.
- Move `isTimeZone` into the shared module (from P7-T11 review). No committed test for slots.ts RangeError path.
- Earlier: setStatus() onto inactive calendar; timezone alias canonicalisation; smoke landmarks; lint warnings.

## Blockers
- None.
