# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.
> Since 2026-10-25 the build may also run from Hermes Agent, which has no `Workflow` tool: the orchestrator follows `.claude/workflows/build-phase.js` step by step with helper agents (implementer, then verifier + reviewer in parallel, up to 2 fix rounds) and does the recorder steps itself.

## Now

- **Phase:** P9 Settings — active, 1/7 tasks done.
- **Branch:** `phase/p9-settings`, cut from `master` at `4d72e89`. Nothing pushed.
- **Status:** P9-T01 approved (`7baaca8`); P9-T02 Settings shell, profile and business is next.

## Last change

- P9-T01 Settings API fixes: `pipelines.removeStage` is one simulated write (404 unknown pipeline/stage, 409 last stage; deals join the neighbouring column); `pipelines.remove` sweeps deals through the deal cascade (409 last pipeline, default handed on); `users.remove(id, { reassignTo })` hands owners, assignees, calendar seats and private smart lists to the current user by default, and refuses removing yourself or anyone an automation names; `customFields.remove` clears stored values on its own object type. `integrityReport()` gained 10 lines (user references, orphaned custom values).
- Reviewer: approve, no must-fix. `npm run check` green (1086 Vitest); smoke + deal-form + fixture e2e 30/30; react-table 8.21.3.

## Next up

- P9-T02 (light, UI): `/settings` section layout, Profile and Business forms, links to Team, Custom fields, Pipelines, Tags, Demo Data.
- The P9-T01 review left API holes for the UI tasks; they are written into the scope of P9-T03 (users.update ignores `slug`; the reassign e2e needs an invited member), P9-T04 (duplicate custom-field keys; `update` ignores `key`/`objectType`) and P9-T05 (`reorderStages` must get every stage; single-write stage edits; reset days-in-stage on moved deals).

## Waiting on you (owner)

- Nothing blocking.
- Optional, reversible (DECISIONS [P9-T01]): removing a teammate reassigns their records to you; removing yourself or a teammate an automation names is refused. Today that means only invited teammates can be removed, since every seeded teammate owns an automation.

## Open suggestions (non-blocking)

- `docs/BACKLOG.md` holds P8 leftovers, P8 gate suggestions and the P9-T01 review leftovers (double-booked reassigned appointments, smart-list filter values naming a removed user).
- Calendar ids, pipeline/stage ids and `templateId` are still id-typed in authored configs; they need stable keys before any definition uses them.

## Blockers

- None.
