# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T39 in review.

## Last change
- P7-T39: TagPicker gained an optional `aria-label` prop. Contacts search ("Search contacts"), toolbar tag filter ("Filter by tags") and bulk Tags popover ("Tags") are named; deal sheet TagPicker named via FieldLabel htmlFor/id.
- e2e/select-a11y.spec.ts: 3 new tests (each red on HEAD), plus P7-T28 review fixes (titles, docs, header). check green; e2e 117 passed.

## Next up
- **Agent:** P7-T40.

## Waiting on you
- Review of P7-T39 (deep review).
- P7-H4: should an ended appointment that is already Cancelled stay frozen? Not blocking.

## Open suggestions (non-blocking review notes)
- select-a11y: drop redundant toHaveAccessibleName on the search box (or locate by placeholder); extend the Contacts toolbar test title to mention hidden input.
- select-a11y: reword expectNamedControls doc ("is waited for"); share an openBulkPopover helper scoped to the bulk bar.
- WCAG 2.5.3: toolbar placeholder "Add tags…" vs name "Filter by tags"; consider placeholder "Filter by tags…" (cosmetic).
- Hook test (P7-T38) and contacts list (P7-T37) notes from earlier still open.

## Blockers
- None.
