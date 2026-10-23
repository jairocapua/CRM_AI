# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T40 in review.

## Last change
- P7-T40: ContactPicker holds its contact via one hook, `useHeldValue(value, fetched)` (contact-picker-value.ts): last pick, or the first fetched copy for `value`; later refetches never reach Base UI.
- New happy-dom hook test (4 cases, mutant-checked). Docs state the stale-name limit (consumers unmount on close).
- e2e: `pauseTimers` uses PAUSE_MARGIN_MS = 5_000; shared `contactOption` / `chooseContactIn` helpers. check green (655 Vitest); e2e 117 passed.

## Next up
- **Agent:** P7-T41.

## Waiting on you
- Review of P7-T40 (deep review).
- P7-H4: should an ended appointment that is already Cancelled stay frozen? Not blocking.

## Open suggestions (non-blocking review notes)
- useHeldValue assumes the parent applies `onChange(id)` in the same batch as `hold(next)` (true for all 3 consumers); document it, or never replace a held contact with a stale `fetched` of a different id.
- Add a hook test: value held from outside, then user picks P (then refetch P2 stays P).
- Hook test afterEach console.error guard: add a short "intentional" comment.
- contactOption/chooseContactIn may move to a contact-helpers module if non-calendar specs use them.
- Earlier select-a11y, P7-T38 and P7-T37 notes still open.

## Blockers
- None.
