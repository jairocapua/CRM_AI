# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T02 in review.

## Last change
- P7-T02: Playwright harness (`playwright.config.ts`, `e2e/fixtures.ts`, `e2e/smoke.spec.ts`, `e2e/fixture.spec.ts`); `npm run e2e` = 15 passed headless.
- e2e runs `next build && next start -p 3100 -H 127.0.0.1`, so it coexists with `npm run dev` on 3000 (verified once).
- Fixture waits for boot, fails on the could-not-start screen and on any console error / hydration message / pageerror; clears localStorage once per test.
- Added P7-T10 (document the Playwright browser install).

## Next up
- **Agent:** P7-T03 (once P7-T02 is approved).

## Waiting on you
- Review of P7-T02 (`git show HEAD`).
- P7-H1: update CLAUDE.md Commands (check pipeline, plus `npm run e2e`).

## Open suggestions (non-blocking review notes)
- Smoke spec: also assert the page heading or `main` content is visible; title and zero skeletons are true for an empty page.
- Teardown checks console problems the moment the test returns; late effects (250ms persist debounce) may slip past. Consider a short settle.
- Dev-mode coverage alternative: env-driven `distDir` (e.g. `.next-e2e`) would let a second `next dev` run; note it in the config comment.
- `playwright.config.ts` in the rules-of-hooks override is a no-op; narrow to `e2e/**`.
- Storage clearing and console watching apply only to the `page` fixture; `context.newPage()` gets neither. Note it in fixtures.ts.
- Do not run `npm run check`/`build` while `npm run e2e` runs (shared .next).
- Calendar specs (T05/T06) should pin `timezoneId` and `locale` via test.use.
- An aborted e2e run on Windows can leave `next start` on 3100; kill it or set E2E_REUSE_SERVER=1.
- The concurrent-with-dev check was not re-run in the fix round (config unchanged); `.next/dev/lock` release after force-stopping dev not checked.
- Carried from P7-T01: settle() fires the persist debounce; restrict `@/lib/mock/testing`/vitest imports to tests; widen Vitest include for .test.tsx; seed negative control; per-day oracle over `messages.sentAt`; `seededWorld(now)` param; Vite 7 engines vs node >=20.9.

## Blockers
- None.
