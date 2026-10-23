# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T37 in review.

## Last change
- P7-T37: /contacts shows "Could not load contacts" with Retry when contacts.list fails with no rows loaded (also on a failed page/search/filter change); the count/pager footer hides, the toolbar stays. A failed re-read with rows on screen keeps them.
- New `loadErrorOf(resource)` in src/lib/api/use-resource.ts (unit-tested) replaces every inline `error && data === undefined` guard; calendars-workspace's range-keyed guard stays.
- e2e: failReads supports 'contacts'; `readFaultThrows(page)` counts failed reads. check green, e2e 114/114.
- Added P7-T47 (surface tags.list load failure on /contacts).

## Next up
- **Agent:** P7-T38 (useResource hook test; add cases alongside the `describe('loadErrorOf')` block in use-resource.test.ts).

## Waiting on you
- Review of P7-T37 (deep review).
- P7-H4: should an ended appointment that is already Cancelled stay frozen? Not blocking.

## Open suggestions (non-blocking review notes)
- A failed page change hides Previous/Next too; consider a "Back to page 1" action or keeping Previous visible.
- Row selection survives while the error shows, so BulkActionsBar may act on hidden rows; clear selection or hide the bar.
- Failed re-read test: disconnect() the MutationObserver after the check.
- Same-query-keeps-data / new-query-drops-data in useResource has no unit test yet: P7-T38 scope.

## Blockers
- None.
