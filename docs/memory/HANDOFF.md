# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T43 in review (deep review).

## Last changes (this session)
- P7-T43: `guardLeave` keeps one identity (subject read from a ref at click time), so the sidebar and user menu stop re-rendering on register/release.
- New `guardLeave(href, { onLeave, returnFocus })`: the phone Sheet closes only when a link really navigates; the user menu's question returns focus to its trigger.
- Tests: 4 happy-dom hook tests (unsaved-changes.hook.test.ts) and 2 phone (390x844) e2e tests; ordering comments reworded everywhere.

## Next up
- **Agent:** P7-T44 (once P7-T43 is approved).

## Waiting on you
- Review of P7-T43.
- P7-H4: should an ended appointment that is already Cancelled stay frozen? Not blocking.

## Open suggestions (non-blocking review notes)
- P7-T43: hook test U4 is a characterization test (green on HEAD); note it or name a mutant (setSubject(null) not closing the question).
- P7-T43: rename the local `leave` options object to `leaveOptions` in app-sidebar.tsx / nav-user.tsx (cosmetic).
- P7-T43: phone e2e lacks a guarded user-menu path (My profile in the Sheet, Escape, focus back on trigger, Sheet open).
- P7-T43: `vi.spyOn(console, 'error')` in the hook test could `.mockImplementation(() => {})` for tidy output.
- Earlier, not logged: team/page.tsx `Metadata` typing; smoke.spec.ts:66-68 comment; button.tsx JSDoc wording; select-a11y test title.

## Blockers
- None.
