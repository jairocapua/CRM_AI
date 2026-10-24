# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T52 in review.

## Last changes (this session)
- P7-T52: every custom-field control (Textarea, number/currency, date, SelectTrigger, multiselect Checkboxes, text Input) sets aria-invalid="true" from one `invalid` flag; valid controls render no attribute.
- deal-form.spec.ts: 1e308 test asserts aria-invalid="true"; new test checks a valid amount stays unmarked. Gate green (132 Playwright).
- New P7-T54: e2e for aria-invalid on select/multiselect/textarea/date via required custom fields.

## Next up
- **Agent:** P7-T53 (keyboard path to retry tags in TagPicker), then P7-T54.

## Waiting on you
- Review of P7-T52.
- P7-H4: should an ended appointment that is already Cancelled stay frozen? Not blocking.

## Open suggestions (non-blocking review notes)
- P7-T52: narrow BACKLOG "aria-invalid on every validated deal-form input" (custom fields now done); multiselect could use a role="group" wrapper with aria-invalid instead of per-checkbox.
- P7-T51: move duplicated alert-over-skeleton observer into an e2e helper with a `__sawSkeleton` flag; tagless-test `throw` could be an expect.
- P7-T50: Deal Value non-finite hole in BACKLOG.
- P7-T49: build userMenu's name from `CURRENT_USER.name` (after P9-T02).
- Pre-existing React Compiler lint warnings (3): data-table.tsx:55, contact-form-sheet.tsx:183, opportunity-form-sheet.tsx:145.

## Blockers
- None.
