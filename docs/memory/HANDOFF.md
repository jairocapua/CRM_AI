# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T04 in review.

## Last change
- P7-T04: /calendars keeps `?view=month|week|day&date=YYYY-MM-DD` in the URL (useSearchParams under Suspense in a static page.tsx; writes via `history.pushState`). Invalid params fall back to month + demo-clock today without rewriting the URL.
- New `src/components/modules/calendars/`: calendar-nav.ts (pure; 81 unit tests), toolbar (Today, prev/next, range label, zone label, Month/Week/Day toggle), calendar list (Checkbox toggles in component state, inactive muted), ViewPlaceholder per view (T05/T06 replace).
- e2e/calendars.spec.ts (8 tests, Asia/Singapore, en-US) proves URL/reload/Back, fallbacks, and hide-calendar across views. `npm run check` (253 Vitest + 9 node) and `npm run e2e` (23) green.
- Added P7-T12 (merge duplicate day validators into a shared non-mock module).

## Next up
- **Agent:** P7-T05 Month view (unblocked once P7-T04 is approved; until then `progress.mjs next` picks P7-T10).

## Waiting on you
- Review of P7-T04 (`git show HEAD`).
- No pending human tasks.

## Open suggestions (non-blocking review notes)
- Today pressed when already on today pushes a duplicate history entry (Back seems to do nothing); skip push when `calendarSearch(next) === location.search`.
- Every step flashes the view skeleton (~220ms, isLoading on new range query); T05/T06 may keep previous rows or use a smaller in-grid loading treatment.
- e2e/calendars.spec.ts:189 count regex only anchored at end; use `toHaveText(\`Discovery Call${n}\`)`.
- e2e never toggles via the label/row click; add one to guard Base UI wrapping-label double-toggle.
- CalendarToolbar `children` slot unused until P7-T08 (Book button); could be added then.
- `rangeLabel(view, date)` computed in both workspace and toolbar; pass the label down.
- calendar-nav.ts:154-159 month-grid end round-trips localDay/mustParseDay; `addDays(startOfDay(last), 1)` is clearer.
- Month steps drift the clamped day (31 Jan -> 28 Feb -> 28 Mar); normalise if T05 relies on day-of-month.
- Carried from P7-T03: vitest.setup.ts comment, `CalendarDay` alias for availableSlots, isBlocked equivalence comment, book() JSDoc narrowing, calendars.test.ts:169 comment, seed createdAt clamp, setStatus no-op guard before T07, spring-forward edges / T09 zod rules, buffers across zone midnight.
- Carried: P7-T02 and P7-T01 harness notes (see git history of this file).

## Blockers
- None.
