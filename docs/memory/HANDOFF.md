# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T53 in review.

## Last changes (this session)
- P7-T53: TagPicker shows the "Could not load tags" LoadError below the chips input when the tags read fails; Tab reaches Retry, Enter re-reads, focus returns to the input on success.
- New prop `inlineLoadError` (default true); contacts toolbar passes false since the table already shows a page alert.
- 3 new e2e (contact sheet incl. failed retry, deal sheet, bulk popover); in-list test asserts one tags alert in main. Gate green, 135 Playwright.
- New P7-T55: tighten the Retry focus-restore flag.

## Next up
- **Agent:** P7-T54 (e2e aria-invalid on custom fields), then P7-T55.

## Waiting on you
- Review of P7-T53 (nobody has eyeballed the inline alert layout in the sheets/bulk popover yet).
- P7-H4: should an ended appointment that is already Cancelled stay frozen? Not blocking.

## Open suggestions (non-blocking review notes)
- P7-T53: pass a ref to ComboboxChipsInput instead of the data-slot query; drop duplicate pageAlert visible check (~spec:1421); rename deal-sheet test to "offers a keyboard Retry".
- P7-T52: narrow BACKLOG aria-invalid entry; multiselect could use role="group" with aria-invalid.
- P7-T51: move alert-over-skeleton observer into an e2e helper.
- P7-T50: Deal Value non-finite hole in BACKLOG. P7-T49: userMenu name from CURRENT_USER.name (after P9-T02).
- Pre-existing React Compiler lint warnings (3): data-table.tsx:55, contact-form-sheet.tsx:183, opportunity-form-sheet.tsx:145.

## Blockers
- None.
