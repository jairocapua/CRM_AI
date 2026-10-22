# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T16 in review.

## Last change
- P7-T16: not a bug. Chromium ignores every Base UI Select hidden input (ariaHiddenElement); triggers are exposed comboboxes.
- New e2e/select-a11y.spec.ts (9 tests: 5 routes, Add contact sheet, 2 self-tests, focus). CLAUDE.md notes the read_page artifact.
- check + e2e (66) green; no src change, SEED_VERSION 4. Added P7-T28 (name unlabelled Select triggers).

## Next up
- **Agent:** P7-T17 (next by tracker).

## Waiting on you
- Review of P7-T16 (deep review).

## Open suggestions (non-blocking review notes)
- CLAUDE.md note claims Combobox too; spec covers Select only. Add a TagPicker case or narrow wording.
- select-a11y.spec.ts:228 pure self-test: comment that the fixture page is irrelevant.
- Interaction-only Selects (composer, booking/details dialogs, opportunity sheet, bulk bar) not covered.
- Route tests could pin expected trigger count/names per route.
- Recurring cross-route toHaveURL flake (P7-T27).
- Earlier: P7-T15 notes (Kolkata e2e find, runtime-zone loops, DST offset, focus-fallback unit test, Asia/Calcutta label).

## Blockers
- None.
