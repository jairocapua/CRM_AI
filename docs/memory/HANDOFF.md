# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T49–T54 approved (Autopilot review, 2026-10-24). P7-T54 was approved with `progress.mjs set`, so no task is running. P7-T55 is next. Session handed off to a fresh one after 6 approvals, per CLAUDE.md.

## Last changes (this session)
- P7-T49: shared `userMenu(page)` e2e locator in e2e/fixtures.ts; "Jordan Reyes" now appears only there.
- P7-T50: custom number fields refuse non-finite input and currency fields refuse overflowing cents, inline; setStatus() unknown-id 404 test.
- P7-T51: a failed tags.list shows LoadError + Retry on the contacts table (rows on screen only), contact Info panel, opportunity board and deal page; TagPicker's in-list Retry.
- P7-T52: every custom-field control sets aria-invalid from one flag (absent when valid).
- P7-T53: TagPicker shows an inline LoadError below the input, so a keyboard user can Tab to Retry; focus returns to the input on success; the contacts toolbar opts out. Layout checked in the browser (deal sheet).
- P7-T54 (tests only): e2e proves aria-invalid on required select/multiselect/textarea/date custom fields, via a one-shot init script (P9-T07 moves it to the settings UI).
- Gate green; e2e 137 passed (workflow's verifier).

## Next up
- **Agent:** P7-T55 (tighten TagPicker's inline Retry focus-restore flag: set it on Retry activation, clear on any blur leaving the wrapper).

## Waiting on you
- Nothing. P7-H4 decided 2026-10-24: not frozen (allow changes); P7-T56 rewords the 409 for that case.

## Open suggestions (non-blocking review notes)
- BACKLOG rows added this session: userMenu phone self-test; custom-fields comment accuracy; TagPicker keyboard Retry (now P7-T53, done); load-error skeleton tests can pass vacuously (add `__sawSkeleton`); Deal Value non-finite amounts.
- P7-T54: assert toBeChecked()/toHaveValue after fills; drop `checkboxes[0]?.` optional chaining; combine helper into openNewDealWithRequiredFields.
- P7-T53: pass a ref to ComboboxChipsInput instead of the data-slot query; drop duplicate pageAlert check (~spec:1421); rename deal-sheet test.
- P7-T52: multiselect could use role="group" with aria-invalid.
- P7-T51: move alert-over-skeleton observer into an e2e helper; optionally gate the board's tags alert on any visible deal having tags.
- P7-T49: userMenu name from CURRENT_USER.name (after P9-T02).
- Pre-existing React Compiler lint warnings (3): data-table.tsx:55, contact-form-sheet.tsx:183, opportunity-form-sheet.tsx:145.

## Blockers
- None.
