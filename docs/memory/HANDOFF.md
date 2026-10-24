# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T55 in review.

## Last change
- P7-T55: TagPicker's inline Retry focus-restore flag is set only in LoadError's onRetry; wrapper onFocus removed; onBlur clears it on any blur leaving the wrapper (null relatedTarget included).
- New e2e: a tags read started elsewhere (contacts page alert Retry) no longer pulls focus into the bulk popover's picker; red on old code.
- Gate green; e2e 138 passed.

## Next up
- **Agent:** P7-T56 (reword the 409 SLOT_UNAVAILABLE message for an ended appointment).

## Waiting on you
- Review of P7-T55 (Autopilot reviewer). No pending human tasks.

## Open suggestions (non-blocking review notes)
- P7-T55: Safari/macOS Firefox don't focus a button on mouse click, so the flag can stick; set it as `event.currentTarget.contains(document.activeElement)` or note in BACKLOG.
- P7-T55: comment why the double rAF + 50 ms wait in the new e2e is enough; hand-reflow the long JSDoc line (~tag-picker.tsx:59-62).
- P7-T54: assert toBeChecked()/toHaveValue after fills; drop `checkboxes[0]?.`; fold helper into openNewDealWithRequiredFields.
- P7-T53: ref to ComboboxChipsInput instead of data-slot query; drop duplicate pageAlert check; rename deal-sheet test.
- P7-T52: multiselect could use role="group" with aria-invalid.
- P7-T51: alert-over-skeleton observer into an e2e helper.
- Pre-existing React Compiler lint warnings (3): data-table.tsx:55, contact-form-sheet.tsx:183, opportunity-form-sheet.tsx:145.

## Blockers
- None.
