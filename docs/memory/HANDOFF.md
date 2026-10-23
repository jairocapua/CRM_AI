# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T27 in review.

## Last change
- One shared `NAVIGATION = { timeout: 15_000 }` in e2e/fixtures.ts; local copies in the editor and link-buttons specs removed.
- Every first wait after a cross-route navigation (availability, booking, details, load-errors specs) now passes it; same-route checks keep 5s.
- playwright.config.ts comment: no worker cap, no expect key (decided). test.slow() comments and details header rewrapped.
- Gate green; full e2e 93 passed; stress run (6 specs x3) 96 passed. src/ untouched, SEED_VERSION 4.

## Next up
- **Agent:** P7-T28 (once P7-T27 is approved).

## Waiting on you
- Review of P7-T27.
- P7-H4: decide whether an ended, already-Cancelled appointment should stay frozen.

## Open suggestions (non-blocking review notes)
- fixtures.ts:39-40: reword "So do 'the URL did not change' checks." to "'The URL did not change' checks keep it too."
- fixtures.ts:42: make NAVIGATION `as const` / `Object.freeze` so no spec can mutate it.
- Nothing enforces NAVIGATION in new specs: note it in CLAUDE.md/LEARNINGS e2e section, or a lint rule / `navigateVia(link)` helper (BACKLOG).
- Earlier: dialog reads apiNow() at render (no timer); calendars.test.ts cold-cache flake; move appointment rules out of validation/ if more arrive.

## Blockers
- None.
