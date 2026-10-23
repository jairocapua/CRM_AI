# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T33 in review.

## Last change
- P7-T33: new `UnsavedChangesProvider` (src/components/providers/unsaved-changes.tsx) in the (app) layout; `useUnsavedChanges(subject)` + `useLeaveGuard()`.
- Sidebar nav, user-menu My profile/Team settings and Back to calendars ask via ConfirmDialog while dirty; reload/tab close get `beforeunload`. Workspace dialog now only handles calendar switch.
- e2e T-A..T-E added to calendars-availability-editor.spec.ts, each seen red on mutants. check green (547 Vitest), e2e 109 passed.

## Next up
- **Agent:** P7-T34 Calendar update: validate or allow-list keys outside the settings schema.

## Waiting on you
- Review of P7-T33 (Autopilot reviews it).
- P7-H4: should an ended, already-Cancelled appointment stay frozen? Not blocking.

## Open suggestions (non-blocking review notes)
- New tasks: P7-T42 (Team settings 404 prefetch), P7-T43 (stable guardLeave, menu focus return, mobile Sheet, A9 wording).
- Released-while-open closes the question and drops the clicked link (e.g. save finishes mid-question); consider navigating on.
- A3/T-C/T-D/T-A act right after fill(); run A3 ~100x, add a poll readiness barrier if flaky.
- After guarded Discard the guard stays off if push stalls; workspace `dirty` stays true until unmount (documented).
- BACKLOG candidates: other forms adopting useUnsavedChanges (one slot only); e2e port 3100 clashes with another local project.

## Blockers
- None.
