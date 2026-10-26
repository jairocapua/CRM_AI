# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.
> Since 2026-10-25 the build may also run from Hermes Agent, which has no `Workflow` tool: the orchestrator follows `.claude/workflows/build-phase.js` step by step with helper agents (implementer, then verifier + reviewer in parallel, up to 2 fix rounds) and does the recorder steps itself.

## Now

- **Phase:** P10 Polish — active, 6/7 tasks done.
- **Branch:** `phase/p10-polish`, cut from `master` at `72f8362` (P9 merged as PR #6). Pushed to `origin/phase/p10-polish` up to P10-T04; P10-T05 and P10-T06 are local only. No PR yet: open it after the P10 gate. Merge after the P10 gate.
- **Status:** P10-T06 in review. Next: P10-T07 README, then the P10 gate. Start it in a fresh session.

## Last change

- P10-T06 Load the seed lazily: the seed builder and faker are their own chunk, fetched only on a boot with no seeded workspace (first run, or the first load after a clear) and on reseed. `/dashboard` JS (Next 16's build no longer prints sizes, so summed from the browser on `next start`): 2401.9 KiB (782.9 gzip) before, 1945.3 KiB (614.8 gzip) on a seeded load after; a first run still fetches the ~458 KiB seed chunk while booting. A reseed whose chunk cannot load now toasts "Could not load the demo data. Check your connection and try again." and keeps the data. The test helper `settle()` also waits out real I/O, with a 1 s real-time deadline.
- Verify: `npm run check` green (1477 Vitest); full e2e 436/436; new `e2e/seed-lifecycle.spec.ts` (first run, reload, reseed, clear, reseed failure) 9/9 over 3 repeats. Review: two must-fixes (settle's wait budget, the silent reseed failure), fixed in one round with red-proven tests.
- P10-T05 (`fdb2de6`): Conversations cleanup from the Phase 5 review, no behaviour change.

## Next up

- P10-T07 README, then the P10 gate (full check + full e2e + gate review against local `master`).

## Waiting on you (owner)

1. OPTIONAL, reversible: the board's same-column drag now lands where the preview shows (from P10-T04).
2. OPTIONAL, reversible: light-mode grey text and the red Delete colour are a little darker, for readability (from P10-T04).

## Open suggestions (non-blocking)

- `docs/BACKLOG.md` holds the P8/P9 leftovers and the P10-T01..T06 review leftovers (P10-T06: no e2e for a seed chunk failing at boot; two full-run socket flakes).
- Calendar ids, pipeline/stage ids and `templateId` are still id-typed in authored configs.

## Blockers

- None.
