# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`, gate failed; fix tasks in progress)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T57 in review.

## Last change
- P7-T57: e2e/smoke.spec.ts now smoke-tests /settings/demo-data (title, no skeleton, h1 in main).
- `npm run check` green; `npm run e2e` 140 passed with the auto console fixture. No app code changed.

## Next up
- P7-T58 Gate fix: update() pipelineId leaves orphan stageId (+ red Vitest via integrityReport()).
- Then rerun the P7 gate.

## Waiting on you
- Review of P7-T57 (approve or rework).

## Open suggestions (non-blocking review notes)
- P7-T57: reword routeHeading doc comment (smoke.spec.ts:20-26) to "the route's page h1 inside <main>".
- P7-T57: table of off-nav routes ({ url, title, heading }) sharing one loop.
- P7-T57: demo-data title 'Demo Data' vs h1 'Demo data' casing could be unified (cosmetic).
- P7-T56: name the two 409 strings as constants; e2e assert old text count 0.
- P7-T55: comment why double rAF + 50 ms wait suffices.
- P7-T54: assert toBeChecked()/toHaveValue after fills.
- P7-T53: ref to ComboboxChipsInput instead of data-slot query.
- Pre-existing React Compiler lint warnings (3): data-table.tsx:55, contact-form-sheet.tsx:183, opportunity-form-sheet.tsx:145.

## Blockers
- None.
