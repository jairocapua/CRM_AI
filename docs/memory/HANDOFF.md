# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T18 in review.

## Last change
- P7-T18 booking-dialog.tsx: open-times LoadError + Retry (`slots.error && slots.data === undefined`); ids from formId.
- Form keyed on an open counter, so every open is fresh even in a still-mounted popup; phone grid 2 columns, nowrap labels.
- New e2e/calendars-booking-dialog.spec.ts (3) + 2 load-error tests, shared watchRetry; check green, e2e 77/77.
- Added P7-T30 (shared chooseContact e2e helper).

## Next up
- **Agent:** P7-T19 (next by tracker).

## Waiting on you
- Review of P7-T18 (deep review).

## Open suggestions (non-blocking review notes)
- load-errors spec:48 sawSkeleton doc should say "inside `scope`".
- booking-dialog spec header claims 16 times on 10 Sep too; trim or assert.
- Cover fresh-form-per-open from the contact page's Appointments tab.
- No column check on SlotsSkeleton; add one if it regresses.
- aria-busy observer: use mutation records (attributeOldValue) rather than live read.
- Guard could be `slots.data == null` (hardening only).
- Earlier: P7-T17 notes (new-conversation-dialog in SURFACES, search whitespace, "Searching..." state).

## Blockers
- None.
