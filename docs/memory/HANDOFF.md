# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.
> Since 2026-10-25 the build may also run from Hermes Agent, which has no `Workflow` tool: the orchestrator follows `.claude/workflows/build-phase.js` step by step with helper agents (implementer, then verifier + reviewer in parallel, up to 2 fix rounds) and does the recorder steps itself.

## Now

- **Phase:** P10 Polish — active, 5/7 tasks done.
- **Branch:** `phase/p10-polish`, cut from `master` at `72f8362` (P9 merged as PR #6). Pushed to `origin/phase/p10-polish` up to P10-T04; P10-T05 is local only. No PR yet: open it after the P10 gate. Merge after the P10 gate.
- **Status:** P10-T05 in review. Next: P10-T06 Load the seed lazily.

## Last change

- P10-T05 Cleanup from the Phase 5 review (no behaviour change): conversation star/archive go through one `setFlag` in `src/lib/api/conversations.ts`, and the thread header's toggles share `saveFlag`; the conversation-then-contact reads are one hook, `useConversationContact`, used by the thread pane and the contact panel; a call entry's icon/label/duration come from the pure `callKind()` (`call-kind.ts`); the unused inbox `assigneeId` filter is gone.
- Verify: `npm run check` green (1471 Vitest, 13 new characterisation tests that also pass on the old code); conversation-touching e2e plus smoke, a11y, keyboard, palette 190/190, no e2e file changed. Review: approved, no must-fixes.

## Next up

- P10-T06 Load the seed lazily (measure `/dashboard` first-load JS before and after), P10-T07 README, then the P10 gate.

## Waiting on you (owner)

1. OPTIONAL, reversible: the board's same-column drag now lands where the preview shows (from P10-T04).
2. OPTIONAL, reversible: light-mode grey text and the red Delete colour are a little darker, for readability (from P10-T04).

## Open suggestions (non-blocking)

- `docs/BACKLOG.md` holds the P8/P9 leftovers and the P10-T01..T05 review leftovers (P10-T05: no test covers the thread header's Archive toast/Undo flow).
- Calendar ids, pipeline/stage ids and `templateId` are still id-typed in authored configs.

## Blockers

- None.
