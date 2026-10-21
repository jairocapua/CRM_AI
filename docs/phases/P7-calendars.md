# P7 — Calendars

**Phase:** P7 · **Points:** 7 (5 for Calendars + 2 for the test harness) · **Branch:** `phase/p7-calendars`

**Goal:**
- the test harness every later task proves itself with (Vitest + Playwright);
- a calendar time model that is actually right (slots, seed, bookings);
- month, week and day views with the view and date in the URL;
- a calendar list with colour toggles, appointment details, booking with real
  slots, and an availability editor.

**Prerequisites:** Phase 6 committed on `master` (`a0e3159`).

**Spec refs:** `docs/spec.md` — Build phases row 7 and Verification "P7".
`docs/history/phases-0-6.md` — Phase 5 step 0 and Phase 6 step 0 (the
"seed writes the future" and "UTC vs local date" bug classes).

**Decided (owner, 2026-10-21):** appointment times follow **each calendar's
own timezone** (`Calendar.timezone`; all four seeded calendars are
`America/Los_Angeles`). Availability windows ("09:00–17:00") are wall-clock
times in that zone. Screens show times in the viewer's local time, with the
zone labelled. Use `@date-fns/tz` for the conversions. From Asia, LA business
hours land around midnight–08:00 local; that is expected.

## Tasks

### P7-T01 — Vitest harness and first API tests
- **Owner:** agent · **Depends:** —
- **Review:** deep
- **Skills:** `vitest`, `tdd`
- **Scope:**
  - Add Vitest (Node environment) with the `@/` → `src/` alias
    (`vite-tsconfig-paths` or `resolve.alias`). Scripts: `"test": "vitest run"`,
    and add `npm test` to `npm run check` right after `typecheck`.
  - A test helper for a fresh seeded DB: `db.setState(buildDb(), true)`
    (`src/lib/mock/seed/index.ts` `buildDb()` is pure; `db.ts` holds the store).
  - **Timers:** `simulate()` sleeps on real timers, and 21 calls pass a fixed
    `ms`, so `setTuning({ latencyMs: 0 })` is not enough. Use fake timers
    (`vi.useFakeTimers({ now: REF_DATE })` + `advanceTimersByTimeAsync`), or a
    helper that awaits an API call while advancing timers.
  - **Clock:** `apiNow()` derives from `Date.now()` and keeps module-level
    state (`lastIssued`). Pin the system time and `vi.resetModules()` between
    tests that need a fresh clock.
  - **Ids** are nanoids and change every build: assert on content, never ids.
  - Import API modules directly (`@/lib/api/contacts`), not the barrel, which
    re-exports the `"use client"` `use-resource.ts`.
  - First tests:
    - `applyQuery`: filter, search, sort, paginate;
    - `rollupByStage` and `isDeadDeal`;
    - **the Phase 6 reconcile contract**: for every KPI and every period
      (7/30/90), `sum(series) === value`; lead-source bars total the
      New contacts KPI. The Node script that checked this in Phase 6 was never
      kept, so this test replaces it;
    - the seed writes nothing past-tense after `REF_DATE` (spy on the
      `console.error` from `assertNothingAfterAnchor`);
    - `nowIso()` is strictly increasing.
- **Acceptance:**
  - [ ] `npm test` runs and passes; `npm run check` runs it.
  - [ ] Each listed test exists and asserts real values (not snapshots of ids).
  - [ ] The reconcile test would fail if the Phase 6 fix were reverted (keying
        buckets by UTC date): the reviewer confirms the assertion targets that.
  - [ ] No test depends on the machine's timezone unless it sets one explicitly.
- **Refs:** `src/lib/api/http.ts` (`simulate`, `setTuning`), `src/lib/mock/clock.ts`,
  `src/lib/api/analytics.ts`, `src/lib/mock/query-engine.ts`

### P7-T02 — Playwright e2e harness
- **Owner:** agent · **Depends:** —
- **Review:** light
- **Skills:** `playwright-cli`, `webapp-testing`, `next-dev-loop`
- **Scope:**
  - Add `@playwright/test` with Chromium; `npm run e2e` runs the suite
    headless.
  - The test server must not clash with the owner's `npm run dev` on port
    3000. Read `node_modules/next/dist/docs/` on whether a second `next dev`
    may run in the same folder; if not, run e2e against
    `next build && next start -p 3100`. Document the choice in the config.
  - A shared fixture that:
    - waits for boot: `[aria-busy="true"][aria-label="Loading"]` gone
      (`src/components/common/app-boot-skeleton.tsx`), and fails on the
      "Could not start the demo workspace" screen;
    - collects console errors and hydration warnings and fails the test if any
      appear;
    - starts each test from a clean `localStorage` (keys `nimbus-crm-db`,
      `nimbus-crm-clock`) so every test sees the same seed.
  - A smoke spec visiting every nav route (and `/` → `/dashboard`).
  - Ignore `test-results/` and `playwright-report/` in git, Prettier and ESLint.
- **Acceptance:**
  - [ ] `npm run e2e` passes headless.
  - [ ] The smoke spec covers every route in `src/lib/nav.ts`.
  - [ ] The fixture demonstrably fails on a console error (a small self-test of
        the fixture, or the verifier shows the failure path).
  - [ ] Running `npm run e2e` while `npm run dev` is up on 3000 does not break
        either.
- **Refs:** `.claude/launch.json`, `src/components/providers/db-gate.tsx`

### P7-T03 — Calendar time model and slot engine (step 0)
- **Owner:** agent · **Depends:** P7-T01
- **Review:** deep
- **Skills:** `tdd`, `vitest`
- **Scope:** fix existing code before any UI depends on it, as Phases 5 and 6
  did.
  - Add `@date-fns/tz`.
  - `availableSlots(calendarId, dayIso)` (`src/lib/api/calendars.ts:205-280`):
    build the day and its windows in `calendar.timezone`, not the runtime's
    local time; honour `dateRangeDays` (no slots beyond it); keep the existing
    buffer, `maxBookingsPerDay` and minimum-notice logic.
  - `book(draft)` (`:109-165`): reject a start that is not one of
    `availableSlots` for that calendar and day (`ApiError`, 409 or 422), so a
    double booking is impossible through the API.
  - Seed (`src/lib/mock/seed/calendars.ts`): write appointment start times as
    wall-clock hours in the calendar's zone (today `rng.ts:22-25` uses UTC
    hours 9–16). Reuse the same faker draws so the stream is unchanged; no
    past-tense field may land after `REF_DATE`; seeded appointments must not
    overlap within a calendar. Bump `SEED_VERSION` to 4.
  - `appointment.source === "workflow"` stays an enum value, never a foreign
    key (Phase 8 depends on that).
- **Acceptance:**
  - [ ] Tests: slots equal availability minus bookings ± buffers for an LA
        calendar, on a normal day and across the US DST change (Sunday
        2026-11-01).
  - [ ] Tests: booking a slot removes it; cancelling frees it; booking a
        non-slot start is rejected.
  - [ ] Tests: the seed has no overlapping appointments within a calendar and
        every seeded appointment starts inside its calendar's availability.
  - [ ] Test: `listUpcoming()` does not advance the clock's high-water mark.
  - [ ] `SEED_VERSION` is 4 and existing reseed behaviour still works.
- **Refs:** `src/types/calendar.ts`, `src/lib/mock/seed/rng.ts`, `docs/history/phases-0-6.md` (Phase 6 step 0)

### P7-T04 — Calendars page: URL state, toolbar and calendar list
- **Owner:** agent · **Depends:** P7-T02
- **Review:** light
- **Skills:** `vercel-react-best-practices`, `shadcn`, `vercel-composition-patterns`
- **Scope:**
  - `/calendars?view=month|week|day&date=YYYY-MM-DD`. This is the first route
    with URL state: read the Next 16 docs (`searchParams` is a Promise in a
    page; `useSearchParams` needs a Suspense boundary) before writing it.
    Missing or invalid values fall back to month view and today (demo clock).
  - Toolbar: Today, previous/next (by the current view's unit), a view switch,
    the date-range label, and a timezone label.
  - Calendar list: each calendar with its colour and a toggle; hidden
    calendars drop out of every view; inactive calendars are shown muted. The
    toggles live in component state or the URL, not the store.
  - The views themselves are placeholders until T05/T06.
- **Acceptance:**
  - [ ] e2e: changing view/date updates the URL, and reloading that URL
        restores the same view and date.
  - [ ] e2e: an invalid `?view=` or `?date=` falls back without an error.
  - [ ] e2e: toggling a calendar off removes its appointments from the
        rendered view (once a view renders appointments) or from the list state.
- **Refs:** `src/app/(app)/calendars/page.tsx`, `src/types/calendar.ts` (`color: TagColor`)

### P7-T05 — Month view
- **Owner:** agent · **Depends:** P7-T03, P7-T04
- **Review:** light
- **Skills:** `vercel-react-best-practices`, `shadcn`
- **Scope:** a weeks × days grid for the month in the URL; appointment chips
  coloured by calendar (on the viewer's local day); "+N more" when a day
  overflows; clicking a day opens `?view=day&date=…`. Loading uses
  `isLoading` only (never `isRefreshing`).
- **Acceptance:**
  - [ ] e2e: the seeded month shows appointments on the right local days.
  - [ ] e2e: "+N more" appears on a crowded day; clicking a day opens day view.
- **Refs:** `src/lib/api/calendars.ts` `listAppointments`

### P7-T06 — Week and day views
- **Owner:** agent · **Depends:** P7-T03, P7-T04
- **Review:** deep
- **Skills:** `tdd`, `vercel-react-best-practices`
- **Scope:**
  - A time grid; overlapping appointments sit side by side. The packing
    (columns and widths for overlapping intervals) is a **pure function** in
    its own module, unit-tested.
  - A "now" line from `apiNow()`, never the wall clock.
  - On open, scroll to the earliest appointment in view (LA hours fall around
    midnight–08:00 for an Asian viewer).
- **Acceptance:**
  - [ ] Unit tests for the packing function: no overlap, two overlaps, a chain
        of three, back-to-back (touching, not overlapping).
  - [ ] e2e: week and day views render seeded appointments at the right local
        times, with no console errors.
- **Refs:** `src/lib/mock/clock.ts`

### P7-T07 — Appointment details, status and cancel
- **Owner:** agent · **Depends:** P7-T05
- **Review:** light
- **Skills:** `shadcn`
- **Scope:** clicking an appointment opens details: contact (link to
  `/contacts/[id]`), time in the viewer's zone and the calendar's, calendar,
  location, status. Change status via `setStatus`; cancel via `cancel`. Base UI
  rules: `render` prop, labels inside `DropdownMenuGroup`, `SelectValue` with
  a label mapping.
- **Acceptance:**
  - [ ] e2e: cancelling an appointment removes it from the dashboard Upcoming
        card and makes its slot available again.
  - [ ] e2e: a status change appears on the contact's activity timeline.
- **Refs:** `src/components/modules/dashboard/upcoming-appointments-card.tsx`

### P7-T08 — Booking dialog and the contact Appointments tab
- **Owner:** agent · **Depends:** P7-T03, P7-T07
- **Review:** deep
- **Skills:** `vercel-react-best-practices`, `shadcn`
- **Scope:**
  - A booking dialog: react-hook-form + zod through the `Field*` components
    (no `form` component). Choose calendar → contact (reuse the contact
    combobox from `opportunity-form-sheet.tsx`) → day → a slot from
    `availableSlots`. Submits through `book()`; shows the API error if the slot
    was taken meanwhile.
  - Entry points: a "Book" button in the Calendars toolbar, and a new
    **Appointments** tab on the contact detail page (`listForContact` + Book),
    next to Activity/Notes/Tasks in `contact-detail.tsx`.
- **Acceptance:**
  - [ ] e2e (the phase exit check): book a slot, then see it in month, week
        and day views, on the contact's activity timeline, and in the dashboard
        Upcoming card; the booked slot is no longer offered.
  - [ ] e2e: booking from the contact page pre-fills the contact.
- **Refs:** `src/components/modules/contacts/detail/contact-detail.tsx:97-102`

### P7-T09 — Availability editor
- **Owner:** agent · **Depends:** P7-T03, P7-T04
- **Review:** light
- **Skills:** `shadcn`
- **Scope:** per-calendar settings for weekly windows, slot duration and
  interval, buffers before/after, minimum notice and date range, saved through
  `calendars.update`. zod rules: each window ends after it starts; windows on
  a weekday do not overlap; numbers are non-negative.
- **Acceptance:**
  - [ ] Unit test: the availability schema rejects reversed and overlapping
        windows.
  - [ ] e2e: shortening a day's window removes the later slots from booking.
- **Refs:** `src/types/calendar.ts` (`AvailabilityRule`)

## Exit criteria (phase gate)
- [ ] A booking appears in month, week and day views, on the contact
      timeline, and in the dashboard Upcoming card, and its slot disappears
      from availability (e2e).
- [ ] Reloading any `/calendars?view=…&date=…` URL restores the same view.
- [ ] Zero console errors and hydration warnings across all routes (e2e smoke).
- [ ] `npm run check` and `npm run e2e` are green; `npm ls @tanstack/react-table`
      prints 8.21.3.
- [ ] Human check: the owner looks at the week view once from their timezone.
