# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T01 in review.

## Last change
- P7-T01: Vitest 4.1 harness (`vitest.config.mts`, `vitest.setup.ts`, `src/lib/mock/testing.ts`) and 77 tests over clock, query engine, opportunities, seed and analytics.
- `npm run check` now runs format:check, lint, typecheck, test, test:scripts, build; green.
- Reconcile test fails 12-13 tests when the Phase 6 analytics fix is reverted; clock anchor test fixed in round 1.
- vite pinned to ^7.3.7 to dodge an npm 10.9.4 crash; lockfile only adds packages.

## Next up
- **Agent:** P7-T02 (once P7-T01 is approved).

## Waiting on you
- Review of P7-T01 (`git show HEAD`).
- P7-H1: update CLAUDE.md Commands for the new check pipeline.

## Open suggestions (non-blocking review notes)
- `settle()` fires any next timer, including the 250ms persist debounce after seeding; document it or clear timers after seeding.
- Restrict `@/lib/mock/testing` and `vitest` imports to `*.test.ts` / `vitest.setup.ts` via ESLint.
- Widen `include` to `.test.tsx` plus a jsdom project when component tests arrive.
- Seed negative control relies on `tasks.updatedAt`; assert a non-empty offender object instead.
- Run the per-day local-date oracle over `messages.sentAt` too (the KPI that actually broke in P6).
- `seededWorld(now = REF_DATE)` parameter would remove the duplicate seeding in the clock test.
- Vite 7.3.7 engines (node ^20.19 || >=22.12) are stricter than repo's node >=20.9; dev tooling only.
- Lockfile diff is large and generated; review package.json and `npm ls` instead.

## Blockers
- None.
