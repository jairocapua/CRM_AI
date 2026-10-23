# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T47 in review (deep review).

## Last changes (this session)
- P7-T47: /contacts shows "Could not load tags" LoadError + Retry above the table when tags.list fails (rows/footer stay); Retry calls invalidate("tags").
- Contacts-list error suppresses the tags alert; its Retry also re-reads tags. TagPicker shows "Could not load tags." with no options/Create.
- e2e: failReads gains "tags" (TABLE_SHAPES now { has, lacks? }); 1 test extended, 2 new. Gate green; e2e 122 passed.
- New task P7-T51: same tags-failure surfacing for contact detail and opportunity board/detail.

## Next up
- **Agent:** P7-T48 (once P7-T47 is approved).

## Waiting on you
- Review of P7-T47.
- P7-H4: should an ended appointment that is already Cancelled stay frozen? Not blocking.

## Open suggestions (non-blocking review notes)
- P7-T47: tags alert can flash above the skeleton on first load; gate on `contactsPage.data !== undefined` (contacts-table.tsx:175).
- P7-T47: TagPicker error state in form sheets/bulk popover has no Retry; add one in ComboboxEmpty or backlog.
- P7-T47: comment that the "re-read keeps badges" e2e is a guard, not proof; helper check that tags fault hits exactly one table.
- P7-T47: Tags cell shows '—' while tags load/fail; after contacts Retry the tags alert can flash ~110ms (accepted).
- P7-T46: custom-fields number check accepts "Infinity"/"1e400" (Number.isFinite); applyPatch doc; parse() first issue only; setStatus() unknown-id test.
- Pre-existing React Compiler lint warnings: data-table.tsx:55, contact-form-sheet.tsx:183, opportunity-form-sheet.tsx:145.

## Blockers
- None.
