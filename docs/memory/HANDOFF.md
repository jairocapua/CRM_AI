# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T24 in review (deep review).

## Last change
- Calendars sidebar shows LoadError ('Could not load calendars', Retry) when `calendars.error && data === undefined`; skeleton only on isLoading.
- Month/week/day views still draw every appointment while the list is down.
- New e2e test in calendars-load-errors.spec.ts (busy Retry, layout at 1280x720, recovery to 4 checked calendars); check green, e2e 90/90, SEED_VERSION 4.

## Next up
- **Agent:** P7-T25 (next by tracker order). New task P7-T36 (booking dialog calendar-list error) added.

## Waiting on you
- Review of P7-T24.
- P7-T32 is a duplicate: delete it from the phase file.

## Open suggestions (non-blocking review notes)
- A5 (failed refetch keeps the list) has no red-able test; add one or reword A5/A6 as "by construction".
- Narrow 14rem column: alert text ~100px wide due to LoadError `pr-22`; consider Retry under text (backlog).
- calendars-load-errors.spec.ts:25 header line ~93 chars; rewrap.
- `watchRetry(page, "main")` reads the first alert in main; scope to the calendar column.
- Empty calendar list (after Clear demo data) shows only the heading; use `Empty` (backlog).
- Earlier: P7-T23 notes folded into P7-T35 and the backlog.

## Blockers
- None.
