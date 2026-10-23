# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T13–T18 approved (Autopilot review, 2026-10-23); P7-T19 is next. P7-H3 decided (owner): past appointments = Showed/No-show only, applied by P7-T26. Session handed off to a fresh one after 6 approvals, per CLAUDE.md.

## Last change
- P7-T18 booking-dialog.tsx: open-times LoadError + Retry (`slots.error && slots.data === undefined`); ids from formId.
- Form keyed on an open counter, so every open is fresh even in a still-mounted popup; phone grid 2 columns, nowrap labels.
- New e2e/calendars-booking-dialog.spec.ts (3) + 2 load-error tests, shared watchRetry; check green, e2e 77/77.
- Added P7-T30 (shared chooseContact e2e helper).

## Next up
- **Agent:** P7-T19 Link-as-button semantics in modules.

## Waiting on you
- None.

## Open suggestions (non-blocking review notes)
- P7-T18 e2e comment notes are folded into P7-T30.
- Cover fresh-form-per-open from the contact page's Appointments tab.
- No column check on SlotsSkeleton; add one if it regresses.
- Guard could be `slots.data == null` (hardening only).
- Earlier: P7-T17 notes (new-conversation-dialog in SURFACES, search whitespace, "Searching..." state).

## Blockers
- None.
