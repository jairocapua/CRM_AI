# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.
> Since 2026-10-25 the build may also run from Hermes Agent, which has no `Workflow` tool: the orchestrator follows `.claude/workflows/build-phase.js` step by step with helper agents (implementer, then verifier + reviewer in parallel, up to 2 fix rounds) and does the recorder steps itself.

## Now
- **Phase:** P8 Automation — active, 6/8 tasks done (P7 merged to GitHub `master` via PR #2 on 2026-10-25; local `master` fast-forwarded to it).
- **Branch:** `phase/p8-automation`, cut from `master` at `584f50e`. Nothing pushed.
- **Status:** P8-T06 done (`97e70cd`) under Autopilot; P8-T07 next.

## Last change
- P8-T06: run history data. `WorkflowRun` / `WorkflowRunStep` / `RunStatus` types (step status = `RunStepStatus`); a `workflowRuns` table filled by `seedWorkflowRuns`, appended last in `buildDb()` and walking the real registry layouts (97 runs; drafts none; all four statuses). `SEED_VERSION` 6. Contact delete sweeps runs; `"workflowRuns"` cache key in both places; three new integrity lines; `api.workflows.listRuns(workflowId, query)`. The fake `Workflow.stats` / `WorkflowNode.stats` counters are deleted.
- Review: deep, approved with no must-fix; leftovers in `docs/BACKLOG.md`.
- Verify: `npm run check` green (962 Vitest), 38 e2e passed (automation-list, -detail, -diagram, smoke, fixture), react-table 8.21.3, tracker OK.

## Next up
- P8-T07 Run history UI (light review): `DataTable` of `listRuns` on the detail page, a run sheet reusing `AutomationStepList`'s `statuses` prop, contact links. Reviewer notes for it: add a `workflowRuns` fault shape `{ has: ["workflowId","contactId","steps","startedAt"] }` to `e2e/calendar-helpers.ts`; Speed to Lead has dropped runs whose skipped "Replied?" fork step says "Stopped: the contact replied", which reads oddly in a sheet — give forks another reason.
- Then P8-T08 automation requests (replaces the placeholder `/automation/requests` page in place), then the P8 gate.

## Waiting on you (owner)
- Nothing blocking. Optional: the fixed triggers/waits for four automations (DECISIONS [P8-T01], "Fixed choices") and the list's status wording ([P8-T03]); change either if you prefer.

## Open suggestions (non-blocking)
- `docs/BACKLOG.md` holds P8-T01..T06 leftovers: unique slugs/tag names in the API, channel typing, detail page title, `next typegen` before `tsc` on a fresh clone, React Flow's hard-coded `role="application"`, UTC clock-time waits in seeded runs, small test/comment tidy-ups.
- Calendar ids, pipeline/stage ids and `templateId` are still id-typed in authored configs; they need stable keys before any definition uses them.

## Blockers
- None.
