# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T41 in review.

## Last change
- P7-T41: LinkButton JSDoc (button.tsx) names both nativeButton lint exceptions (non-link real button; Base UI trigger rendering a non-button) with the exact disable directive.
- scripts/eslint-config.test.mjs asserts each lint-message clause exactly once; mutants M1-M4 all go red.
- e2e/link-buttons.spec.ts header gives padding its own data-icon cause. Comments/tests only; check green.

## Next up
- **Agent:** P7-T42.

## Waiting on you
- Review of P7-T41 (deep review).
- P7-H4: should an ended appointment that is already Cancelled stay frozen? Not blocking.

## Open suggestions (non-blocking review notes)
- button.tsx JSDoc: "There role=button is right" reads as trigger-only; say "In both cases ... opens or acts rather than navigating".
- eslint-config test 1 regex could shorten to /non-link element that really is a button/ to survive small rewording.
- link-buttons header "sm narrows" must change if other sizes gain the data-icon rule.
- Earlier P7-T40, select-a11y, P7-T38 and P7-T37 notes still open.

## Blockers
- None.
