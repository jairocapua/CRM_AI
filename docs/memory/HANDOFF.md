# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.
> Since 2026-10-25 the build may also run from Hermes Agent, which has no `Workflow` tool: the orchestrator follows `.claude/workflows/build-phase.js` step by step with helper agents (implementer, then verifier + reviewer in parallel, up to 2 fix rounds) and does the recorder steps itself.

## Now
- **Phase:** P8 Automation — active (P7 merged to GitHub `master` via PR #2 on 2026-10-25; local `master` fast-forwarded to it).
- **Branch:** `phase/p8-automation`, cut from `master` at `584f50e`.
- **Status:** P8-T01 (authored types + automation registry) done under Autopilot.

## Last change
- P8-T01: the 8 automations are hand-written modules in `src/lib/automations/` (`AUTOMATIONS` keyed by slug, ids `wf_*`, deep-frozen). `api.workflows` now exports only `list()`/`get()` and resolves tag names and user slugs to ids at read time. The `workflows` store table and `seedWorkflows` are gone; `SEED_VERSION` is 5. Users gained a required `slug`.
- Integrity report: duplicate node ids, empty branches, and tag/user keys that no longer resolve. Demo Data counts show `automations: 8`.
- Verify: `npm run check` green (824 Vitest), smoke e2e 10/10, react-table 8.21.3, tracker OK. Review: approve, no must-fix.

## Next up
- P8-T02 Deterministic layout (`src/lib/automations/layout.ts`): replaces the interim one-column node positions in `api.workflows` and emits `end` nodes.

## Waiting on you (owner)
- Nothing blocking. Optional: the four automations whose old seed was random got fixed triggers and waits (see DECISIONS.md [P8-T01], "Fixed choices"); change them if you prefer others.

## Open suggestions (non-blocking)
- P8-T01: unique user slugs / tag names in the API; `vi.doUnmock` in settings.test.ts; `nowIso()` fallback in `api.workflows` lookups(). Both in `docs/BACKLOG.md`.
- Calendar ids, pipeline/stage ids and `templateId` are still id-typed in authored configs; they need stable keys before any definition uses them.
- P7 leftovers remain in `docs/BACKLOG.md`.

## Blockers
- None.
