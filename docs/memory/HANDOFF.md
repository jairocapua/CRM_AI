# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T05 in review.

## Last change
- P7-T05: month grid (month-grid.ts pure + month-view.tsx) replaces the month placeholder: chips coloured by calendar, filed by viewer's local day, cancelled struck through, >3 per day shows 2 chips + "+N more"; "+N more" and the day number open `?view=day&date=…`. Mobile collapses chips to colour bars.
- calendars-workspace.tsx keeps the previous range's grid (dimmed, aria-busy) while a new range loads; skeleton only on first load; `isRefreshing` never read.
- New pure `historyMethod()` in calendar-nav.ts: none / replace (non-canonical URL) / push. Today on today adds no history entry.
- e2e: shared e2e/calendar-helpers.ts; new e2e/calendars-month.spec.ts (local-day oracle in Singapore, Kolkata, LA). `npm run check` and `npm run e2e` (32/32) green. Added P7-T13 (appointments error state + retry).

## Next up
- **Agent:** P7-T06 (what `progress.mjs next` picks once P7-T05 is approved).

## Waiting on you
- Review of P7-T05 (`git show HEAD`).
- No pending human tasks.

## Open suggestions (non-blocking review notes)
- historyMethod: Today still pushes when the date changes but the visible range does not (day 09-20 -> Month -> Today); consider 'replace' when view and visibleDays are unchanged.
- e2e hide-calendar test now only checks month chips are visible; restore an exact check via cellCounts + an oracle without Discovery Call.
- calendars-month.spec.ts:247 distinct-colour assertion runs over all seeded calendars, not the checked ones.
- month-grid.test.ts:75-92: only the November DST case catches 24h-stepping; the March case passes either way.
- Cancelled appointments count toward "+N more" and can hide live bookings; confirm product call before P7-T07.
- month-grid.test.ts:158 'three chips per day' test restates the constant; add a comment that it is a tripwire for the e2e's hard-coded '> 3'.
- Mobile (375px) layout checked only in the Browser pane; e2e is Desktop Chrome only.
- lint has 3 warnings in untouched files (data-table.tsx, contact-form-sheet.tsx, opportunity-form-sheet.tsx).
- LA local-day run cannot catch UTC bucketing with this seed; Singapore and Kolkata do (documented in the spec header).
- Carried from P7-T04: e2e never toggles via label/row click; toolbar children slot unused until T08; rangeLabel computed twice; month-grid end round-trip; month steps drift the clamped day.
- Carried from P7-T03 and earlier: see git history of this file.

## Blockers
- None.
