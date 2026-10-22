# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T13 in review.

## Last change
- P7-T13: new shared `LoadError` (src/components/common/load-error.tsx) alert with Retry; shows only when a read failed and no data exists.
- Used by calendars page appointments (first load + step), contact Appointments tab, availability calendar list.
- e2e fault helpers failReads/restoreReads in e2e/calendar-helpers.ts; new e2e/calendars-load-errors.spec.ts (4 tests). check + e2e (53) green; no src/lib change, SEED_VERSION 4.
- New tasks P7-T24 (sidebar calendars.list error) and P7-T25 (contact detail non-404 error).

## Next up
- **Agent:** P7-T14 Larger tap target for month chips on mobile.

## Waiting on you
- Review of P7-T13.
- P7-H3: decide whether past appointments can be cancelled or re-statused.

## Open suggestions (non-blocking review notes)
- Focus falls to <body> after successful Retry; no announcement when Retry fails again (P10-T02 audit).
- Point P10-T02 at LoadError; dashboard Upcoming appointments card has no error state.
- failReads also breaks mutations reading the same table; restoreReads leaves wrapper installed. Document in helper Limits.
- Consider capping Playwright workers if first-batch timeouts recur.
- Earlier: CalendarDay re-export paths; isTimeZone to shared module; setStatus() onto inactive calendar.

## Blockers
- None.
