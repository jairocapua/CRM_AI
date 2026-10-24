# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T54 in review.

## Last changes (this session)
- P7-T54 (tests only): 2 e2e in e2e/deal-form.spec.ts prove required select/multiselect/textarea/date custom fields set aria-invalid + "<label> is required." when empty, and nothing when filled.
- Fields injected into the persisted DB by a one-shot init script (stand-in for the P9-T04 settings manager).
- Gate green; e2e 137 passed. New P9-T07: switch that helper to the settings UI once P9-T04 lands.

## Next up
- **Agent:** P7-T55 (tighten the Retry focus-restore flag).

## Waiting on you
- Review of P7-T54.
- P7-H4: should an ended appointment that is already Cancelled stay frozen? Not blocking.

## Open suggestions (non-blocking review notes)
- P7-T54: assert toBeChecked()/toHaveValue after fills; drop `checkboxes[0]?.` optional chaining; combine helper into openNewDealWithRequiredFields.
- P7-T53: pass a ref to ComboboxChipsInput; drop duplicate pageAlert check (~spec:1421); rename deal-sheet test.
- P7-T52: narrow BACKLOG aria-invalid entry; multiselect could use role="group" with aria-invalid.
- P7-T51: move alert-over-skeleton observer into an e2e helper.
- P7-T50: Deal Value non-finite hole in BACKLOG. P7-T49: userMenu name from CURRENT_USER.name (after P9-T02).
- Pre-existing React Compiler lint warnings (3): data-table.tsx:55, contact-form-sheet.tsx:183, opportunity-form-sheet.tsx:145.

## Blockers
- None.
