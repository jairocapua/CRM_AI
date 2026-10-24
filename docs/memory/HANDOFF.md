# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T49 in review.

## Last changes (this session)
- P7-T49: e2e/fixtures.ts exports `userMenu(page)` (sidebar footer user-menu trigger; the one place P9-T02 updates).
- calendars-availability-editor and smoke specs import it; "Jordan Reyes" now only in fixtures.ts.
- New self-test in fixture.spec.ts (exactly one visible trigger on /dashboard). Gate green; e2e 123 passed.

## Next up
- **Agent:** P7-T50 (custom number fields `Number.isFinite`; setStatus() unknown-id 404 test; applyPatch doc), then P7-T51 (tags alert gating, TagPicker Retry, guard comment).

## Waiting on you
- Review of P7-T49.
- P7-H4: should an ended appointment that is already Cancelled stay frozen? Not blocking.

## Open suggestions (non-blocking review notes)
- P7-T49: build userMenu's name from `CURRENT_USER.name` (wait for P9-T02); optionally add a phone-viewport case to the fixture self-test.
- BACKLOG rows: leave guard user menu inside phone Sheet (P7-T43); negative years in INVALID_START message (P7-T44).
- P7-T46: `parse()` reports only the first zod issue.
- spec.md table header date (2026-09-08) predates P7-T48 re-verification of `next`.
- Pre-existing React Compiler lint warnings (3): data-table.tsx:55, contact-form-sheet.tsx:183, opportunity-form-sheet.tsx:145.

## Blockers
- None.
