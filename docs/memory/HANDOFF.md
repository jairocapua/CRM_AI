# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.
> Since 2026-10-25 the build may also run from Hermes Agent, which has no `Workflow` tool: the orchestrator follows `.claude/workflows/build-phase.js` step by step with helper agents (implementer, then verifier + reviewer in parallel, up to 2 fix rounds) and does the recorder steps itself.

## Now
- **Phase:** P8 Automation — active (P7 merged to GitHub `master` via PR #2 on 2026-10-25; local `master` fast-forwarded to it).
- **Branch:** `phase/p8-automation`, cut from `master` at `584f50e`.
- **Status:** P8-T01 (registry), P8-T02 (layout), P8-T03 (list page) and P8-T04 (detail page) done under Autopilot.

## Last change
- P8-T04: `/automation/[id]` (prerendered for all 8 ids via `generateStaticParams()`) shows the header, status, Details (trigger, owner, folder, source file), "How this behaves", and a nested step list with labelled branches and End markers. List cards link to it by name. `Workflow.slug` and `RunStepStatus` were added.
- One review round: the page's error handling had no test (now two e2e, both red-proved); summaries are no longer clamped; nested-fork unit test; `stepSummary` is exhaustive.
- Verify: `npm run check` green (922 Vitest), 23 e2e passed (automation-detail, automation-list, smoke), react-table 8.21.3. Screenshots checked at 1440px and 375px.

## Next up
- P8-T05 Read-only diagram (React Flow at >= 768px in the slot comment in `automation-detail.tsx`; also reject a repeated branch id within one fork, and add a diagram placeholder to the detail skeleton — both in BACKLOG).

## Waiting on you (owner)
- Nothing blocking. Optional: the four automations whose old seed was random got fixed triggers and waits (DECISIONS.md [P8-T01], "Fixed choices"), and the list's status wording ([P8-T03]); change either if you prefer.

## Open suggestions (non-blocking)
- P8-T01..T04 review tidy-ups are in `docs/BACKLOG.md` (unique slugs and tag names, branch-id check, channel typing, page title, typegen before tsc, small test/comment cleanups).
- Calendar ids, pipeline/stage ids and `templateId` are still id-typed in authored configs; they need stable keys before any definition uses them.

## Blockers
- None.
