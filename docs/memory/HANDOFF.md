# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T28 in review.

## Last change
- aria-labels on three Select triggers: Status (contacts toolbar), Pipeline (board toolbar), Assign owner (bulk bar).
- TagPicker takes an optional `id`; the Add contact sheet passes id="tagIds" so its "Tags" label now names the input.
- e2e/select-a11y.spec.ts reworked (expectNamedControls, empty-name rule, Combobox case, popover case); 12 tests. Gate green; e2e 96 passed (+3).
- New task P7-T39: name the remaining TagPickers and the contacts search box.

## Next up
- **Agent:** P7-T29 (once P7-T28 is approved).

## Waiting on you
- Review of P7-T28. Human check: clicking the "Tags" label in the contact sheet now focuses the input and may open the tag list.
- P7-H4: decide whether an ended, already-Cancelled appointment should stay frozen.

## Open suggestions (non-blocking review notes)
- select-a11y.spec.ts ~240: retitle per-route tests "every Select is named and its hidden input ignored".
- expectNamedControls docstring: the count is checked once, when the named triggers are present.
- TAG_COMBOBOX comment: cite AriaCombobox.mjs without the line range.
- Earlier: fixtures.ts NAVIGATION wording/`as const`; nothing enforces NAVIGATION in new specs; calendars.test.ts cold-cache flake.

## Blockers
- None.
