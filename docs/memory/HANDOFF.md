# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`, gate failed)
- **Branch:** `phase/p7-calendars`
- **Status:** P7 gate failed; two fix tasks added.

## Last change
- P7 gate run: 'zero console errors across all routes' unproven for /settings/demo-data (no e2e visits it).
- Review must-fix: update({ pipelineId }) in src/lib/api/opportunities.ts:96/:378 can leave a stageId from the old pipeline (orphan stage).

## Next up
- P7-T57 Gate fix: smoke-test /settings/demo-data (e2e/smoke.spec.ts).
- P7-T58 Gate fix: update() pipelineId leaves orphan stageId (+ red Vitest via integrityReport()).
- Then rerun the P7 gate. Next step: "run the build-phase workflow".

## Waiting on you
- Nothing; agent tasks queued.

## Open suggestions (non-blocking review notes)
- P7-T56: name the two 409 strings as constants; e2e assert old text count 0.
- P7-T55: comment why double rAF + 50 ms wait suffices.
- P7-T54: assert toBeChecked()/toHaveValue after fills.
- P7-T53: ref to ComboboxChipsInput instead of data-slot query.
- Pre-existing React Compiler lint warnings (3): data-table.tsx:55, contact-form-sheet.tsx:183, opportunity-form-sheet.tsx:145.

## Blockers
- None.
