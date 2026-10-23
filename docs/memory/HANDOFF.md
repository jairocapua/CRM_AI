# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T30 in review.

## Last change
- One shared `chooseContact` (exact-name, no `.first()`), plus `pauseTimers` and `uniquelyNamedContact`, now in e2e/calendar-helpers.ts; three local copies removed.
- Folded review notes: column-scoped Retry watch (test-only `data-e2e-calendar-column` tag), aria-busy observer reads `oldValue`, doc fixes, `NAVIGATION` frozen and typed.
- Gate green (539 Vitest); e2e 103 passed (+1 NAVIGATION self-test). No src change.

## Next up
- **Agent:** P7-T31 LinkButton helper and nativeButton lint rule (once P7-T30 is approved).

## Waiting on you
- Review of P7-T30.
- P7-H4: decide whether an ended, already-Cancelled appointment should stay frozen.

## Open suggestions (non-blocking review notes)
- load-errors:276 column scope also narrows the skeleton watch; give watchRetry separate alert/skeleton scopes.
- failReads doc: merge the duplicated "Object.values ... throws too" paragraphs.
- load-errors:540 assert group not aria-busy before installing the observer; rename `__timesWentBusy`.
- load-errors:273 Month view region lacks `exact: true`; booking-dialog:96 move `contactInput` near its use.
- contact-picker `chooseByName` could reuse `chooseContact` if it took an input locator.
- Planner said four keeps-typed tests; there are three (all pass).

## Blockers
- None.
