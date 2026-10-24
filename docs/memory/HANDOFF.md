# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T50 in review.

## Last changes (this session)
- P7-T50: custom number fields refuse non-finite values (Infinity, 1e400) inline; currency fields refuse amounts whose cents overflow (1e308).
- New custom-fields.test.ts; setStatus() unknown-id 404 test (all 4 statuses, writes nothing); applyPatch JSDoc corrected.
- deal-form e2e for Monthly Retainer '1e308' (asserts Field data-invalid). Gate and e2e green.

## Next up
- **Agent:** P7-T51 (tags alert gating, TagPicker Retry, guard comment), then P7-T52 (custom-field inputs set aria-invalid).

## Waiting on you
- Review of P7-T50.
- P7-H4: should an ended appointment that is already Cancelled stay frozen? Not blocking.

## Open suggestions (non-blocking review notes)
- P7-T50: NON_FINITE test comment true only for number fields; module doc could note currency Infinity became $0 / 1e308 became Infinity cents; widen BACKLOG aria-invalid entry to name custom-fields-section.tsx; comment that lostReason is irrelevant in the 404 test.
- Deal Value field non-finite hole: in docs/BACKLOG.md (P7-T50 D2).
- P7-T49: build userMenu's name from `CURRENT_USER.name` (after P9-T02); optional phone-viewport fixture case.
- BACKLOG rows from P7-T43/T44; P7-T46 `parse()` reports first zod issue only; spec.md table date predates P7-T48.
- Pre-existing React Compiler lint warnings (3): data-table.tsx:55, contact-form-sheet.tsx:183, opportunity-form-sheet.tsx:145.

## Blockers
- None.
