# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.
> Since 2026-10-25 the build may also run from Hermes Agent, which has no `Workflow` tool: the orchestrator follows `.claude/workflows/build-phase.js` step by step with helper agents (implementer, then verifier + reviewer in parallel, up to 2 fix rounds) and does the recorder steps itself.

## Now

- **Phase:** P10 Polish — active, 3/7 tasks done.
- **Branch:** `phase/p10-polish`, cut from `master` at `72f8362` (P9 merged as PR #6). Pushed to `origin/phase/p10-polish` up to `f223ac6`; later commits are local. Merge after the P10 gate.
- **Status:** P10-T03 approved (`f9da554`). Next: P10-T04 Keyboard and accessibility.

## Last change

- P10-T03 Responsive pass at 375px: the audit found no route scrolling sideways (earlier phases already stacked conversations, put the sidebar in a Sheet below md and scrolled tables inside their card). New: an icon-only Search button on phones opens the command palette; the opportunities board snaps to columns below md, with snapping off while a card is dragged; the header separator is centred at every width. `e2e/responsive.spec.ts` checks all 20 routes at 375×812 (no sideways page scroll, main action on screen) plus the sidebar sheet, board snap, table scroller, conversation stacking and three form sheets.
- Verify: `npm run check` green (1409 Vitest); responsive + palette + board move + smoke + fixture 65/65; `responsive.spec.ts` 90/90 over 3 repeats. Review: one must-fix (snap during a drag), fixed with a red-proven e2e.

## Next up

- P10-T04 Keyboard and accessibility (deep). Its phase-file scope now lists the P10-T03 findings: the thread has no `h1`, `SidebarRail` duplicates the toggle inside the phone sidebar Sheet, keyboard/touch drag on the snapping board at 375px, and the settings nav's scroll-into-view claim needs an e2e.

## Waiting on you (owner)

1. OPTIONAL, reversible: phones get an icon Search button in the header; conversations on a phone show the inbox, then the thread full width with "Back to inbox".
2. OPTIONAL, reversible: the palette action reads "New contact" while the contacts page says "Add contact".

## Open suggestions (non-blocking)

- `docs/BACKLOG.md` holds the P8/P9 leftovers and the P10-T01/T02/T03 review leftovers (P10-T03: main-action checks measure the leftmost control; a thread sender line wraps at 375px).
- Calendar ids, pipeline/stage ids and `templateId` are still id-typed in authored configs.

## Blockers

- None.
