# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.
> Since 2026-10-25 the build may also run from Hermes Agent, which has no `Workflow` tool: the orchestrator follows `.claude/workflows/build-phase.js` step by step with helper agents (implementer, then verifier + reviewer in parallel, up to 2 fix rounds) and does the recorder steps itself.

## Now
- **Phase:** P8 Automation — active, 8/8 tasks done; phase gate next (P7 merged to GitHub `master` via PR #2 on 2026-10-25; local `master` fast-forwarded to it).
- **Branch:** `phase/p8-automation`, cut from `master` at `584f50e`. Nothing pushed.
- **Status:** P8-T08 done (`f5bfd5f`) under Autopilot; all P8 tasks done, phase gate next.

## Last change
- P8-T08: `/automation/requests` replaced its placeholder with a "New request" form (title, problem, trigger, outcome, priority; RHF + zod) beside a list of requests showing a read-only status badge, priority, who asked and when, the developer's reply and, for shipped ones, a link to the automation. New `AutomationRequest` type, `automationRequests` table (six seeded requests, seeded last), `api.automationRequests` (list/get/create/setStatus/remove), an integrity line for a request pointing at a missing automation, `SEED_VERSION` 7. Staff cannot change status or delete; the developer owns status.
- Review: deep, approved with no must-fix; leftovers in `docs/BACKLOG.md`.
- Verify: `npm run check` green (1030 Vitest), 48 e2e passed, new spec stable over 3 repeats, react-table 8.21.3. Screenshots checked: desktop, phone, dark, validation errors.

## Next up
- P8 phase gate: full `npm run e2e` plus a gate review against local `master`.

## Waiting on you (owner)
- Nothing blocking. Optional: the fixed triggers/waits for four automations (DECISIONS [P8-T01], "Fixed choices"), the list's status wording ([P8-T03]), and whether staff should be able to withdraw their own automation requests ([P8-T08]: today only the developer changes status).

## Open suggestions (non-blocking)
- `docs/BACKLOG.md` holds P8-T01..T08 leftovers: unique slugs/tag names in the API, channel typing, detail page title, `next typegen` before `tsc` on a fresh clone, React Flow's hard-coded `role="application"`, UTC clock-time waits in seeded runs, DataTable `aria-sort`, a run status filter, a seeded request dated after its automation's first runs, one flaky-under-load fixture test.
- Calendar ids, pipeline/stage ids and `templateId` are still id-typed in authored configs; they need stable keys before any definition uses them.

## Blockers
- None.
