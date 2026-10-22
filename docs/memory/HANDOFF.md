# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T11 in review.

## Last change
- P7-T11: `book()`/`availableSlots()` reject inactive calendars (409 CALENDAR_INACTIVE); `book()` rejects unknown contacts (404) and zone-less/impossible starts (422 INVALID_START).
- `calendars.update()` validates patches with new `calendarSettingsSchema` (422 INVALID_CALENDAR, nothing saved); `slotGrid()` dedupes overlapping windows.
- 34 new tests, written red first; mutation proofs for every new rule. No seed/UI change (SEED_VERSION 4); check + e2e (49) green.
- New task P7-T22: update() undefined-key erase + plain-language 422 message.

## Next up
- **Agent:** P7-T12 Merge duplicate day validators into a shared non-mock module (once P7-T11 is approved).

## Waiting on you
- Review of P7-T11 (and P7-T10 if not yet approved).
- P7-H3: decide whether past appointments can be cancelled or re-statused (also: should Undo/restore work on a calendar switched off after booking?).

## Open suggestions (non-blocking review notes)
- `maxBookingsPerDay` cannot be cleared: folded into P7-T22's scope (P7-T11 review).
- `setStatus()` can restore onto an inactive calendar; details dialog SlotAvailability would show "Could not check..." on 409. Unreachable today; handle in a future deactivate feature.
- Timezone aliases/offsets stored as given; canonicalise via resolvedOptions().timeZone if needed.
- 'impossible hour' test row passes without the fix (not a regression guard). Move `isTimeZone` into P7-T12's shared module.
- Earlier: smoke per-route landmarks; smoke.spec.ts:35 hardcoded "Dashboard"; time-grid literal pins; lint warnings.

## Blockers
- None.
