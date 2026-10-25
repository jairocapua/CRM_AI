# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.
> Since 2026-10-25 the build may also run from Hermes Agent, which has no `Workflow` tool: the orchestrator follows `.claude/workflows/build-phase.js` step by step with helper agents (implementer, then verifier + reviewer in parallel, up to 2 fix rounds) and does the recorder steps itself.

## Now
- **Phase:** P8 Automation — active, 5/8 tasks done (P7 merged to GitHub `master` via PR #2 on 2026-10-25; local `master` fast-forwarded to it).
- **Branch:** `phase/p8-automation`, cut from `master` at `584f50e`. Nothing pushed.
- **Status:** P8-T01..T05 done under Autopilot in one session (registry, layout, list page, detail page, diagram). Session handed off for a fresh one.

## Last change
- P8-T05: `/automation/[id]` shows a read-only React Flow diagram above the step list on screens 768px and wider (lazy-loaded; phones never download it). Wheel scrolls the page, no zoom-on-scroll; 9 nodes for Speed to Lead with no overlaps; follows dark mode through the `--xy-*` bridge in `globals.css`. Layout now rejects a repeated branch id within one fork.
- One deep review round: `disableKeyboardA11y` (React Flow's "arrow keys to move / delete" screen-reader text was announced on a read-only diagram), memoised step names, a phone-never-downloads e2e, a closer skeleton height.
- Verify: `npm run check` green (937 Vitest), 29 e2e passed (automation-diagram, -detail, -list, smoke), diagram spec stable over 3 repeats, react-table 8.21.3. Screenshots checked light and dark.

## Next up
- P8-T06 Run history data (deep review; `WorkflowRun` / `WorkflowRunStep` types, design "Phase 8b"). `WorkflowRunStep.status` must use the existing `RunStepStatus` (DECISIONS [P8-T04]). Then T07 run history UI (reuse `AutomationStepList`'s `statuses` prop) and T08 requests (replaces the placeholder `/automation/requests` page in place).
- Start it in a fresh session: "Autopilot: continue the build per CLAUDE.md".

## Waiting on you (owner)
- Nothing blocking. Optional: the fixed triggers/waits for four automations (DECISIONS [P8-T01], "Fixed choices") and the list's status wording ([P8-T03]); change either if you prefer.

## Open suggestions (non-blocking)
- `docs/BACKLOG.md` holds P8-T01..T05 leftovers: unique slugs/tag names in the API, channel typing, detail page title, `next typegen` before `tsc` on a fresh clone, React Flow's hard-coded `role="application"`, small test/comment tidy-ups.
- Calendar ids, pipeline/stage ids and `templateId` are still id-typed in authored configs; they need stable keys before any definition uses them.

## Blockers
- None.
