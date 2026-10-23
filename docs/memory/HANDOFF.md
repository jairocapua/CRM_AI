# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T37–T42 approved (Autopilot review, 2026-10-24). P7-T42 was approved with `progress.mjs set`, so no task is running. P7-T43 is next. Session handed off to a fresh one after 6 approvals, per CLAUDE.md.

## Last changes (this session)
- P7-T37 (128a5a3): /contacts shows "Could not load contacts" + Retry on a failed list read; new `loadErrorOf` helper in use-resource.ts replaces the inline guards on six screens. Added P7-T47 (tags.list failure on /contacts is silent).
- P7-T38 (b5b8fe1): hook-level useResource test under happy-dom (`*.hook.test.ts`, per-file `// @vitest-environment happy-dom`). Added P7-T48 (patch-bump `next` for npm audit criticals).
- P7-T39 (1f06927): names for the contacts search box, toolbar tag filter, bulk Tags popover and deal-sheet TagPicker.
- P7-T40 (6b06212): ContactPicker holds its contact through `useHeldValue`, so refetches never rewrite typed text.
- P7-T41 (3f4f697): LinkButton JSDoc names both `nativeButton` lint exceptions; comment and test-assert changes only.
- P7-T42 (f1e0eb7): placeholder page at /settings/team so the user menu's Team settings link stops 404ing. Added P7-T49 (shared `userMenu(page)` e2e helper).

## Next up
- **Agent:** P7-T43 (Unsaved-changes guard: stable guardLeave, menu focus return, mobile Sheet).

## Waiting on you
- P7-H4: should an ended appointment that is already Cancelled stay frozen? Not blocking.

## Open suggestions (non-blocking review notes)
- Logged to docs/BACKLOG.md this session: contacts list error has no way back to page 1 and keeps hidden rows selected (P7-T37); ContactPicker's same-batch assumption in `useHeldValue` (P7-T40).
- Cosmetic, not logged: team/page.tsx types metadata as `Metadata` while /settings does not (align in P9-T03); smoke.spec.ts:66-68 comment overstates the prefetch 404; button.tsx JSDoc "There `role="button"` is right" could read "In both cases"; select-a11y "Contacts toolbar" test title and a redundant `toHaveAccessibleName`.

## Blockers
- None.
