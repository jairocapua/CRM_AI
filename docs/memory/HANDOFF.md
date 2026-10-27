# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.
> Since 2026-10-25 the build may also run from Hermes Agent, which has no `Workflow` tool: the orchestrator follows `.claude/workflows/build-phase.js` step by step with helper agents (implementer, then verifier + reviewer in parallel, up to 2 fix rounds) and does the recorder steps itself.

## Now

- **Phase:** P10 Polish — active, 7/7 tasks done; the P10 gate is next.
- **Branch:** `phase/p10-polish`, cut from `master` at `72f8362` (P9 merged as PR #6). Pushed to `origin/phase/p10-polish` up to P10-T04; P10-T05..T07 are local only. No PR yet: open it after the P10 gate. Merge after the P10 gate.
- **Status:** P10-T07 in review. Next: the P10 gate.

## Last change

- P10-T07 README and demo walkthrough: `README.md` replaces the create-next-app stub. It covers what Nimbus is, how to run it, tests and checks, the API seam and the backend migration steps, automations as code, the Settings → Demo data controls, and a 5-minute walkthrough of seven screens.
- Verify: every README command ran as written. `npm install`, `npm test` (1477), `npm run lint`, `npm run check` green, `npm start` and `npm run dev` served `/dashboard`, `npm run e2e:install`, `npm run e2e` 436/436, `npm run format` changed nothing. Review: five fact fixes applied (Demo data label, 7d/90d not the already-selected 30d, contacts need first and last name, migration must move the re-exported types and clock before deleting `src/lib/mock/`, PROGRESS.md may be hand-edited then `--check`).

## Next up

- The P10 gate: full check + full e2e + gate review against local `master`.

## Waiting on you (owner)

1. OPTIONAL, reversible: the board's same-column drag now lands where the preview shows (from P10-T04).
2. OPTIONAL, reversible: light-mode grey text and the red Delete colour are a little darker, for readability (from P10-T04).
3. OPTIONAL: CLAUDE.md lines 32-34 say rewriting `http.ts` alone is the whole backend migration; the README has the accurate steps. CLAUDE.md is protected, so say the word and I'll fix it while you approve the edit (BACKLOG row from P10-T07).

## Open suggestions (non-blocking)

- `docs/BACKLOG.md` holds the P8/P9 leftovers and the P10-T01..T07 review leftovers.
- Calendar ids, pipeline/stage ids and `templateId` are still id-typed in authored configs.

## Blockers

- None.
