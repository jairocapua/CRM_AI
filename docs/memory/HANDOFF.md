# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T20 in review (deep review).

## Last change
- Availability editor: with unsaved edits, switching calendar or "Back to calendars" opens a "Discard unsaved changes?" dialog (Keep editing / Discard changes); clean form never asks.
- New shared `src/components/common/confirm-dialog.tsx`.
- Removing an enabled day's last window now switches the day off and focuses its switch.
- New e2e/calendars-availability-editor.spec.ts (5 tests, seen red); check green, e2e 87/87 (after 2 P7-T27 flakes).

## Next up
- **Agent:** P7-T21 Raise timeout on long calendars-booking e2e flows.

## Waiting on you
- Review of P7-T20.
- P7-T32 is a duplicate: delete it from the phase file.

## Open suggestions (non-blocking review notes)
- Spec A5 gap: add switch-after-save and Back-after-load checks (spec:230-265).
- availability-form.tsx:115-118 onDirtyChange effect assumes a stable callback; document or use form.subscribe.
- workspace:208-213 call setDirty(false) before router.push on Back-discard; :167 fallback needs a comment.
- ConfirmDialog will need a pending state for async api.* callers.
- Add calendars-availability.spec.ts:69 (and its Back toHaveURL) to P7-T27's scope.
- calendars.update/schema still accept { enabled: true, windows: [] } (maybe with P7-T22).
- Known: toggle on-then-off keeps a hidden window, so the form stays dirty. Not checked in the Browser pane (dev lock held).
- App-wide guard added as P7-T33.

## Blockers
- None.
