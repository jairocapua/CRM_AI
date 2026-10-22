# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T08 in review.

## Last change
- P7-T08: booking dialog (booking-dialog.tsx; RHF + zod via Field*): calendar → ContactPicker → day → time cards from availableSlots; book() errors show as alert and refetch slots.
- Entry points: Calendars toolbar Book button; new contact Appointments tab (contact-appointments-panel.tsx) with pre-filled Book.
- Pure helpers booking-slots.ts (11 tests) + bookingFormSchema (8 tests); e2e calendars-booking.spec.ts covers the phase exit check. Check and e2e green.
- New tasks: P7-T17 ContactPicker search, P7-T18 booking-dialog slot-error Retry / ids / fresh form.

## Next up
- **Agent:** P7-T09 Availability editor (once P7-T08 is approved).

## Waiting on you
- Review of P7-T08 (look at time cards, calendar colour dots, cancelled rows in the browser).
- P7-H3: decide whether past appointments can be cancelled or re-statused.
- Note: one test appointment was booked in the dev workspace (Discovery Call, Amber Mosciski, 9 Sep); reseed in Settings → Demo Data clears it.

## Open suggestions (non-blocking review notes)
- Folded into tasks (P7-T08 review): isDayInput merge → P7-T12; contact panel error branch → P7-T13; time cards wrapping at phone width → P7-T18.
- STATUS_VARIANTS duplicates details-dialog status display; consider shared AppointmentStatusBadge.
- e2e: use stable descending sort instead of .reverse(); Upcoming tripwire should filter on demo-now after load.
- Calendar Select hidden input a11y is covered by P7-T16; inactive calendars/unknown contacts at API level by P7-T11.
- Booking into a hidden calendar gives no hint in dialog or toast.
- Carried from P7-T07 and earlier: see git history of this file.

## Blockers
- None.
