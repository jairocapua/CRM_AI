# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T07 in review.

## Last change
- P7-T07: appointment details dialog (appointment-details-dialog.tsx): contact link, "Your time" + "Calendar time" with zone labels, location, status Select via setStatus, cancel via cancel with Undo and a slot-availability line.
- Pure helpers in appointment-display.ts (liveFirst, zonedTimes, shownStatus …); liveFirst applied once in the workspace so cancelled appointments sort after live ones in every view.
- e2e: calendars-details.spec.ts (live-first + "+N more", cancel frees Upcoming card and slot, status on activity timeline, Undo). Check and e2e green.
- New tasks: P7-T14 mobile chip tap target, P7-T15 midnight-crossing end date, P7-T16 Select hidden-input a11y; P7-H3 (owner decision on past appointments).

## Next up
- **Agent:** P7-T09 Availability editor (what `progress.mjs next` picks once P7-T07 is approved).

## Waiting on you
- Review of P7-T07.
- P7-H3: decide whether past appointments can be cancelled or re-statused.

## Open suggestions (non-blocking review notes)
- Dialog/calendarDayOf use row.timezone; availableSlots reads Calendar.timezone. Equal today; add calendarTimezone to AppointmentRow if calendar zones become editable.
- Rapid back-to-back status changes can flicker; keep busy until row.status === write.status.
- pack-intervals.test.ts identical-intervals test: give intervals distinguishing ids.
- e2e hard-codes 'GMT-7'; derive with Intl shortOffset.
- Folded into tasks (P7-T07 review): the booking-dialog slot e2e is in P7-T08's acceptance; the focus fallback after cancel is in P7-T14's scope.
- 3 pre-existing lint warnings (data-table, contact-form-sheet, opportunity-form-sheet), unrelated.
- Carried from P7-T06 and earlier: see git history of this file.

## Blockers
- None.
