# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T38 in review.

## Last change
- P7-T38: new src/lib/api/use-resource.hook.test.ts (happy-dom, createRoot + act): failed refetch()/invalidate keeps data, isLoading never shown; new failing cacheKey drops data and loadErrorOf returns the error.
- Mutants M1-M4 of use-resource.ts each turn a test red; use-resource.ts unchanged. Only new devDependency: happy-dom ^21.0.4 (vite stays 7.3.7). check green.
- Added P7-T48 (bump next for npm audit critical findings).

## Next up
- **Agent:** P7-T39.

## Waiting on you
- Review of P7-T38 (deep review).
- P7-H4: should an ended appointment that is already Cancelled stay frozen? Not blocking.

## Open suggestions (non-blocking review notes)
- Hook test: assert error/loadErrorOf null while a new query loads (data still shows old page's data then: intended?).
- Hook test: new query fails, then refetch() succeeds -> error clears (LoadError Retry path).
- Comment that invalidate() revisions in cache.ts persist across tests.
- Consider documenting the `*.hook.test.ts` + happy-dom convention in CLAUDE.md Commands.
- Contacts list (P7-T37): failed page change hides Previous/Next; selection survives under the error; disconnect the MutationObserver in the re-read test.

## Blockers
- None.
