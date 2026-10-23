# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T25–T30 approved (Autopilot review, 2026-10-23); P7-T30 was approved with `progress.mjs set`, so no task is running. P7-T31 is next. Session handed off to a fresh one after 6 approvals, per CLAUDE.md.

## Last change
- P7-T30: one shared `chooseContact` (exact-name, no `.first()`), plus `pauseTimers` and `uniquelyNamedContact`, in e2e/calendar-helpers.ts; `NAVIGATION` frozen and typed, with a self-test. e2e 103 passed, 539 Vitest, no src change.
- P7-T25–T29 in brief: contact page LoadError + Retry; P7-H3 past-appointment rule (API 422 `PAST_APPOINTMENT` + dialog); shared 15s `NAVIGATION` for cross-route e2e waits; named Select triggers and the contact sheet's Tags picker; ContactPicker keeps its pick at once (`pickerValue`).
- Tasks the runs added: P7-T37 (contacts list error state), P7-T38 (useResource refetch unit test), P7-T39 (remaining TagPickers and contacts search names), P7-T40 (ContactPicker: hold the fetched contact for outside-set values), owner task P7-H4.
- Review notes from P7-T25–T30 are folded into P7-T36, P7-T39, P7-T40 and docs/BACKLOG.md.

## Next up
- **Agent:** P7-T31 LinkButton helper and nativeButton lint rule.

## Waiting on you
- P7-H4: should an ended appointment that is already Cancelled stay frozen? Today it can still be marked Showed or No Show (the P7-H3 rule names target statuses only). Not blocking.

## Open suggestions (non-blocking review notes)
- All folded into later tasks' Scope sub-bullets or the backlog.

## Blockers
- None.
