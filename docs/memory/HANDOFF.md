# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T29 in review.

## Last change
- ContactPicker keeps the picked contact locally; new pure `pickerValue()` (contact-picker-value.ts, 4 Vitest cases) so typed text after a pick is no longer overwritten.
- e2e/contact-picker.spec.ts: new-conversation dialog as third surface, wider uniqueness check, P7-T17 workaround removed, new race test with frozen page timers (M1 red 60/60).
- Gate green (539 Vitest); e2e 102 passed. New task P7-T40: hold fetched contact for outside-set values.

## Next up
- **Agent:** P7-T30 (once P7-T29 is approved).

## Waiting on you
- Review of P7-T29 (not checked in the Browser pane: another `next dev` held .next/dev/lock).
- P7-H4: decide whether an ended, already-Cancelled appointment should stay frozen.

## Open suggestions (non-blocking review notes)
- spec ~206: "B would never be listed" too strong; say toHaveValue(b.email) catches a late overwrite.
- pauseTimers 1s margin could flake if >1s passes; widen or document.
- `picked` never cleared / stale name if renamed while mounted; note next to state.
- `searched()` mirrors SEARCH_FIELDS by hand: add "change together" line.
- Could fold 'does not pin' and 'keeps typed' tests; 'does not pin' still timing-dependent under M1.
- P7-T30: offer click-without-wait variant; move pauseTimers to shared helper.
- Earlier: select-a11y retitles/docstrings; fixtures.ts NAVIGATION wording.

## Blockers
- None.
