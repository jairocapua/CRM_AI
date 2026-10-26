# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.
> Since 2026-10-25 the build may also run from Hermes Agent, which has no `Workflow` tool: the orchestrator follows `.claude/workflows/build-phase.js` step by step with helper agents (implementer, then verifier + reviewer in parallel, up to 2 fix rounds) and does the recorder steps itself.

## Now

- **Phase:** P10 Polish — active, 4/7 tasks done.
- **Branch:** `phase/p10-polish`, cut from `master` at `72f8362` (P9 merged as PR #6). Pushed to `origin/phase/p10-polish` (P10-T01..T04). No PR yet: open it after the P10 gate. Merge after the P10 gate.
- **Status:** P10-T04 approved (`d84c30a`). Next: P10-T05 Cleanup from the Phase 5 review. Start it in a fresh session.

## Last change

- P10-T04 Keyboard and accessibility: `@axe-core/playwright` scans all 20 routes in light and dark mode plus the palette, form sheets and phone sidebar, with no serious or critical violations (light `--muted-foreground` and `--destructive` darkened; closed deals and cancelled appointments tinted/dashed instead of faded; names for combobox, slider and icon controls). Deal cards have a keyboard drag control (Space, arrows, Space; Escape cancels) with announcements naming the deal, stage and position among the cards shown; same-column drops now land where the preview shows. The thread has an `h1`; the phone sidebar has no rail. New specs: `a11y`, `board-keyboard`, `keyboard` (tab-through, focus return, settings-nav scroll); shared `e2e/routes.ts`.
- Verify: `npm run check` green (1458 Vitest); full e2e 433/433; board-keyboard + responsive 114/114 over 3 repeats. Review: three must-fixes (same-column drop e2e, announced positions counting hidden deals, a stale route flag), fixed in one round with red-proven tests.
- P10-T03 (`f9da554`): responsive pass at 375px.

## Next up

- P10-T05 Cleanup from the Phase 5 review (behaviour must not change; Conversations e2e unchanged), then P10-T06 lazy seed, P10-T07 README, then the P10 gate.

## Waiting on you (owner)

1. OPTIONAL, reversible: the board's same-column drag now lands where the preview shows (before, moving a card down one place did nothing, and dropping it on itself sent it to the bottom).
2. OPTIONAL, reversible: light-mode grey text and the red Delete colour are a little darker, for readability.
3. OPTIONAL try-out: `npm run dev`, open http://localhost:3000/opportunities, press Tab until a deal card shows a ring, Space, arrow keys, Space.

## Open suggestions (non-blocking)

- `docs/BACKLOG.md` holds the P8/P9 leftovers and the P10-T01..T04 review leftovers (P10-T04: touch swipe on deal cards, a visible drag hint for keyboard users, two `h1`s on the wide thread page).
- Calendar ids, pipeline/stage ids and `templateId` are still id-typed in authored configs.

## Blockers

- None.
