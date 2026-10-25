# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.
> Since 2026-10-25 the build may also run from Hermes Agent, which has no `Workflow` tool: the orchestrator follows `.claude/workflows/build-phase.js` step by step with helper agents (implementer, then verifier + reviewer in parallel, up to 2 fix rounds) and does the recorder steps itself.

## Now
- **Phase:** P8 Automation — active (P7 merged to GitHub `master` via PR #2 on 2026-10-25; local `master` fast-forwarded to it).
- **Branch:** `phase/p8-automation`, cut from `master` at `584f50e`.
- **Status:** P8-T01 (registry), P8-T02 (layout) and P8-T03 (list page) done under Autopilot.

## Last change
- P8-T03: `/automation` lists the 8 automations in 5 folders (read-only cards: name, description, lifecycle status "Live" / "In development" / "Paused by the developer", trigger sentence, owner name) with a "Request an automation" link to a placeholder `/automation/requests` page (P8-T08 replaces it).
- One review round: the request link 404'd (now a placeholder page, as P7-T42 did for Team) and the automations alert's Retry left the owners/tags reads failed (now re-reads them, "one fault, one alert"). Both fixed with e2e that went red first.
- Verify: `npm run check` green (884 Vitest), 41 e2e passed (automation-list, smoke, calendars-load-errors), react-table 8.21.3. Screenshots checked at 1440px light/dark and 375px.

## Next up
- P8-T04 Detail page with the step list (`/automation/[id]`, `generateStaticParams()` from the registry; confirm a broken definition still fails the build).
- P8-T05 (diagram): also reject a repeated branch id within one fork (BACKLOG).

## Waiting on you (owner)
- Nothing blocking. Optional: the four automations whose old seed was random got fixed triggers and waits (DECISIONS.md [P8-T01], "Fixed choices"), and the list's status wording ([P8-T03]); change either if you prefer.

## Open suggestions (non-blocking)
- P8-T01..T03 review tidy-ups are in `docs/BACKLOG.md` (unique slugs and tag names, branch-id check, channel typing, small test/comment cleanups).
- Calendar ids, pipeline/stage ids and `templateId` are still id-typed in authored configs; they need stable keys before any definition uses them.

## Blockers
- None.
