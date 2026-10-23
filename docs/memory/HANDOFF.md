# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T43–T48 approved (Autopilot review, 2026-10-24). P7-T48 was approved with `progress.mjs set`, so no task is running. P7-T49 is next. Session handed off to a fresh one after 6 approvals, per CLAUDE.md.

## Last changes (this session)
- P7-T43: unsaved-changes guard: stable `guardLeave` (subject read from a ref), `{ onLeave, returnFocus }`; phone Sheet closes on real navigation; user-menu question returns focus to the trigger.
- P7-T44: book() checks the start's day in the calendar zone; out-of-range day is 422 INVALID_START, not RangeError.
- P7-T45: `null` removes expectedCloseAt / ownerId / lostReason on opportunities create()/update(); new `OpportunityPatch` type.
- P7-T46: opportunities create()/update() parse through one zod schema (allow-list); API-owned and unknown keys ignored; 422 for wrong types and non-object input; setStatus() writes through private `writeStatus()`; `withoutUndefined` moved to src/lib/api/patch.ts.
- P7-T47: /contacts shows "Could not load tags" + Retry when tags.list fails; TagPicker says "Could not load tags." with no options or Create.
- P7-T48: next + eslint-config-next 16.3.4 -> 16.4.3; `npm audit` 11 -> 0 (transitive: zod 4.6.7, shadcn 4.22.1, proxy-addr 2.0.8, express 5.3.0, sharp 0.35.5). spec.md next and shadcn rows updated.
- Gate green at 730 Vitest tests; e2e 122 passed.

## Next up
- **Agent:** P7-T49 (shared `userMenu(page)` e2e helper), then P7-T50 and P7-T51.
- P7-T50 (new, from the P7-T46 review): custom number fields use `Number.isFinite` so "Infinity"/"1e400" fail inline; setStatus() unknown-id 404 test; applyPatch "no cast" doc.
- P7-T51 scope now also carries the P7-T47 review notes: gate the tags alert on rows being on screen (contacts-table.tsx ~:175), a Retry inside TagPicker's empty state, and a comment that the "re-read keeps badges" e2e is a guard.

## Waiting on you
- P7-H4: should an ended appointment that is already Cancelled stay frozen? Not blocking.

## Open suggestions (non-blocking review notes)
- BACKLOG rows added this session: leave guard user menu inside the phone Sheet (P7-T43); negative years in book()'s INVALID_START message (P7-T44).
- P7-T46: `parse()` reports only the first zod issue; revisit if calendars ever returns all issues.
- spec.md table header date (2026-09-08) predates the P7-T48 re-verification of `next`.
- Pre-existing React Compiler lint warnings (3): data-table.tsx:55, contact-form-sheet.tsx:183, opportunity-form-sheet.tsx:145.

## Blockers
- None.
