# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T36 in review.

## Last change
- P7-T36: booking dialog's Calendar field shows a "Could not load calendars" alert with Retry when calendars.list fails; select disabled until the list loads; Retry goes busy, no skeleton.
- New e2e in calendars-load-errors.spec.ts (alert, layout at 1280x720, failed Retry, recovery to 16 open times); red on HEAD and on mutants.
- P7-T30 e2e cleanups: watchRetry alert/skeleton scopes split, `exact: true` on Month view, `__timesBusySpellEnded`, failReads docs, contactInput moved.

## Next up
- **Agent:** P7-T37 Contacts list: error state instead of false 'No contacts found' on list failure.

## Waiting on you
- Review of P7-T36 (Autopilot reviews it).
- P7-H4: should an ended, already-Cancelled appointment stay frozen? Not blocking.

## Open suggestions (non-blocking review notes)
- booking-dialog.tsx:78-84: change "a reset" to "a settings-wide invalidation" (settings.ts calls invalidateAll at 4 sites).
- calendarsError is derived the same way in booking-dialog.tsx:161 and calendars-workspace.tsx:229; a `loadErrorOf(resource)` helper if a third surface needs it.
- New booking-dialog test: comment why only the dialog is watched for skeletons (modal; page behind does not refetch).
- P7-T36 Scope text in the phase file keeps the original `__timesWentBusy` name on purpose; code uses `__timesBusySpellEnded`.

## Blockers
- None.
