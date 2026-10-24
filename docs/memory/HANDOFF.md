# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T51 in review.

## Last changes (this session)
- P7-T51: a failed tags.list read now shows LoadError + Retry (invalidate("tags")) on the contacts table (gated on `!isLoading`), contact Info panel (records with tags), opportunity board and deal detail.
- TagPicker's 'Could not load tags.' empty state gained a Retry that keeps the list open.
- 5 new e2e in calendars-load-errors.spec.ts; check and e2e green (769 Vitest, 131 Playwright).

## Next up
- **Agent:** P7-T52 (custom-field inputs set aria-invalid). New P7-T53: keyboard path to retry tags in TagPicker.

## Waiting on you
- Review of P7-T51.
- P7-H4: should an ended appointment that is already Cancelled stay frozen? Not blocking.

## Open suggestions (non-blocking review notes)
- P7-T51: move the duplicated alert-over-skeleton observer into an e2e helper and add a `__sawSkeleton` flag so the "waits for" tests cannot pass vacuously; board alert could gate on visible deals having tags; tagless-test `throw` could be an expect with message.
- P7-T50: NON_FINITE comment true only for number fields; widen BACKLOG aria-invalid entry to custom-fields-section.tsx. Deal Value non-finite hole in BACKLOG.
- P7-T49: build userMenu's name from `CURRENT_USER.name` (after P9-T02).
- Pre-existing React Compiler lint warnings (3): data-table.tsx:55, contact-form-sheet.tsx:183, opportunity-form-sheet.tsx:145.

## Blockers
- None.
