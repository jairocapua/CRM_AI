# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.
> Since 2026-10-25 the build may also run from Hermes Agent, which has no `Workflow` tool: the orchestrator follows `.claude/workflows/build-phase.js` step by step with helper agents (implementer, then verifier + reviewer in parallel, up to 2 fix rounds) and does the recorder steps itself.

## Now

- **Phase:** P10 Polish — active, 2/7 tasks done.
- **Branch:** `phase/p10-polish`, cut from `master` at `72f8362` (P9 merged as PR #6). Not pushed yet.
- **Status:** P10-T02 approved (`ee76c44`). Next: P10-T03 Responsive pass at 375px. Start it in a fresh session.

## Last change

- P10-T02 Loading and error audit: Dashboard cards and Conversations (inbox, thread, contact panel) now show `LoadError` alerts with Retry ("one fault, one alert"); the Opportunities board alerts instead of an endless skeleton or empty board; contact page panels alert instead of "No tasks yet."; failed contact/deal saves, deletes and bulk actions toast `errorMessage(...)` and keep input; route error boundaries `(app)/error.tsx` + `global-error.tsx`. `LoadError` moves focus to the loaded region after a Retry that works and announces "Still could not load after N tries." after one that fails. The contact and deal sheets keep typed values when their custom fields load late (`keepDirtyValues`). Reads keep `canFail: false`.
- Verify: `npm run check` green (1409 Vitest); full e2e 326/327 (the one failure `ERR_NO_BUFFER_SPACE` in settings-shell, 30/30 alone); `loading-error-audit.spec.ts` 108/108 over 3 repeats. Review: three missing error-path e2e tests and three small fixes, all done in one fix round.
- P10-T01 (`3092a10`): command palette (Ctrl+K / ⌘K).

## Next up

- P10-T03 Responsive pass at 375px (sidebar→Sheet, panes stack, board scroll-snaps). The header Search button is `hidden sm:flex` (P10-T01 left mobile to this task): give phones a way to open the palette.

## Waiting on you (owner)

1. OPTIONAL, reversible: the palette action reads "New contact" while the contacts page says "Add contact".
2. OPTIONAL try-out: `npm run dev`, open http://localhost:3000 → Settings › Demo data → raise latency to see skeletons, or failure rate to 100% and save a contact to see the error toast (your typing stays).

## Open suggestions (non-blocking)

- `docs/BACKLOG.md` holds the P8/P9 leftovers and the P10-T01/T02 review leftovers (contact/deal delete dialogs have no close guard; inline `instanceof ApiError` sites to migrate to `errorMessage`; a `waitForTimeout` in the audit spec).
- Calendar ids, pipeline/stage ids and `templateId` are still id-typed in authored configs.

## Blockers

- None.
