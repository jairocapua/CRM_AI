# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.
> Since 2026-10-25 the build may also run from Hermes Agent, which has no `Workflow` tool: the orchestrator follows `.claude/workflows/build-phase.js` step by step with helper agents (implementer, then verifier + reviewer in parallel, up to 2 fix rounds) and does the recorder steps itself.

## Now
- **Phase:** P8 Automation — active (P7 merged to GitHub `master` via PR #2 on 2026-10-25; local `master` fast-forwarded to it).
- **Branch:** `phase/p8-automation`, cut from `master` at `584f50e`.
- **Status:** P8-T01 (registry) and P8-T02 (deterministic layout) done under Autopilot.

## Last change
- P8-T02: `src/lib/automations/layout.ts` lays out each automation as a tree (column spans measured bottom-up, 324px pitch, 130px rows) and emits a 120×40 `end` pill at every path's end. `LAYOUTS` is computed when the registry loads, so a malformed definition fails `next build`. `api.workflows` serves copies of it. The integrity report gained a box-overlap check.
- Verify: `npm run check` green (858 Vitest), smoke e2e 10/10, react-table 8.21.3, tracker OK. Review: approve, no must-fix.

## Next up
- P8-T03 Automation list page (`/automation`, grouped by folder; e2e: 8 automations in 5 folders, each with trigger and owner).
- When P8-T04 adds `/automation/[id]`, give it `generateStaticParams()` from the registry ids (design §3) and confirm a broken definition still fails the build.
- P8-T05 (diagram): also reject a repeated branch id within one fork (BACKLOG row from the P8-T02 review).

## Waiting on you (owner)
- Nothing blocking. Optional: the four automations whose old seed was random got fixed triggers and waits (DECISIONS.md [P8-T01], "Fixed choices"); change them if you prefer others.

## Open suggestions (non-blocking)
- P8-T02 and P8-T01 review tidy-ups are in `docs/BACKLOG.md` (unique slugs and tag names, branch-id check, small test/comment cleanups).
- Calendar ids, pipeline/stage ids and `templateId` are still id-typed in authored configs; they need stable keys before any definition uses them.

## Blockers
- None.
