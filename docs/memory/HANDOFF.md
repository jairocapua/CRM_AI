# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T42 in review.

## Last change
- P7-T42: new placeholder page `src/app/(app)/settings/team/page.tsx` (title/h1 "Team settings", EmptyState pointing to Phase 9); nav-user.tsx unchanged.
- e2e: `excuseTeamSettingsPrefetch` removed from calendars-availability-editor.spec.ts; smoke.spec.ts gains "Team settings in the user menu opens its page cleanly".
- P9-T03 Refs name the placeholder it replaces. check and e2e green.
- New task added: shared `userMenu(page)` e2e helper (P7-T49).

## Next up
- **Agent:** P7-T43.

## Waiting on you
- Review of P7-T42 (deep review).
- P7-H4: should an ended appointment that is already Cancelled stay frozen? Not blocking.

## Open suggestions (non-blocking review notes)
- team/page.tsx types metadata as `Metadata`; /settings uses an untyped object. Align when P9-T03 replaces it.
- smoke.spec.ts:66-68 comment: the navigation 404 and heading prove the test; the prefetch 404 is incidental.
- Header shows "Settings" on /settings/team (prefix match); P9 may want a sub-route title.
- Earlier P7-T41, P7-T40, select-a11y, P7-T38 and P7-T37 notes still open.

## Blockers
- None.
