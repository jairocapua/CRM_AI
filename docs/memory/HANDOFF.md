# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T06 in review.

## Last change
- P7-T06: week and day time grid (time-grid-view.tsx) replaces the placeholder; pure `packIntervals` (pack-intervals.ts) sets overlaps side by side, pure helpers in time-grid.ts cut appointments at local midnight.
- Now line from apiNow() on a 60s tick (never the wall clock); grid scrolls on open to 30 min before the earliest appointment, once per opened range.
- historyMethod now replaces when the view is unchanged and the visible days are the same (Month Sep 20 -> Today adds no entry).
- e2e: new calendars-week-day.spec.ts (Intl oracle in Singapore, Kolkata, LA; overlap, now line under a frozen clock, scroll on open). `npm run check` and `npm run e2e` (40/40) green.

## Next up
- **Agent:** P7-T07 Appointment details, status and cancel (what `progress.mjs next` picks once P7-T06 is approved).

## Waiting on you
- Review of P7-T06 (`git show HEAD`).
- No pending human tasks.

## Open suggestions (non-blocking review notes)
- pack-intervals.ts:30-32 docstring claims input order never changes placement; false for identical [start,end) (tie-break is input index). Soften or take a stable key (row id).
- time-grid.test.ts:122 comment says 00:15-01:00; the case asserts 02:15-03:00.
- calendars-workspace.tsx:36-40 docstring still says replace only tidies a non-canonical URL.
- time-grid-view.tsx:279 MIN_BLOCK_PX (20px) can make two back-to-back 15-min bookings overlap by 8px; pack on max(end, start + min-height minutes) before P7-T08 bookings allow short slots.
- time-grid-view.tsx:249 now-line dot is painted under the sticky hour gutter on the first column (cosmetic).
- time-grid-view.tsx:88-96 the 60s tick re-renders the whole grid; isolate it in a NowLine child or memoize columns.
- time-grid-view.tsx:159-161 isToday (workspace `today`) and the now line (component tick) can disagree for up to 60s around local midnight; derive both from one clock.
- e2e/calendars.spec.ts:267 new test sits under describe 'Today on today adds no history entry' but tests Today from another day; rename/split.
- DST days are not stretched (24 wall-clock rows always); documented in time-grid.ts, seed never hits those hours.
- At ~1024px with sidebar + calendar list the week grid scrolls sideways inside its card (min-w 42rem); page never does.
- e2e is Desktop Chrome only; 375px checked by hand in the Browser pane.
- lint has 3 pre-existing warnings (data-table.tsx, contact-form-sheet.tsx, opportunity-form-sheet.tsx).
- Carried from P7-T05: month-spec distinct-colour assertion over all calendars; month-grid DST March case weak; '+N more' tripwire comment.
- Carried from P7-T04 and earlier: see git history of this file.

## Blockers
- None.
