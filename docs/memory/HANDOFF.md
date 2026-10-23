# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T31–T36 approved (Autopilot review, 2026-10-23/24); P7-T36 was approved with `progress.mjs set`, so no task is running. P7-T37 is next. Session handed off to a fresh one after 6 approvals, per CLAUDE.md.

## Last change
- P7-T36: booking dialog's Calendar field shows "Could not load calendars" with Retry when calendars.list fails; select disabled until the list loads; P7-T30 e2e cleanups.
- P7-T31–T35 in brief: `LinkButton` + ESLint rule against `nativeButton={false}` / bare `buttonVariants()`; link-button icon padding; app-wide unsaved-changes guard (`UnsavedChangesProvider`: sidebar, user menu, Back, reload, tab close); calendars.update() saves the schema's parsed output (allow-list); deals refuse a bad `expectedCloseAt` (shared `parseInstant` in src/lib/dates.ts).
- Tasks the runs added: P7-T41 (LinkButton JSDoc trigger exception, test tidy), P7-T42 (Team settings 404 prefetch), P7-T43 (guard: stable guardLeave, menu focus, phone Sheet), P7-T44 (book() day in calendar zone), P7-T45 (opportunities: null removes optional fields), P7-T46 (opportunities update allow-list).
- Review notes from P7-T31–T36 are folded into P7-T32, P7-T37, P7-T43, P7-T46 and docs/BACKLOG.md.

## Next up
- **Agent:** P7-T37 Contacts list: error state instead of false 'No contacts found' on list failure.

## Waiting on you
- P7-H4: should an ended appointment that is already Cancelled stay frozen? Not blocking.

## Open suggestions (non-blocking review notes)
- All folded into later tasks' Scope sub-bullets or the backlog.

## Blockers
- None.
