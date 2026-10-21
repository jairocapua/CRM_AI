# Learnings

> **Append-only**, one line per lesson, newest at the bottom: `- YYYY-MM-DD [TASK-ID] lesson (why it matters)`.
> Read the last ~20 entries before starting a task. Never delete entries. If one becomes obsolete, strike it through (`~~…~~`) and add a note.
> CLAUDE.md "Non-obvious constraints" holds the standing rules; this file holds lessons that are narrower or newer. Entries tagged `[P3]`…`[P6]` were carried over from `docs/history/phases-0-6.md` when the tracker started.

- 2026-09-26 [P3] Base UI's `SelectValue` shows the raw value unless given a label-mapping render function; every status/source/owner/custom-field select needs one.
- 2026-09-26 [P4] Currency custom fields are stored in cents; a shared converter that writes them back raw turns $13,500 into $135. Convert at the form edge only.
- 2026-09-26 [P4] Controlling a combobox's `inputValue` blanks the selected item's label on edit; leave it uncontrolled unless searching needs it.
- 2026-09-26 [P4] Won deals live in the terminal stage; any "hide closed" filter must keep them or Closed Won reads `0 · $0`. Forecasts read live deals only (`isDeadDeal` in the API).
- 2026-09-26 [P4] Writing `stageId`/`status` through `update()` skips `move()` (position, `stageEnteredAt`) and `setStatus()` (`closedAt`, activity). Route stage and status changes through those two.
- 2026-09-26 [P5] Seed day-0 hours must count back from `REF_DATE`; a clock-hour draw on day 0 lands after the anchor ("seed writes the future"). Reuse the same draws so the faker stream is unchanged.
- 2026-09-26 [P5] Faker is seeded once and consumed in call order (`seed/index.ts`): append new seeders at the end of `buildDb()`; inserting or removing one shifts every later draw.
- 2026-09-26 [P6] Cut and bucket time windows on the same calendar: local midnight with UTC-date buckets drops today's bucket east of UTC. Assert `sum(series) === value`.
- 2026-09-26 [P6] Every analytics window ends at the demo "now"; without an upper bound future appointments count as held.
- 2026-09-26 [P6] A read must never call `nowIso()`: it advances the persisted clock high-water mark. Reads use `apiNow()`.
- 2026-09-26 [P6] Date inputs must read and write the local date; reading the UTC date moved Expected close back a day on every save east of UTC.
- 2026-09-26 [P6] Adding a `ResourceKey` means editing `cache.ts` twice: the union and the literal list in `invalidateAll()`. Missing the second makes reseed leave that screen stale.
- 2026-10-21 [bootstrap] `node --test scripts/` (a folder) fails on Node 22 here; use the glob `node --test "scripts/*.test.mjs"`.
- 2026-10-21 [bootstrap] `core.autocrlf=true` rewrites files with CRLF on branch switches, which fails Prettier's `format:check`; `.gitattributes` pins LF.
- 2026-10-21 [P7-T01] npm 10.9.4 crashes ('reading edgesOut') installing vitest 4 beside vite 8 (vite 8 -> @vitejs/devtools -> vitest@* peer loop). Install vite@^7 first, then vitest with --legacy-peer-deps, then a plain `npm install` to undo wrongly-set dev flags (react-is). Compare lockfile packages against HEAD.
- 2026-10-21 [P7-T01] Set TZ for tests via `process.env.TZ` at runtime (setup file or vi.stubEnv); an inline `TZ=` npm script fails under cmd.exe, and a shell $env:TZ did not reach the worker.
- 2026-10-21 [P7-T01] clock.ts captures sessionStart = Date.now() on load: install fake timers (after vi.resetModules) before importing clock users; import modules under test dynamically after freshModules()/seededWorld().
- 2026-10-21 [P7-T01] Vitest prints failure details to stderr: capture with `> file 2>&1`, not `2>&1 > file`.
- 2026-10-21 [P7-T01] Seeded KPIs at the anchor (reference only, tests avoid exact totals): Singapore 90-day newContacts 122, wonRevenue 137,450,000c, appointments 57, messages 806; today's messages bar 94 Singapore, 60 UTC, 11 Los Angeles.
- 2026-10-21 [P7-T01] Git Bash quoted heredocs here still collapsed doubled backslashes in a regex literal; build a backslash with String.fromCharCode(92) in throwaway scripts.
- 2026-10-21 [P7-T01] For mutation checks without touching source, use a vitest config that mergeConfigs the base and adds an `enforce: "pre"` transform plugin.
- 2026-10-21 [P7-T02] Playwright's fixture `use(...)` trips eslint-config-next's react-hooks/rules-of-hooks; turn the rule off for e2e/**.
- 2026-10-21 [P7-T02] Mock DB persist writes are debounced 250ms (db.ts debounceWrites): localStorage['nimbus-crm-db'] is null right after boot; e2e reads of persisted state need expect.poll.
- 2026-10-21 [P7-T02] On Windows, stopping a background `npm run dev`/`npm run start` leaves the child node process holding the port (3000/3100); find it with netstat and kill the PID.
- 2026-10-21 [P7-T02] With Turbopack's build cache the `next build` inside `npm run e2e` takes ~10s; a full e2e run is ~15-25s.
- 2026-10-21 [P7-T02] Playwright reports console.warn as type 'warning', not 'warn'; pageerror text reads 'pageerror: Error: <msg>' when built from error.stack.
- 2026-10-21 [P7-T02] about:blank and opaque-origin pages throw on storage access: an addInitScript touching storage needs a location.protocol check and try/catch.
- 2026-10-21 [P7-T02] `timeout: 0` on a Playwright expect means no timeout; for a one-shot check use locator.count().
- 2026-10-21 [P7-T03] @date-fns/tz installs its Date overrides when the module first evaluates; if that first import happens under vi.useFakeTimers (ClockDate global), TZDate silently reads runtime-local fields (right in UTC, a day off in Singapore). vitest.setup.ts preloads it while Date is real; it is external, so vi.resetModules keeps that copy.
- 2026-10-21 [P7-T03] new TZDate('YYYY-MM-DD', tz) parses the string as UTC midnight, not midnight in the zone. Build zone times from components: new TZDate(y, m-1, d, h, min, tz).
- 2026-10-21 [P7-T03] TZDate.prototype.toISOString() returns an offset string (…-07:00), not Z. Take .getTime() and format with new Date(ms).toISOString().
- 2026-10-21 [P7-T03] setDemoNow(iso) works after seededWorld(): clock.ts loads in freshModules with sessionStart = REF_DATE, so vi.setSystemTime moves apiNow() to iso. Install stubLocalStorage() before the first API call, because clock.ts caches its high-water read.
- 2026-10-21 [P7-T03] faker number.int and number.float each consume one draw, so switching a draw between pick and chance does not shift the stream; the fingerprint confirmed every downstream collection is identical.
- 2026-10-21 [P7-T03] Scratchpad mutant/fingerprint configs cannot resolve bare 'vitest/config'; a temporary node_modules junction (New-Item -ItemType Junction) fixes it. Remove junctions with `cmd /c rmdir`, never a recursive rm.
- 2026-10-21 [P7-T03] Seeded KPIs at the anchor are unchanged by the P7 seed (Singapore 90-day appointments 57, messages 806, newContacts 122, wonRevenue 137,450,000c). The Upcoming card's first appointment is now 2026-09-08T17:00Z (10:00 PDT); it was 09:30Z.
- 2026-10-21 [P7-T03] book() and setStatus() are the only code paths that write appointments. Any future reschedule/update API needs the same hasRoomFor check to keep the no-double-booking guarantee.
- 2026-10-21 [P7-T03] Rework (P7-H2): the symmetric rule moved one seeded appointment, Discovery 2026-08-31 18:00Z -> 19:30Z; its clamped updatedAt and status_changed activity move 18:30Z -> 20:00Z, swapping that activity with a neighbour. Faker stream, other collections, KPIs and first upcoming (2026-09-08T17:00Z) unchanged; SEED_VERSION stays 4.
- 2026-10-21 [P7-T03] A scratch Vitest config that imports the repo vitest.config.mts by absolute path and spreads it ({...base, plugins, test: {...base.test, include}}) needs no node_modules junction; only a bare `vitest/config` import from the scratchpad fails to resolve.
- 2026-10-21 [P7-T03] Swapping before/after in the mirrored clause of the two-way buffer check reduces to the one-sided rule, so that mutant fails the same tests as the old rule.
- 2026-10-21 [P7-T04] Next 16 window.history.pushState('?view=…') re-renders useSearchParams consumers with zero network requests, and Back/Forward restore the state. No router.push fallback was needed.
- 2026-10-21 [P7-T04] Node's ICU resolves Asia/Kolkata as the legacy Asia/Calcutta in Intl.DateTimeFormat().resolvedOptions().timeZone. Use Australia/Adelaide (GMT+9:30, canonical) in tests that need a half-hour offset.
- 2026-10-21 [P7-T04] A Base UI Checkbox wrapped in a native <label> gets aria-labelledby (generated label id) from a layout effect; getByRole('checkbox', { name }) works with no aria-label. The name includes all the label's text, e.g. 'Monthly ReviewInactive'.
- 2026-10-21 [P7-T04] A Browser-pane tab left open on a stopped dev server collects 'WebSocket … _next/hmr failed' errors, and read_console_messages keeps reporting them after restart. Compare error counts across navigations rather than reading them as new errors.
- 2026-10-21 [P7-T04] Seeded counts at the anchor, viewed from Singapore: the Sep 2026 month grid has 58 appointments; the week of Sep 6-12 has 11 (Discovery Call 3, Onboarding Kickoff 3, Strategy Session 5). Monthly Review (inactive) has none.
- 2026-10-21 [P7-T04] An absence assertion (toHaveCount(0)) passes trivially while a view is still loading. The e2e helper expectViewLoaded waits for zero [data-slot=skeleton] and the '<View> view' title first.
