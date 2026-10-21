# Decision log

> Small judgment calls go here as one-liners. Format: `- YYYY-MM-DD [TASK-ID] decision — why`.
> If the spec is silent, pick the simplest option that respects CLAUDE.md and log it here. Product-level questions go to the owner instead.

## Before the tracker (Phases 0–6)
- 2026-09-08 [plan] Front-end only behind an `api.*` seam; a real backend replaces `src/lib/api/http.ts`'s body with `fetch()` and no component changes.
- 2026-09-08 [plan] `@tanstack/react-table` pinned to 8.21.3 with an `overrides` entry — 9.x is a hard API break.
- 2026-09-24 [plan] Automations are developer-authored code in `src/lib/automations/`, read-only for staff; no drag-and-drop builder (`docs/design/automation.md`).
- 2026-09-26 [P3] CSV import/export and Smart Lists deferred; the API already supports both.
- 2026-09-26 [P4] Pipeline/stage management and an opportunities list view deferred; "Show lost" replaces "show closed" so won deals always show.
- 2026-09-26 [P6] Lead sources are one-hue bars, not a donut (9 sources, 8 palette slots, no cycling).
- 2026-09-26 [P6] Won revenue is cumulative, so the line ends on the headline figure.
- 2026-09-26 [P6] Pipeline value, forecast and stage counts cover one pipeline, never all three summed (Client Onboarding is post-sale work).
- 2026-09-26 [P6] Reads keep `canFail: false`; the dashboard period is component state, not `?period=`.

## Build system (2026-10-21, owner decisions)
- 2026-10-21 [bootstrap] Build through AIPM's `build-phase` workflow: small tasks, one commit per task on a phase branch, the owner merges at each gate, never push.
- 2026-10-21 [bootstrap] Proof is Vitest (logic) plus Playwright (e2e, headless).
- 2026-10-21 [bootstrap] Autopilot: Claude approves or reworks each task; stops for the owner on product questions, phase gates and pushes.
- 2026-10-21 [bootstrap] Calendar times follow each calendar's own timezone (`@date-fns/tz`), displayed in the viewer's local time.
- 2026-10-21 [bootstrap] Phases 8a and 8b merged into P8; `SEED_VERSION` 4 goes to P7, 5 to P8.
- 2026-10-21 [bootstrap] CSV import/export, Smart Lists UI and the opportunities list view stay in `docs/BACKLOG.md` until P7–P10 are done.

## During the build
- 2026-10-21 [P7-T01] Vitest 4.1, not 5: Vitest 5 needs Node ^22.12 and @types/node ^22 || >=24; repo declares node >=20.9 and @types/node 20.
- 2026-10-21 [P7-T01] vite pinned as a devDependency at ^7.3.7: vite 8's optional peer @vitejs/devtools loops back to vitest@* and crashes npm 10.9.4. Do not bump blindly.
- 2026-10-21 [P7-T01] resolve.alias in vitest.config.mts instead of vite-tsconfig-paths (single tsconfig mapping).
- 2026-10-21 [P7-T01] Tests sit beside code in src/lib/api and src/lib/mock, so the existing lint rule already permits @/lib/mock/* imports; ESLint and CLAUDE.md unchanged.
- 2026-10-21 [P7-T01] test.include is src/**/*.test.ts, so Vitest skips scripts/progress.test.mjs (node:test) and the P7-T02 Playwright specs.
- 2026-10-21 [P7-T01] Analytics series assertions use expect.soft so a regression reports every KPI at once.
- 2026-10-21 [P7-T01] settle() has its own tests; rollupByStage gets a rounding test (two 3c deals at 50% weigh 4c).
- 2026-10-21 [P7-T01] The clock anchor test moves the wall clock 30 days off the anchor (and asserts Date.now() did) rather than renaming the test; mutants ran via a transform-plugin config, no source edits.
- 2026-10-21 [P7-T02] e2e runs against `next build && next start -p 3100 -H 127.0.0.1`, not a second `next dev`: Next 16 locks .next/dev/lock; build keeps .next/dev and start takes no lock. Dev-only React warnings are out of e2e's reach; hydration errors still arrive as pageerror.
- 2026-10-21 [P7-T02] e2e server bound to 127.0.0.1 (loopback only, matches baseURL exactly).
- 2026-10-21 [P7-T02] Smoke test asserts the exact title `${item.title} · ${APP_NAME}` (APP_NAME from src/lib/constants), stricter than the planned regex.
- 2026-10-21 [P7-T02] Init script clears all of localStorage (incl. next-themes key), one-shot per tab via a sessionStorage flag, so reloads inside a test keep its data; avoids hard-coding the origin in storageState.
- 2026-10-21 [P7-T02] Added self-test 'waits while the boot skeleton is up' to cover waitForBoot's waiting branch.
- 2026-10-21 [P7-T02] e2e is not part of `npm run check` (it does its own build); the gate runs it separately.
- 2026-10-21 [P7-T03] slots.ts lives in src/lib/mock: availability is server-owned like delivery.ts, the seam lint keeps components out, and the API, book() and the seed share it so they cannot disagree.
- 2026-10-21 [P7-T03] The day passed to availableSlots is a 'YYYY-MM-DD' date in the calendar's zone, checked by round-trip parse; anything else (ISO instants, 2026-02-30) gets 422 INVALID_DAY. T08 handoff: from Asia one local day spans two LA dates, so the booking dialog must map its day onto calendar-zone dates and never pass toISOString().
- 2026-10-21 [P7-T03] dateRangeDays is inclusive in calendar days: the last bookable day is the calendar-zone date of the demo now plus dateRangeDays. Past days need no lower bound; the notice filter empties them.
- 2026-10-21 [P7-T03] Slots step by elapsed minutes from each window's start; on the 25-hour fall-back day a window over 01:00-02:00 offers that hour twice. Window edges in a DST gap/overlap resolve as TZDate does (skipped 02:30 -> 03:30; repeated 01:30 takes PDT). Known limit for the T09 editor.
- 2026-10-21 [P7-T03] book() rejects any start not in freeSlots for its calendar-zone day with 409 SLOT_UNAVAILABLE, and a non-instant start with 422 INVALID_START. Starts are normalised to UTC ISO; endAt is always start + slotDurationMin.
- 2026-10-21 [P7-T03] AppointmentDraft is narrowed to calendarId, contactId, startAt plus optional title, notes, location, assignedUserId, source. The record is built field by field so callers cannot set id, status or endAt. source defaults to 'manual' and stays an enum with no workflowId.
- 2026-10-21 [P7-T03] Seed placement: from the drawn day and hour:minute as LA wall-clock, take the first open grid slot at or after that time, else the day's first open slot, then repeat on following days (max 21, else throw). Open = openSlots(): on grid, clear of earlier placements incl. buffers, day under cap. Notice and range ignored. Every placed appointment, cancelled or not, occupies its slot.
- 2026-10-21 [P7-T03] Seed isPast is endAt <= REF_DATE. createdAt/updatedAt use the final day offset; showed/no-show get updatedAt >= endAt before the updatedAt >= createdAt clamp.
- 2026-10-21 [P7-T03] Engine buffer rule unchanged: a slot is blocked if slot.start < booked.end + after and slot.end > booked.start - before. Buffers do not reach across midnight from the previous day.
- 2026-10-21 [P7-T03] settings.test.ts asserts SEED_VERSION === 4 in its own test so the reseed test fails on behaviour alone under version 3.
- 2026-10-21 [P7-T03] Fixed a harness bug outside the plan: vitest.setup.ts preloads @date-fns/tz so TZDate extends the real Date.
- 2026-10-21 [P7-T03] 'cancelled' stays reversible; restoring checks the slot (409 on conflict) rather than forbidding the move, giving the P7-T07 UI a clear error.
- 2026-10-21 [P7-T03] The restore check covers collisions and the daily cap only (hasRoomFor), not hours, notice or dateRangeDays; a past cancelled appointment can still be marked showed/no_show if its time is free.
- 2026-10-21 [P7-T03] A missing calendar during a restore returns 404 via notFound(), matching book().
- 2026-10-21 [P7-T03] hasRoomFor and liveBookings live in slots.ts so book(), availableSlots() and setStatus() share one definition of live bookings and the daily cap.
