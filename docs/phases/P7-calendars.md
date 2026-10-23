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
  - From the P7-T04 review: today every prev/next step changes the query, so
    `isLoading` swaps the whole view for a skeleton on each click. Keep the
    previous range's grid on screen while the next range loads (a skeleton
    only on the very first load), in `calendars-workspace.tsx`, so the
    week/day views (T06) inherit it.
  - Also from that review: `navigate` pushes a history entry even when the
    position is unchanged (Today while already on today), so Back seems to do
    nothing. Skip the push when the search string would not change.
- **Acceptance:**
  - [ ] e2e: the seeded month shows appointments on the right local days.
  - [ ] e2e: "+N more" appears on a crowded day; clicking a day opens day view.
  - [ ] e2e: stepping to the next month keeps the grid on screen (no full-view skeleton after the first load).
  - [ ] e2e: pressing Today while already on today adds no history entry.
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
  - From the P7-T05 review: `historyMethod` (`calendar-nav.ts`) still pushes
    when the date changes but the visible range does not (e.g. Month on
    Sep 20, then Today). Use `replace` when the view is unchanged and the
    visible days are the same, so Back never looks like it did nothing.
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
  - **Decided (review of P7-T05, 2026-10-21):** cancelled appointments stay
    visible (struck through) but sort after live ones within a day in every
    view, so cancellations never push live bookings behind "+N more".
- **Acceptance:**
  - [ ] e2e: on a day with cancelled and live appointments, the live ones are listed first and stay visible above "+N more".
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
  - [ ] e2e (from the P7-T07 review): a booked slot is not offered in the
        booking dialog; after cancelling that appointment it is offered again.
        P7-T07 proved this only through the details dialog's own line.
- **Refs:** `src/components/modules/contacts/detail/contact-detail.tsx:97-102`

### P7-T09 — Availability editor
- **Owner:** agent · **Depends:** P7-T03, P7-T04
- **Review:** light
- **Skills:** `shadcn`
- **Scope:** per-calendar settings for weekly windows, slot duration and
  interval, buffers before/after, minimum notice and date range, saved through
  `calendars.update`. zod rules: each window ends after it starts; windows on
  a weekday do not overlap; numbers are non-negative.
  - From the P7-T06 review: once the editor allows slots shorter than 25
    minutes, the week/day grid's minimum block height (`MIN_BLOCK_PX` in
    `time-grid-view.tsx`) draws back-to-back short bookings on top of each
    other. Pack on `max(real end, start + minimum visible minutes)` so short
    neighbours share a group and sit side by side.
- **Acceptance:**
  - [ ] Unit test: the availability schema rejects reversed and overlapping
        windows.
  - [ ] Unit test: two back-to-back 15-minute appointments are laid out side by side, not overlapping.
  - [ ] e2e: shortening a day's window removes the later slots from booking.
- **Refs:** `src/types/calendar.ts` (`AvailabilityRule`)

### P7-H1 — Update CLAUDE.md Commands for the new check pipeline
- **Owner:** human · **Depends:** —
- **Scope:** check now runs format:check -> lint -> typecheck -> test -> test:scripts -> build; CLAUDE.md still lists the old chain.
- **Acceptance:**
  - [ ] (define before starting)
- **Refs:** added by `progress.mjs add` on 2026-10-21

### P7-T10 — Harness polish: browser install and smoke content checks
- **Owner:** agent · **Depends:** —
- **Review:** light
- **Skills:** `playwright-cli`
- **Scope:**
  - Add an `e2e:install` script (`playwright install chromium`) so a fresh
    clone can run `npm run e2e`; list `npm run e2e` and `e2e:install` in
    CLAUDE.md "Commands".
  - Smoke spec (`e2e/smoke.spec.ts`): today "no skeleton left" is also true
    for a blank page. Also assert each route's page heading (or `main`
    content) is visible, so a client render that silently fails is caught.
  - A one-line note in `e2e/fixtures.ts` that storage clearing and the console
    watcher apply to the `page` fixture only, not to `context.newPage()`.
- **Acceptance:**
  - [ ] `npm run e2e:install` then `npm run e2e` pass on a machine without the browser cached (the verifier shows the script exists and runs).
  - [ ] Each smoke test asserts a visible heading or main content for its route.
  - [ ] CLAUDE.md Commands lists `npm run e2e` and `npm run e2e:install`.
- **Refs:** P7-T02 review suggestions (2026-10-21)

### P7-T11 — Guard bookings: inactive calendars, unknown contacts, bad windows
- **Owner:** agent · **Depends:** —
- **Skills:** `tdd`, `vitest`
- **Scope:** book()/availableSlots() reject isActive:false calendars and missing contactIds; reject startAt without Z/offset (422 INVALID_START); map invalid HH:mm or IANA zone RangeErrors to 422 ApiError (or validate in calendars.update); dedupe slotGrid output for overlapping windows; add a dateRangeDays test at now=2026-10-27T03:00Z proving 'today' is read in the calendar zone.
  - From the P7-T09 review: the availability editor's zod schema is the only guard on `calendars.update` today. The API must reject, on its own, malformed "HH:mm" windows, reversed or overlapping windows on an enabled day, and negative or fractional numbers (422), so a `fetch()` backend keeps the same rules.
- **Acceptance:**
  - [ ] `book()` and `availableSlots()` reject an inactive calendar with 409
        `CALENDAR_INACTIVE` and write nothing; once the calendar is made
        active the same start is offered and booked.
  - [ ] `book()` with a `contactId` that does not exist rejects with 404
        `NOT_FOUND` and writes no appointment or activity.
  - [ ] `book()` rejects a `startAt` without `Z` or a `±HH:mm` offset
        (zone-less date-time, date only, impossible date or hour, free text)
        with 422 `INVALID_START` in both runtime zones and writes nothing;
        offset and seconds-less spellings of a slot are still accepted and
        stored as UTC ISO.
  - [ ] `calendars.update()` rejects, on its own, with 422 `INVALID_CALENDAR`
        and leaves the calendar unchanged: malformed "HH:mm", reversed,
        zero-length, overlapping or nested windows on an enabled day;
        duplicate or out-of-range weekday rules; zero, negative or fractional
        slot duration/interval, buffers, notice, date range and
        `maxBookingsPerDay`; an unknown time zone.
  - [ ] Valid settings still save: touching windows, the existing test
        patches, and every seeded calendar's own settings.
  - [ ] `slotGrid()` (and so `freeSlots()`/`availableSlots()`) lists each
        start once, in order, when windows overlap or nest.
  - [ ] At demo now 2026-10-27T03:00Z (20:00 PDT on Oct 26), Discovery offers
        slots on 2026-11-25 and none on 2026-11-26 in both runtime zones,
        proving `dateRangeDays` reads "today" in the calendar's zone.
  - [ ] No seed or UI behaviour change: `SEED_VERSION` stays 4; `npm run
        check` and `npm run e2e` are green; the availability editor's doc
        comment no longer claims the form is the only guard.
- **Refs:** added by `progress.mjs add` on 2026-10-21

### P7-H2 — Decide symmetric buffer semantics
- **Owner:** human · **Depends:** —
- **Scope:** isBlocked() only pads existing bookings, so buffer enforcement depends on booking order (Discovery: 17:00Z then 16:30Z accepted; reverse rejected). Decide whether to require the candidate's own buffers too before P7-T08 relies on it; changes accepted slot lists in tests.
- **Acceptance:**
  - [ ] (define before starting)
- **Refs:** added by `progress.mjs add` on 2026-10-21

### P7-T12 — Merge duplicate day validators into a shared non-mock module
- **Owner:** agent · **Depends:** —
- **Skills:** `tdd`, `vitest`
- **Scope:** parseDay/isCalendarDay in src/components/modules/calendars/calendar-nav.ts and parseDay in src/lib/mock/slots.ts duplicate each other; move to e.g. src/lib/dates.ts and import from both (seam lint blocks components importing the mock copy).
  - From the P7-T08 review: `isDayInput` in `src/lib/validation/appointment.ts` is a third copy and disagrees with `isCalendarDay` ('0099-01-01' passes the schema, fails `isCalendarDay`). Have `bookingFormSchema` use the shared helper.
- **Acceptance:**
  - [ ] `src/lib/dates.ts` is the one place that decides whether a string is
        a real "YYYY-MM-DD" day. It exports `CalendarDay`, `DayParts`,
        `isCalendarDay` and `parseCalendarDay` (which throws a `RangeError`
        "Not a calendar day: <day>"), and imports nothing from `@/lib/mock`,
        `@/lib/api` or `@faker-js/faker`.
  - [ ] No duplicate day validator remains: `calendar-nav.ts`, `slots.ts` and
        `validation/appointment.ts` no longer define `parseDay`,
        `isDayInput`, `DAY_PATTERN`, `DAY_INPUT` or `isCalendarDay`; they,
        `api/calendars.ts` and `booking-dialog.tsx` import the check from
        `@/lib/dates`.
  - [ ] `bookingFormSchema` agrees with `isCalendarDay`: '0099-01-01' and
        '0000-01-01' are rejected with "Pick a day.", and every existing
        accept and reject case is unchanged.
  - [ ] The shared rule is pinned: it accepts real days, leap days and years
        0100-9999; it refuses overflow, malformed strings, instants, padding
        and whitespace, signed years and years 0000-0099; it answers the same
        in UTC, Asia/Singapore and America/Los_Angeles; `parseCalendarDay`
        returns a 1-based month.
  - [ ] The calendars page, the booking engine and the API keep their
        behaviour: URL dates fall back as before, invalid days still throw
        `RangeError` in nav and slot maths, and `availableSlots()` answers
        422 `INVALID_DAY` for the same inputs, now including '0099-01-01', in
        both runtime zones.
  - [ ] No seed or UI change: `SEED_VERSION` stays 4 and no faker call moves;
        `npm run check` is green and the calendars and booking e2e specs
        pass.
- **Refs:** added by `progress.mjs add` on 2026-10-21

### P7-T13 — Calendars: error state and retry when appointments fail to load
- **Owner:** agent · **Depends:** —
- **Scope:** calendars-workspace.tsx: if listAppointments fails with no data shown, the skeleton stays forever. Add an appointments.error branch with refetch(); needed once http.ts moves to fetch().
  - From the P7-T08 review: `contact-appointments-panel.tsx` has the same gap: a failed `listForContact` reads as "No appointments yet." Give it an error branch with Retry too.
  - From the P7-T09 review: `availability-workspace.tsx` shows a calendars load error as an EmptyState with no Retry; add one there too.
- **Acceptance:**
  - [ ] Calendars page, first load: when listAppointments fails, the view area shows a 'Could not load appointments' alert with the error message and a Retry button, not a skeleton or a view. After the fault clears, clicking Retry shows the month view.
  - [ ] While a Retry is in flight, the alert stays on screen with its Retry button busy and no skeleton appears. A Retry that fails again leaves the alert with Retry enabled.
  - [ ] Calendars page, stepping: when the next range fails to load, the alert replaces the view, so the previous range's grid is not left on screen under the new label. Retry loads the new range's grid.
  - [ ] Contact Appointments tab: a failed listForContact shows the alert with Retry instead of 'No appointments yet.'. Retry after the fault clears lists the contact's appointment.
  - [ ] Availability page: a failed calendars.list shows 'Could not load calendars' with Retry and the 'Back to calendars' link, not the 'No calendars' empty state. Retry after the fault clears opens the editor on the first calendar.
  - [ ] The fault is test-only. No production code gains a fault switch, reads keep canFail:false, and nothing under src/lib/api or src/lib/mock changes.
  - [ ] No regression and no seed change: SEED_VERSION stays 4, `npm run check` is green, and the full `npm run e2e` suite (existing calendars, booking, availability and smoke specs plus the new spec) passes.
- **Refs:** added by `progress.mjs add` on 2026-10-21

### P7-T14 — Larger tap target for month chips on mobile
- **Owner:** agent · **Depends:** —
- **Skills:** `shadcn`, `playwright-cli`, `web-design-guidelines`
- **Scope:** Below sm, chips are 6px bars; give the details button a min tap height or open the day on mobile.
  - From the P7-T07 review: after a cancel in month view, `liveFirst` can move
    the cancelled chip behind "+N more", so the button that opened the dialog
    unmounts and focus falls to `<body>` on close. Give the details dialog a
    `finalFocus` that falls back to the day cell or its "+N more" button.
- **Acceptance:**
  - [ ] A1. Below sm (375×812 viewport), every button in a month day cell
        measures at least 24×24 CSS px: the day number, each appointment chip
        and "+N more" (WCAG 2.2 SC 2.5.8).
  - [ ] A2. At 375px, a touch tap on a chip opens that appointment's details
        dialog.
  - [ ] A3. From sm up, the month view is unchanged: chips keep their one-line
        height and every existing month and details spec passes with its
        existing assertions intact.
  - [ ] A4. Closing the details while the element that opened them is still on
        screen returns focus to it: the chip in month view, the block in day
        view.
  - [ ] A5. When a cancel in month view moves the opened chip behind "+N
        more", closing the details focuses that day's "+N more" button, never
        `<body>`.
  - [ ] A6. After Cancel and then Undo with the dialog still open, the chip
        returns as a new element, and closing the details focuses that chip.
  - [ ] A7. No seed, API or mock change, and no regression: `SEED_VERSION`
        stays 4, nothing under `src/lib/api` or `src/lib/mock` changes, `npm
        run check` is green and the full `npm run e2e` suite passes.
- **Refs:** added by `progress.mjs add` on 2026-10-22

### P7-T15 — Show end date when an appointment crosses midnight
- **Owner:** agent · **Depends:** —
- **Skills:** `tdd`, `vitest`, `playwright-cli`
- **Scope:** zonedTimes prints only the start date; show the end date (or next-day marker) when it differs, in both zones.
  - From the P7-T14 review, small month-view cleanups: month-view.tsx comments (header and AppointmentChip) and the calendars-month.spec.ts describe comment say a chip below sm is "a thin coloured bar" and "the bar is only the visible mark"; on screen it is a 24px tinted pill with the bar inside, so reword them. Below sm use gap-1 between chips (the 2px focus ring + 1px offset is 1px wider than gap-0.5). Move appointmentFocusFallback out of month-view.tsx (or rename it) since it also serves the time-grid blocks.
- **Acceptance:**
  - [ ] A1. `zonedTimes` shows the end's date when the appointment ends on a
        later date in the zone it prints, as "h:mm a – EEEE, MMMM d, h:mm a"
        ("11:45 PM – Tuesday, September 8, 12:30 AM"); `day` stays the
        start's date, and a same-date appointment prints exactly as before
        ("10:00 AM – 10:30 AM").
  - [ ] A2. Both zones: the calendar's zone and the viewer's own zone each get
        their own end date, independently of each other and of the runtime
        zone (the calendar's zone crosses while the viewer's does not, and the
        reverse).
  - [ ] A3. An appointment that ends exactly at local midnight shows as ending
        on its start date ("11:30 PM – 12:00 AM"), as the week/day grid keeps
        it on its own day (`daySegments`); one that ends after midnight shows
        the end date.
  - [ ] A4. The end date carries the year only when it differs from the
        start's (31 December to 1 January).
  - [ ] A5. In the browser, from Asia/Kolkata, the seeded appointment that
        crosses local midnight shows in its details: "Your time" has its start
        date and "<start> – <end weekday, month day>, <end>", and "Calendar
        time" (Los Angeles, the same day there) a plain start – end range with
        no end date.
  - [ ] A6. Every place that prints `zonedTimes` gets the end date with no
        wiring of its own: both detail rows, the booking dialog's "Calendar
        time" line and the "Appointment booked" toast.
  - [ ] A7. The month-view.tsx header and `AppointmentChip` comments and the
        calendars-month.spec.ts phone describe comment describe a chip below
        `sm` as a tinted pill at least 24px tall with a coloured bar inside;
        none says "thin coloured bar" or "only the visible mark".
  - [ ] A8. Below `sm`, chips in a day cell are `gap-1` apart, so a chip
        button's focus ring (2px outline + 1px offset) is never covered by the
        next chip; from `sm` up the spacing is unchanged (`gap-0.5`) and still
        clears the ring.
  - [ ] A9. `appointmentFocusFallback` lives in its own module
        (`appointment-focus.ts`), documented for month chips and time-grid
        blocks; month-view.tsx neither defines nor exports it, and focus
        return behaves as before.
  - [ ] A10. No seed, API or mock change, and no regression: `SEED_VERSION`
        stays 4, nothing under `src/lib/api` or `src/lib/mock` changes, `npm
        run check` is green and the full `npm run e2e` suite passes.
- **Refs:** added by `progress.mjs add` on 2026-10-22

### P7-H3 — Decide: can past appointments be cancelled or re-statused?
- **Owner:** human · **Depends:** —
- **Scope:** API allows cancel/any status on past appointments; product decision whether the dialog should offer them.
- **Acceptance:**
  - [ ] (define before starting)
- **Refs:** added by `progress.mjs add` on 2026-10-22

### P7-T16 — Check Base UI Select hidden input in the a11y tree
- **Owner:** agent · **Depends:** —
- **Skills:** `playwright-cli`, `webapp-testing`
- **Scope:** read_page shows the Select's hidden form input as a textbox named after the value; affects every Select. Investigate and fix if real.
- **Acceptance:**
  - [ ] A1. On every route that shows a Select on load (/dashboard,
        /conversations, /contacts, /opportunities, /calendars/availability),
        Chromium's accessibility tree ignores each Select's hidden input
        because of its own aria-hidden (`ignoredReasons` includes
        `ariaHiddenElement`), and each trigger stays exposed as a combobox.
  - [ ] A2. The same holds inside a modal form: in the "Add contact" sheet,
        every Select (Status, Source, Owner and any select-type custom field)
        has an ignored hidden input and an exposed combobox trigger.
  - [ ] A3. The check cannot pass vacuously: in each scope it fails if no
        Select triggers exist or if the number of hidden inputs differs from
        the number of triggers, and it reports an input as a textbox once
        aria-hidden is removed, so a Base UI upgrade that drops aria-hidden
        turns the suite red.
  - [ ] A4. A Select's hidden input never holds focus: it has tabindex=-1, and
        focusing it moves focus to its trigger.
  - [ ] A5. The verdict is written where reviewers will see it: CLAUDE.md's
        "Verifying in the Claude Browser pane" says read_page lists Base UI's
        aria-hidden form inputs as textboxes named after the value, that this
        is an artefact, and points to `e2e/select-a11y.spec.ts`.
  - [ ] A6. No product, seed, API or mock change, and no regression: nothing
        under src/ changes, `SEED_VERSION` stays 4, `npm run check` is green
        and the full `npm run e2e` suite passes.
- **Refs:** added by `progress.mjs add` on 2026-10-22

### P7-T17 — ContactPicker search: full-name match and no client re-filter
- **Owner:** agent · **Depends:** —
- **Skills:** `tdd`, `vitest`, `playwright-cli`
- **Scope:** contact-picker.tsx: pass filter={null} so server results show as returned; api.contacts.list q matches 'first last'. Affects deal sheet and booking dialog.
- **Acceptance:**
  - [ ] A1. `api.contacts.list({ q })` matches a contact's full name "First
        Last", ignoring case and outer spaces, including a partly typed full
        name ("ana gar"). A first name, last name, email, phone, company or
        job title alone still matches as before.
  - [ ] A2. CSV export applies the same search as the list:
        `exportCsv({ q: "First Last" })` exports the matching contacts.
  - [ ] A3. `applyQuery` accepts a function of the row as a search field next
        to dotted paths. Its existing filter, search, sort and paginate
        behaviour is unchanged.
  - [ ] A4. In the deal sheet ("New deal") and the booking dialog, typing a
        contact's full name lists that contact, and choosing it fills the
        Contact input with the name.
  - [ ] A5. The picker shows the server's results as returned
        (`filter={null}`): an email search lists exactly that contact, and a
        company-name search lists that company's contact.
  - [ ] A6. With a contact selected, a search that does not match it lists
        only the server's results, without the selected contact pinned above
        them. A search that matches nothing shows "No contacts found." with
        no options.
  - [ ] A7. A contact set from outside the picker still shows its name in the
        input: the booking dialog opened from a contact panel shows that
        contact. `inputValue` stays uncontrolled.
  - [ ] A8. Comments match the code. The contact-picker.tsx doc comment
        explains `filter={null}` and when the selected contact is added. The
        `uniqueContact` comment in calendars-booking.spec.ts no longer says
        the query matches one field at a time or that the combobox
        re-filters by label.
  - [ ] A9. No seed change and no regression: `SEED_VERSION` stays 4 and
        nothing under src/lib/mock/seed changes. `npm run check` is green and
        the full `npm run e2e` suite passes.
- **Refs:** added by `progress.mjs add` on 2026-10-22

### P7-T18 — Booking dialog: slot-load error with Retry, ids from formId, fresh form per open
- **Owner:** agent · **Depends:** —
- **Skills:** `vercel-react-best-practices`, `shadcn`, `playwright-cli`
- **Scope:** booking-dialog.tsx:292 show slots.error.message + Retry (slots.refetch); derive booking-* ids from formId; key BookingForm on an open counter.
  - From the P7-T08 review: at phone width (400px) the three-column time cards wrap "12:00 AM" onto two lines; keep each time on one line (e.g. `whitespace-nowrap`, or two columns below `sm`).
- **Acceptance:**
  - [ ] A1. When the open times fail to load for the chosen calendar and day
        and nothing is listed yet, the Time group shows a "Could not load the
        open times" alert with the error's message and a Retry button. No
        time cards, no skeleton and no "No open times on this day." are
        shown.
  - [ ] A2. While a Retry is in flight the alert stays, its Retry busy
        (aria-disabled), and no skeleton appears in the dialog. A Retry that
        fails again leaves the alert with Retry enabled. Once the fault
        clears, Retry lists the day's open times and the alert is gone.
  - [ ] A3. The error shows only when the read failed and there is nothing to
        draw, as `LoadError`'s contract and DECISIONS P7-T13 require. A
        failed refetch keeps a list already on screen.
  - [ ] A4. The Calendar trigger, Contact input and Day input take their ids
        from the form's `useId` (`<formId>-calendar`, `-contact`, `-day`).
        Each label's `for` matches, each id appears once in the document, no
        element id starts with "booking-", and the labels still name their
        controls.
  - [ ] A5. Every open starts a fresh form. Reopening while the previous popup
        is still mounted (exit animation unfinished, as in a hidden browser
        pane) shows Calendar "Pick a calendar", an empty Contact, Day back at
        the default day, no time chosen and a new form id. The test confirms
        the same popup element reopened, so it cannot pass vacuously.
  - [ ] A6. Below `sm` the time cards are two columns, and every time label,
        "12:00 AM" included, stays on one line inside its card at 320, 375,
        400 and 639px. From `sm` up (640, 1280) the grid stays four columns.
        The loading skeleton uses the same columns.
  - [ ] A7. Comments match the code. `BookingDialog`'s doc comment explains
        the open-counter key and no longer says that unmounting on close is
        what resets the form. The calendars-load-errors.spec.ts header lists
        the booking dialog's open times.
  - [ ] A8. No seed, API or mock change and no regression: `SEED_VERSION`
        stays 4, nothing under `src/lib/api` or `src/lib/mock` changes, `npm
        run check` is green, and the full `npm run e2e` suite passes with the
        existing booking specs' assertions unchanged.
- **Refs:** added by `progress.mjs add` on 2026-10-22

### P7-T19 — Link-as-button semantics in modules
- **Owner:** agent · **Depends:** —
- **Skills:** `shadcn`, `playwright-cli`
- **Scope:** Switch Button render={<Link/>} nativeButton={false} to <Link className={buttonVariants(...)}> in conversations/contact-panel.tsx:83, thread-view.tsx:81,:309, dashboard/pipeline-card.tsx:147 (role=button bug)
  - The links are spelled `<Link className={cn(buttonVariants({...}))}>`:
    `Button` tailwind-merges its variant classes, and the raw string keeps
    `border-transparent`, `rounded-lg` and the base `size-4` icon rule, which
    win in Tailwind's CSS order. The two P7-T09 links (Availability, Back to
    calendars) get the same `cn()` wrap, since they lose their outline border
    in light mode today.
- **Acceptance:**
  - [ ] A1. The four scoped controls are links without a button role. "View
        contact" (conversation details pane), "Back to inbox" (missing
        conversation empty state), "Back to inbox" (phone thread header) and
        "Open board" (dashboard Deals by stage card) each render as `<a href>`
        with no role attribute: `getByRole('link', {name, exact})` finds each
        one, `getByRole('button', {name})` finds none, and no
        `a[role="button"]` is on those screens. No `nativeButton={false}` is
        left under `src/components/modules`.
  - [ ] A2. Each link looks like the button it replaced, because it uses
        `cn(buttonVariants())` with the same variant and size. In light mode:
        View contact is 28px tall with 8px corners, a 14px icon and a visible
        border; Open board is 28px tall with 8px corners and a 14px icon; the
        empty-state Back to inbox is 32px tall with 10px corners and a visible
        border; the phone Back to inbox is 28x28 with 8px corners and a 16px
        icon.
  - [ ] A3. The P7-T09 links use the same `cn()` spelling and keep the
        outline border. On /calendars the Availability link's border colour,
        border width, corner radius, height, background and font size equal
        the toolbar's Today button (`<Button variant="outline">`); on
        /calendars/availability Back to calendars matches the same values.
        Neither link has a role attribute.
  - [ ] A4. Each link still goes where it did, by pointer and keyboard. Open
        board leads to /opportunities, by focus + Enter too. View contact
        leads to /contacts/<id>, the id matching the thread header's contact
        name link. Both Back to inbox links lead to /conversations, where the
        inbox or the "Select a conversation" state shows. Availability leads
        to /calendars/availability.
  - [ ] A5. Every new test has been seen failing: on the old markup the four
        scoped tests fail at the link-role check and the calendars test at
        border parity; restoring `Button render={<Link/>}
        nativeButton={false}` at one site fails its test again; dropping
        `cn()` from an outline small link fails the look checks.
  - [ ] A6. No seed, API or mock change and no regression: `SEED_VERSION`
        stays 4, nothing under `src/lib` or `src/components/ui` changes,
        `npm run check` is green, and the full `npm run e2e` suite passes with
        the existing specs unchanged.
  - [ ] A7. Comments and docs match the code: each changed site's comment
        says why it is a Link and why `cn()` is there, and the spec header
        explains the role=button cause and the class-merge cause.
- **Refs:** added by `progress.mjs add` on 2026-10-22

### P7-T20 — Availability editor: unsaved-changes guard and empty open day
- **Owner:** agent · **Depends:** —
- **Skills:** `shadcn`, `playwright-cli`
- **Scope:** Confirm when isDirty on calendar Select change / Back link; switch day off (or schema message) when last window removed while enabled
  - Decided: removing an enabled day's last window switches the day off
    (focus moves to its switch). No schema message: the zod schema and
    `calendars.update` stay unchanged.
  - Decided: only the Calendar select and the Back to calendars link are
    guarded. The sidebar's links, browser back/forward and reload or tab
    close are not.
- **Acceptance:**
  - [ ] A1. Switching calendars with unsaved edits asks first. On
        /calendars/availability (Discovery Call), after Tuesday's end is
        changed to 12:00, choosing Strategy Session in the Calendar select
        opens the "Discard unsaved changes?" alert dialog. It names Discovery
        Call and Strategy Session and has "Keep editing" focused. Until a
        choice is made, the URL, the select and the form stay on Discovery
        Call.
  - [ ] A2. Keep editing, or Escape, keeps the edit. The dialog closes, the
        URL has no calendar param, the select reads Discovery Call, Tuesday
        still ends at 12:00, the form's "Discard changes" is still enabled,
        and focus is back on the Calendar select trigger.
  - [ ] A3. Discard changes switches and drops the edit. The URL reads
        `?calendar=strategy`, the select reads Strategy Session, the form
        shows Strategy Session's saved Tuesday (09:00–16:00), and focus is on
        the Calendar select. The stored Discovery Call hours are unchanged.
        Switching back to Discovery Call asks nothing and shows 09:00–17:00.
  - [ ] A4. Back to calendars with unsaved edits asks first, by focus +
        Enter and by pointer. Keep editing stays on /calendars/availability
        with the edit (Slot duration 45) intact and focus on the Back link.
        Discard changes goes to /calendars, and reopening the editor shows
        Slot duration 30 (nothing was saved).
  - [ ] A5. A clean editor never asks. Right after load, after the form's
        "Discard changes", and after "Save availability", switching calendars
        and Back to calendars act at once with no alert dialog. The existing
        shortening spec (save, then Back) passes unchanged.
  - [ ] A6. Removing an enabled day's last window switches the day off. With
        two Tuesday windows, removing one leaves the day on with the other.
        Removing the last one turns "Available on Tuesday" off, shows
        "Unavailable", moves focus to that switch and enables Discard
        changes. Saving stores Tuesday as
        `{ weekday: 2, enabled: false, windows: [] }` with every other day
        unchanged. Switching Tuesday back on offers 09:00–17:00.
  - [ ] A7. Every new test has been seen failing. On the old code, the three
        guard tests fail at the alert-dialog check and the day-off test fails
        at the switch check. The clean-editor test fails against a type-clean
        mutant that always reports dirty.
  - [ ] A8. No seed, API or mock change and no regression. SEED_VERSION stays
        4, nothing under src/lib or src/components/ui changes, `npm run check`
        is green, and the full `npm run e2e` suite passes with the existing
        specs unchanged.
  - [ ] A9. Docs match the code. The AvailabilityWorkspace doc comment
        describes the guard and what it does not cover (sidebar, browser
        back/forward, reload). The AvailabilityForm doc comment says removing
        the last window switches the day off. ConfirmDialog has a doc
        comment. This entry carries the acceptance and the two decisions.
- **Refs:** added by `progress.mjs add` on 2026-10-22

### P7-T21 — Raise timeout on long calendars-booking e2e flows
- **Owner:** agent · **Depends:** —
- **Skills:** `playwright-cli`
- **Scope:** calendars-booking.spec.ts:152 (~30s) and :313 hit the 30s default under load; add test.slow()/setTimeout(60_000) or split the :152 flow.
  - From the P7-T13 review: the first full e2e run in P7-T13 timed out 15 tests on a busy machine (a rerun passed), so check the suite-wide timeout too, not only these two flows.
  - Also from P7-T13, two comments in e2e/calendar-helpers.ts: in failReads' Limits paragraph, say that mutations reading the same table (book(), setStatus() call Object.values(state.appointments)) also throw while the fault is on; at restoreReads, say it only clears the flag and leaves the wrapper installed, which is fine because each test gets a fresh page (not shared across context.newPage() tabs).
  - From the P7-T15 review: in e2e/calendars-details.spec.ts (the Asia/Kolkata describe), put both conditions in the `find` (crosses midnight in Kolkata AND does not cross in row.timezone), keeping the throw when nothing matches, so a reseed cannot pick a row that fails the second check. In appointment-display.test.ts, reword "the seed's own case" above KOLKATA_START to "a case like the seed's" (the seed's crossing row is 2026-10-02 18:00Z, not that instant).
  - The two flows, by title (the line numbers above have moved): "a booking
    appears in every view, on the timeline and the dashboard, and its slot is
    no longer offered" and "a booked slot is not offered until its
    appointment is cancelled".
  - Decided: the exit-check flow stays one test and gets `test.slow()`
    instead of a split. Every test starts from a fresh seed, so each piece of
    a split would have to book again.
  - Decided: expect's 5s timeout (`toHaveURL` included) and the worker count
    stay at Playwright's defaults here. P7-T27 owns both.
- **Acceptance:**
  - [ ] A1. The suite-wide test timeout is 60s. `playwright.config.ts` sets a
        top-level `timeout: 60_000`, with a comment giving the reason (the
        load evidence and `waitForBoot`'s 20s boot wait). Expect's 5s
        timeout, `workers`, `retries` and `fullyParallel` are unchanged.
  - [ ] A2. The two long booking flows are marked slow and stay one test
        each. Both call `test.slow()` as their first statement, each with a
        comment giving its measured duration. The other tests in
        `calendars-booking.spec.ts` are unmarked (each takes under 5s alone on
        one worker). No test is split and no assertion changes.
  - [ ] A3. `failReads`' Limits paragraph says that mutations reading the
        same table also throw while the fault is on: `book()` always, and
        `setStatus()` only when it moves a cancelled appointment to another
        status. It does not claim `setStatus()` or `cancel()` always read the
        table.
  - [ ] A4. `restoreReads`' doc says it only clears the flag and leaves the
        `Object.values` wrapper installed, passing every call through. That is
        safe because each test gets a fresh page, and the wrapper is per
        document, so it never reaches a `context.newPage()` tab.
  - [ ] A5. The Kolkata test's `find` holds both conditions: the row crosses
        midnight in Kolkata and does not cross it in `row.timezone`. The
        throw is kept when nothing matches, and the separate post-find
        `expect` is gone. The test passes, and a type-clean mutant (`===` to
        `!==` on the second condition) fails it at the throw.
  - [ ] A6. `appointment-display.test.ts`'s comment above `KOLKATA_START`
        reads "a case like the seed's", and the test values are unchanged.
  - [ ] A7. No product, seed, API or mock change and no regression. Nothing
        under `src/` changes except that one test comment, `SEED_VERSION`
        stays 4, `npm run check` is green, and the full `npm run e2e` suite
        passes with the same test count and the existing assertions
        unchanged.
- **Refs:** added by `progress.mjs add` on 2026-10-22

### P7-T22 — Calendar update: reject explicit undefined keys and use a plain-language 422 message
- **Owner:** agent · **Depends:** —
- **Scope:** calendars.update(): {timezone: undefined} passes .partial() and erases the stored value; drop undefined keys or validate merged record. Keep zod path off the toast-facing message (separate field).
  - From the P7-T11 review: once undefined keys are dropped, nothing can remove a `maxBookingsPerDay` cap (the schema's minimum is 1, and JSON cannot send `undefined`). Give "no cap" an explicit spelling that `update()` accepts (`null`, or 0 as the engine already reads it) and test that it clears the cap.
  - Decided: an undefined value in a patch is ignored, never written, the
    same as JSON would drop it on the wire.
  - Decided: `maxBookingsPerDay: null` removes the daily cap. The key is
    deleted from the stored calendar, never stored as null; `0` stays
    rejected. A 422 message reads `<label>: <rule>` in the editor's words,
    and the dotted zod path goes in `ApiError.field`, never in the message.
- **Acceptance:**
  - [ ] A1. Undefined values are ignored, never written. On Discovery Call,
        `update(id, { timezone: undefined, name: undefined, isActive:
        undefined, availability: undefined, maxBookingsPerDay: undefined,
        bufferBeforeMin: 5 })` resolves. The stored calendar equals the
        previous one except for `bufferBeforeMin: 5` and `updatedAt`, and
        still has timezone America/Los_Angeles, its name, `isActive` true,
        its availability and its cap of 6. No own key on the returned or
        stored calendar holds `undefined`. Tuesday 2026-10-27 still offers
        its Los Angeles wall-clock slots.
  - [ ] A2. `maxBookingsPerDay: null` removes the daily cap, and nothing else
        does. With Strategy Session's three bookings on Tue 2026-10-27
        (16:00Z, 20:00Z, 22:00Z) that day offers no slots;
        `{ maxBookingsPerDay: undefined }` leaves it full;
        `{ maxBookingsPerDay: null }` resolves, neither the returned nor the
        stored calendar has a `maxBookingsPerDay` key, and the day offers
        exactly 18:00Z; a later `{ maxBookingsPerDay: 2 }` closes the day
        again. `0` is still rejected.
  - [ ] A3. A rejected patch gets a plain-language message, with the path in
        a separate field. Every rejected settings patch is a 422
        `INVALID_CALENDAR` with `field` set to the dotted path (for example
        `availability.2.windows.0.end`) and `message` set to
        `<label>: <rule>` with no path in it. Labels use the editor's words
        ("Tuesday, end of window 1", "Slot duration", "Booking range",
        "Time zone", "Daily booking limit", "Weekly hours"). zod's built-in
        wording never reaches the message: a wrong type reads "Not a valid
        value." and an out-of-range weekday "Not a weekday.". The calendar
        is unchanged after each rejection.
  - [ ] A4. `ApiError` carries an optional `field`, a fourth constructor
        parameter documented as not for display. Every other `ApiError` in
        the app is constructed as before.
  - [ ] A5. Valid settings still save, and the editor works as before.
        Touching windows save, every seeded calendar's whole record re-saves
        (Onboarding Kickoff with no cap included), and nothing under
        `src/components` changes.
  - [ ] A6. Every new or changed test has been seen failing: on the old code
        the undefined test fails at the timezone check, the null test at the
        422, and the rejection rows at message/field. Type-clean mutants
        (no undefined filter, no null branch, the path back in the message,
        no per-parse error map) each turn their own test red.
  - [ ] A7. Comments match the code: `update()`'s doc comment (undefined
        ignored, null clears the cap, plain `message` plus `field`),
        `calendarSettingsSchema`'s (null means no cap) and `ApiError.field`.
  - [ ] A8. No seed, mock or UI change and no regression. `SEED_VERSION`
        stays 4, nothing under `src/lib/mock` or `src/components` changes,
        `npm run check` is green, and the full `npm run e2e` suite passes
        with the existing specs unchanged.
- **Refs:** added by `progress.mjs add` on 2026-10-23

### P7-T23 — Deal form Expected close uses shared isCalendarDay
- **Owner:** agent · **Depends:** —
- **Skills:** `tdd`, `vitest`, `playwright-cli`
- **Scope:** validation/opportunity.ts dateInputToIso uses date-fns parse and accepts '0099-01-01'; switch to @/lib/dates isCalendarDay/parseCalendarDay with a red-first test.
- **Acceptance:**
  - [ ] A1. One day rule. `dateInputToIso` checks validity with
        `isCalendarDay` and reads the parts with `parseCalendarDay`, both from
        `@/lib/dates`. `validation/opportunity.ts` no longer imports `parse`
        or `isValid` from date-fns and defines no day pattern of its own.
  - [ ] A2. `dateInputToIso` returns undefined for '' and for every string
        `isCalendarDay` refuses: '0099-01-01', '0000-01-01', '26-09-08',
        '2026-9-8', '2026-09-08 ', '2026-02-30', '10000-01-01', 'banana'.
  - [ ] A3. The local calendar date is kept. In UTC, Asia/Singapore and
        America/Los_Angeles, `dateInputToIso('2026-09-08')` is that zone's
        local midnight: '2026-09-08T00:00:00.000Z',
        '2026-09-07T16:00:00.000Z' and '2026-09-08T07:00:00.000Z'. LA's DST
        days give '2026-03-08T08:00:00.000Z' and '2026-11-01T07:00:00.000Z'.
        `isoToDateInput(dateInputToIso(d)) === d` for 2026-09-08, 2028-02-29,
        2026-03-08, 2026-11-01, 0100-01-01 and 9999-12-31 in all three zones.
        A seeded 17:00Z close re-saved in Singapore keeps its day, save after
        save.
  - [ ] A4. The form refuses what `dateInputToIso` would drop.
        `buildOpportunityFormSchema([])` on an otherwise complete draft
        reports exactly `{ expectedCloseAt: 'Enter a valid date.' }` for
        '0099-01-01', '0000-01-01', '2026-02-30' and '10000-01-01'. It reports
        no error for '', '2026-12-01', '2028-02-29' or '0100-01-01'. A day the
        user typed is never silently cleared on save.
  - [ ] A5. The deal sheet shows the error. With Expected close
        '0099-01-01', clicking 'Create deal' in the New deal sheet shows
        'Enter a valid date.' in the Expected close field, the input has
        aria-invalid='true', and the sheet stays open. With '2026-12-01' the
        field shows neither.
  - [ ] A6. Every new test has been seen failing. The red rows named in A2,
        A4 and A5 failed on the old code. The type-clean mutants (refine
        removed, date-fns parse restored, `Date.UTC` instead of local
        midnight, FieldError removed) each turned their own tests red.
  - [ ] A7. Comments match the code. The `dateInputToIso` doc comment
        describes the shared rule, local midnight, and undefined for empty or
        refused values (with the schema reporting the refusal first). The
        `src/lib/dates.ts` header lists the deal form among its users.
  - [ ] A8. No seed, mock or API change and no regression. SEED_VERSION stays
        4, nothing under src/lib/mock or src/lib/api changes, `npm run check`
        is green, and the full `npm run e2e` suite passes with the existing
        specs unchanged.
- **Refs:** added by `progress.mjs add` on 2026-10-23

### P7-T24 — Calendars sidebar: error state and Retry when calendars.list fails
- **Owner:** agent · **Depends:** —
- **Skills:** `shadcn`, `playwright-cli`
- **Scope:** calendars-workspace renders calendars.data ?? [] so a failed list reads empty; reuse LoadError.
- **Acceptance:**
  - [ ] A1. Calendars page, first load: when `calendars.list` fails, the
        calendar column shows a 'Could not load calendars' alert with the
        error's message and a Retry button. No 'Calendars' group, no calendar
        checkboxes and no skeleton are shown.
  - [ ] A2. The failed list does not block the view. The month view still
        draws the range's appointments with no calendar hidden, and no 'Could
        not load appointments' alert shows.
  - [ ] A3. While a Retry is in flight, the alert stays with its Retry busy
        (aria-disabled, spinner without an accessible name) and no skeleton
        appears. A Retry that fails again leaves the alert with Retry enabled.
        Once the fault clears, Retry lists the four calendars, all checked,
        and the alert is gone.
  - [ ] A4. In the 14rem column at the default 1280x720 viewport, the Retry
        button covers neither the alert's title nor its message, and the
        alert stays inside its column (it does not spill into the view and
        has no horizontal overflow).
  - [ ] A5. The error shows only when the read failed and there is no list to
        draw (LoadError's contract, DECISIONS P7-T13 and P7-T18). A refetch
        that fails with the list on screen keeps the list.
  - [ ] A6. Every new assertion has been seen failing. On the current code
        the new test fails (no alert). The type-clean mutants each turn it
        red: dropping `retrying` (no busy state), and showing the skeleton
        while `isRefreshing` (skeleton during Retry).
  - [ ] A7. Comments match the code. The `CalendarsWorkspace` doc comment
        describes the calendar-list error, its Retry, that the view still
        draws, and that a failed refetch keeps the list. The
        `calendars-load-errors.spec.ts` header lists the calendars page's
        calendar list.
  - [ ] A8. No seed, API, mock or shared-component change and no regression.
        `SEED_VERSION` stays 4; nothing under `src/lib/api`, `src/lib/mock` or
        `src/components/common` changes; `npm run check` is green; the full
        `npm run e2e` suite passes with the existing specs' assertions
        unchanged.
- **Refs:** added by `progress.mjs add` on 2026-10-23

### P7-T25 — Contact detail: error state instead of endless skeleton on non-404 load failure
- **Owner:** agent · **Depends:** —
- **Skills:** `shadcn`, `playwright-cli`
- **Scope:** contact-detail.tsx shows a skeleton forever on non-404 errors; reuse LoadError with Retry.
- **Acceptance:**
  - [ ] A1. Contact page, first load: when `contacts.get` fails with an error
        that is not a 404, the page shows the 'Contacts' back link and a
        'Could not load the contact' alert with the error's message and a
        Retry button. No skeleton, no 'Contact not found' state, no contact
        header and no tabs are shown.
  - [ ] A2. While a Retry is in flight, the alert stays with Retry busy
        (aria-disabled, and a spinner with no accessible name) and no skeleton
        appears. A Retry that fails again leaves the alert with Retry enabled.
        Once the fault clears, Retry shows the contact (its name heading and
        the Activity tab) and the alert is gone.
  - [ ] A3. A contact that does not exist (a 404) still shows 'Contact not
        found' and 'It may have been deleted.' with the back link, and no
        load-error alert and no skeleton.
  - [ ] A4. The error shows only when the read failed and no contact is on
        screen (LoadError's contract, DECISIONS P7-T13, P7-T18 and P7-T24). A
        refetch that fails with the contact on screen, with any error other
        than a 404, keeps the contact. This holds by construction
        (`useResource` keeps `data` for the same query when a refetch fails,
        and the error branch requires `contact.data === undefined`); no e2e
        can drive it, because only writes refetch the contact and each write
        drops the per-record fault.
  - [ ] A5. Every new assertion has been seen failing. On the current code the
        new failed-load test fails because no alert appears. Each type-clean
        mutant turns a test red: `retrying={false}`; a skeleton on
        `isLoading || isRefreshing` placed above the error branch;
        `onRetry={() => {}}`; and the error branch moved above the 404 check,
        which turns the not-found test red.
  - [ ] A6. Comments match the code. The `ContactDetail` doc comment describes
        the not-found state, the load error and its Retry (busy, never a
        skeleton), and that a failed refetch keeps the contact. The
        `calendars-load-errors.spec.ts` header lists the contact page and the
        not-found case. The `armContactFault` doc comment says why `failReads`
        cannot reach `contacts.get`, how the fault works, when it is armed,
        and its limits.
  - [ ] A7. No seed, API, mock or shared-component change and no regression.
        `SEED_VERSION` stays 4; nothing under `src/lib/api`, `src/lib/mock` or
        `src/components/common` changes; `npm run check` is green; the full
        `npm run e2e` suite passes with the existing specs' assertions
        unchanged.
- **Refs:** added by `progress.mjs add` on 2026-10-23

### P7-T26 — Past appointments: only Showed/No-show; Cancel and Confirmed for future only (P7-H3)
- **Owner:** agent · **Depends:** —
- **Scope:** Apply the P7-H3 owner rule (DECISIONS.md 2026-10-23) in two places. Past = the appointment's end is before the demo now (apiNow()/nowIso(), never new Date()). (1) appointment-details-dialog.tsx: for a past appointment the status select offers only Showed and No-show and the Cancel button is not shown; for a future one Cancel and Confirmed stay offered as today. (2) src/lib/api/calendars.ts setStatus()/cancel(): reject moving a past appointment to confirmed or cancelled with ApiError 422 (plain-language message, new code e.g. PAST_APPOINTMENT), checked in the same synchronous block as the write, nothing written. The rule names target statuses only; Showed/No-show on future appointments is unchanged. Flag to the owner if a case is unclear (e.g. a past appointment already Cancelled).
- **Acceptance:**
  - [ ] Vitest: setStatus() on a past appointment to confirmed and cancel() on a past appointment both reject with ApiError status 422 and write nothing (appointment and activities unchanged); past -> showed, past -> no_show and showed <-> no_show succeed; future cancel/confirm still succeed. e2e or component test: the details dialog for a past appointment offers only Showed and No-show and has no Cancel button; for a future appointment Cancel and Confirmed are offered.
- **Refs:** added by `progress.mjs add` on 2026-10-23

### P7-T27 — e2e: longer toHaveURL timeout for cross-route navigation
- **Owner:** agent · **Depends:** —
- **Skills:** `playwright-cli`
- **Scope:** Two specs flaked once at 5s toHaveURL after leaving /calendars under full-suite load; raise timeout for cross-route nav or cap Playwright workers on Windows.
  - From the P7-T21 review: the playwright.config.ts comment above `timeout: 60_000` says expect's timeout and the worker count are "left at their defaults on purpose"; update it to say what this task decided (and name P7-T27). In calendars-booking.spec.ts, the two `test.slow()` comments say "Playwright's old 30s default": 30s is still Playwright's default, so say "the 30s Playwright default this suite used before", and date the measured durations ("measured in P7-T21").
  - From the P7-T25 review: the contact-page test in calendars-load-errors.spec.ts has two `toHaveURL` checks after client-side navigation (`/contacts$` and `/contacts/${id}$`); cover them with the same timeout.
  - From the P7-T26 review: e2e/calendars-details.spec.ts's header comment (~:23-25) had a sentence spliced into one line, which now runs past the block's wrap width; rewrap it by hand (Prettier does not rewrap comments).
  - Decided: the worker count and expect's 5s timeout stay at Playwright's
    defaults, with no Windows worker cap. Only client-side navigations to
    another route were slow (the new route is fetched from `next start`,
    4-6s under full-suite load), and a cap would slow every run to fix that
    one kind of wait.
  - Decided: one shared `NAVIGATION = { timeout: 15_000 }` in
    `e2e/fixtures.ts` covers the first wait after every client-side
    navigation to another route (a link, a list row, the sidebar).
    Same-route URL changes (the calendars' view and date, the availability
    editor's `?calendar=`, both through `history.pushState`/`replaceState`)
    and "URL unchanged" checks keep the 5s default.
- **Acceptance:**
  - [ ] A1. There is one shared navigation timeout. `e2e/fixtures.ts`
        exports `NAVIGATION = { timeout: 15_000 }`, with a doc comment that
        gives the reason (a navigation to another route fetches from
        `next start`, 4-6s under load), says that same-route URL changes keep
        the default and why (pushState/replaceState), and names P7-T27. The
        local copies in `calendars-availability-editor.spec.ts` and
        `link-buttons.spec.ts` are gone; both import it from `./fixtures`.
  - [ ] A2. Every first wait after a client-side navigation to another route
        uses `NAVIGATION`: in `calendars-availability.spec.ts`, after
        Availability and after Back to calendars; in
        `calendars-booking.spec.ts`, the contact page and the dashboard; in
        `calendars-details.spec.ts`, the dashboard and the contact page; in
        `calendars-load-errors.spec.ts`, both `/calendars` checks, the
        contact page test's heading, `/contacts` and `/contacts/${id}`
        checks, and `/calendars/availability`. The editor and link-buttons
        sites already had it. Same-route URL checks (`calendars.spec.ts`,
        `calendars-month.spec.ts`, the editor's `?calendar=` checks), "URL
        unchanged" checks and `smoke.spec.ts`'s server redirect on `goto`
        keep the 5s default. No assertion's target or URL pattern changes.
  - [ ] A3. In `playwright.config.ts`, `timeout: 60_000`, `retries: 0` and
        `fullyParallel: true` are unchanged and there is still no `expect` or
        `workers` key. The comment above `timeout` says what P7-T27 decided:
        expect's 5s timeout and the worker count stay at the defaults, waits
        after a navigation to another route use `NAVIGATION` from
        `e2e/fixtures.ts`, and a worker cap was rejected because it would
        slow every run.
  - [ ] A4. Both `test.slow()` comments in `calendars-booking.spec.ts` say
        "the 30s Playwright default this suite used before" and "(measured in
        P7-T21)". The durations (7s/28s and 6s/27s) are unchanged, and
        `test.slow()` is still the first statement of both tests.
  - [ ] A5. The `calendars-details.spec.ts` header comment is rewrapped by
        hand: no line in the block is longer than 80 columns, and its words
        are unchanged.
  - [ ] A6. No product change and no regression. Nothing under `src/`
        changes, `SEED_VERSION` stays 4, and `npm run check` is green. The
        full `npm run e2e` passes with the same test count as before, and a
        stress run of the six touched specs (`--repeat-each=3`, default
        worker count) passes.
  - [ ] A7. This entry carries a Skills line, this acceptance and the two
        decisions.
- **Refs:** added by `progress.mjs add` on 2026-10-23

### P7-T28 — Name the unlabelled Select triggers
- **Owner:** agent · **Depends:** —
- **Skills:** `shadcn`, `playwright-cli`, `webapp-testing`
- **Scope:** Add aria-label to SelectTriggers in contacts-toolbar.tsx:52, board-toolbar.tsx:43, bulk-actions-bar.tsx:102; add non-empty-name check in e2e/select-a11y.spec.ts
  - From the P7-T16 review: CLAUDE.md's read_page note says Chromium ignores the hidden input behind every Select *and Combobox*, citing e2e/select-a11y.spec.ts, but the spec checks only Selects. Add one Combobox case (the TagPicker in the Add contact sheet) so the note is proven, or narrow the note to Select.
  - Also from P7-T16: the per-route tests wait only for the first trigger, so a Select that mounts after the skeletons clear would go unchecked; pin the expected trigger count (or names) per route, as the Add contact test already does.
  - Decided: each new aria-label is the trigger's own placeholder text
    ("Status", "Pipeline", "Assign owner"), so the visible text and the
    spoken name agree (WCAG's label-in-name rule). Both pipeline switchers
    (dashboard and opportunities board) are named "Pipeline".
  - Decided: the Combobox case is the Add contact TagPicker. It is named
    through the sheet's existing `FieldLabel htmlFor="tagIds"`, with
    TagPicker passing an optional `id` to its text input, not through an
    aria-label. The contacts-toolbar, bulk Tags popover and deal-sheet
    TagPickers, and the contacts search input, go to a follow-up task.
  - Decided: the CLAUDE.md read_page note keeps "Select and Combobox"; the
    new TagPicker case proves it.
  - Decided: expected names are pinned twice: waited for with `getByRole`
    (which catches a late-mounting Select), and compared as Chromium's own
    names, read through CDP, in page order.
- **Acceptance:**
  - [ ] A1. The three unnamed Select triggers get names that match their
        placeholders: the contacts status filter is "Status"
        (contacts-toolbar.tsx:52), the opportunities pipeline switcher is
        "Pipeline" (board-toolbar.tsx:43) and the bulk-actions Owner Select
        is "Assign owner" (bulk-actions-bar.tsx:102). No other change in
        those files.
  - [ ] A2. The spec fails for any checked trigger with an empty accessible
        name in Chromium's tree: `controlAxProblems` reports `<Noun> trigger
        N is exposed combobox named "", expected a non-empty name`.
  - [ ] A3. Each per-route test pins its expected triggers by name:
        /dashboard [Pipeline], /conversations [Filter by channel], /contacts
        [Status], /opportunities [Pipeline], /calendars/availability
        [Calendar]. It waits for each by role and name, the trigger count
        equals the list length, and Chromium's CDP names equal the list in
        page order with no problems. A late Select is waited for, and a
        missing or extra one fails.
  - [ ] A4. Bulk-actions Owner popover: after a row is selected and Owner is
        opened, the popover holds exactly one Select, an exposed combobox
        named "Assign owner" whose hidden input Chromium ignores because of
        its own aria-hidden.
  - [ ] A5. Combobox case: in the Add contact sheet, the TagPicker's text
        input is an exposed combobox named "Tags" (the existing `FieldLabel
        htmlFor="tagIds"` reaches it because TagPicker passes an optional
        `id` to its input), and its Base UI hidden input
        (`[data-slot="combobox-chips"] ~ input[id$="-hidden-input"]`) is
        ignored for its own aria-hidden, count 1 to 1. CLAUDE.md's "Select
        and Combobox" read_page note is unchanged and now backed by this
        test.
  - [ ] A6. The Add contact Selects test keeps its six names (Status,
        Source, Owner, Budget Range, Company Size, Preferred Contact Method)
        and its count of 6, and now also pins Chromium's names in page order
        through the shared helper.
  - [ ] A7. No seed, API or mock change, and no regression. Only
        contacts-toolbar, board-toolbar, bulk-actions-bar, tag-picker and
        contact-form-sheet change under `src/`, nothing under `src/lib`
        changes, `SEED_VERSION` stays 4, `npm run check` is green, and the
        full `npm run e2e` passes with the previous test count + 3.
  - [ ] A8. This entry carries a Skills line, this acceptance and the four
        decisions.
- **Refs:** added by `progress.mjs add` on 2026-10-23

### P7-T29 — Fix ContactPicker selection race after a pick
- **Owner:** agent · **Depends:** —
- **Skills:** `tdd`, `vitest`, `playwright-cli`, `vercel-react-best-practices`
- **Scope:** Keep picked Contact in local state as value immediately; use selected.data only when id matches. Add e2e typing right after a pick without aria-selected wait.
  - From the P7-T17 review: new-conversation-dialog.tsx is a third ContactPicker consumer; add it as a third entry in SURFACES in e2e/contact-picker.spec.ts (and name it in that file's header) so its behaviour is pinned too. In pickContacts, make the uniqueness check cover phone and jobTitle as well (add them to SeededContact in calendar-helpers.ts), since the server searches those. In query-engine.test.ts, note on the mixed-fields case that its first assertion is the one proving function fields work.
  - Decided: the value rule is a pure helper, `pickerValue` in
    `contact-picker-value.ts`, unit-tested next to the component like the
    calendars helpers (`booking-slots.ts` and the rest).
  - Decided: the picked object wins over a fetched contact with the same id,
    because Base UI compares the value by reference and writes its label into
    the input whenever it changes.
  - Decided: the "does not pin" test drops its aria-selected wait, and a
    separate per-surface test proves that text typed right after a pick
    stays.
- **Acceptance:**
  - [ ] A1. A pick is the combobox value at once. ContactPicker keeps the
        picked Contact in local state and passes it as `value` in the same
        handler that calls `onChange(id)`, without waiting for
        `contacts.get`. In the deal sheet, the booking dialog and the
        new-conversation dialog, text typed right after a pick (no
        aria-selected wait) stays in the input and the list shows the
        server's results for it. The picked contact stays selected.
  - [ ] A2. The fetched contact (`selected.data`) is used only when its id
        equals `value`, and the picked object wins over a fetched one with
        the same id. A value set from outside still shows its name once
        fetched. A cleared value shows nothing, even while `useResource`
        still holds the previous contact.
  - [ ] A3. The P7-T17 workaround is gone. The "does not pin the selected
        contact above an unrelated search" test types right after the pick,
        with no ArrowDown press, no aria-selected wait and no comment about
        the overwrite race.
  - [ ] A4. The new-conversation dialog is the third entry in SURFACES:
        /conversations, then the "New" button, then the "New conversation"
        dialog's "Contact" combobox. The spec header names all three forms,
        and every picker test runs for it.
  - [ ] A5. pickContacts' uniqueness check covers every field the server
        searches: name, email, phone, company and job title, matching
        `SEARCH_FIELDS` in src/lib/api/contacts.ts. `SeededContact` gains
        `phone` and `jobTitle` (`string | null`), read from the persisted
        database by `readContacts`. The pickContacts doc comment lists the
        fields.
  - [ ] A6. In query-engine.test.ts, the mixed-fields assertion carries a
        comment saying that it alone would pass even if function fields were
        skipped, and that the `nameAndCompany` assertion above is the one
        proving function fields are searched. No assertion changes.
  - [ ] A7. Comments match the code. contact-picker.tsx's doc comment and the
        comment above `selected` say that a pick is held locally and is the
        value at once, that the fetched contact is used only when its id
        matches, and that it serves a value set from outside.
        contact-picker-value.ts explains why the picked object wins: Base UI
        compares the value by reference and writes the label into the input
        when it changes.
  - [ ] A8. No seed, API or mock change, and no regression. Under `src/lib`,
        only a comment in query-engine.test.ts changes. `SEED_VERSION` stays
        4. `npm run check` is green with 4 more Vitest cases. The full
        `npm run e2e` passes with 102 tests (96 + 6). A `--repeat-each=3` run
        of contact-picker.spec.ts passes.
  - [ ] A9. This entry carries a Skills line, this acceptance and the three
        decisions.
- **Refs:** added by `progress.mjs add` on 2026-10-23

### P7-T30 — Shared chooseContact e2e helper
- **Owner:** agent · **Depends:** —
- **Skills:** `playwright-cli`
- **Scope:** Move the three copies of booking-dialog contact pick (fill + option click) into e2e/calendar-helpers.ts chooseContact and use it in calendars-booking, calendars-booking-dialog, calendars-load-errors specs.
  - From the P7-T18 review, in the same spec files: in calendars-load-errors.spec.ts, the RetryWatch.sawSkeleton doc should say "inside `scope`" (watchRetry now takes a scope), and the aria-busy MutationObserver should read the mutation records (attributeOldValue: true) rather than the live attribute. In calendars-booking-dialog.spec.ts, the header claims sixteen times on both 9 and 10 September but only the 9th is checked: trim the claim or assert it.
  - From the P7-T24 review, in calendars-load-errors.spec.ts: rewrap the header line edited in P7-T24 (~:25, ~93 characters) to match the block, and scope the calendars test's `watchRetry(page, "main")` to the calendar column, since it reads the first `[data-slot="alert"]` in main.
  - From the P7-T21 review: failReads' Limits paragraph in calendar-helpers.ts names only calendars.ts. Add that any other API call reading the table through `Object.values` throws too while the fault is on, e.g. template rendering (templates.ts), analytics (analytics.ts) and the settings integrity check (settings.ts).
  - From the P7-T27 review, in e2e/fixtures.ts: make `NAVIGATION` read-only (`as const` or `Object.freeze`) so no spec can change it for the others, and reword "So do 'the URL did not change' checks." to say plainly that those keep the 5s default too. Add a one-line e2e note (LEARNINGS or CLAUDE.md) that the first wait after a cross-route navigation passes the shared `NAVIGATION`, so new specs do not write a local copy again.
  - From the P7-T29 review: move `pauseTimers` from e2e/contact-picker.spec.ts into the shared e2e helpers next to `chooseContact`, so the next race test can reuse it.
  - Decided: `chooseContact` lives in calendar-helpers.ts next to
    `chooseCalendar` and matches the option by exact name, with no
    `.first()`. Callers pass a uniquely named contact: `uniquelyNamedContact`,
    moved there from calendars-booking-dialog.spec.ts.
    calendars-booking.spec.ts keeps its own `uniqueContact` (it also requires
    a unique last name and takes a skip), so it picks the same seeded
    contacts as before.
  - Decided: the booking-dialog header's sixteen-times claim is trimmed, not
    asserted.
  - Decided: `NAVIGATION` is `Object.freeze`d, and a fixture self-test checks
    it.
  - Decided: the calendar column scope is a test-only
    `data-e2e-calendar-column` attribute set from the spec; the app's markup
    does not change.
  - Decided: the NAVIGATION note goes in LEARNINGS, not CLAUDE.md.
  - Decided: the P7-T24 header rewrap was already done in P7-T25, so the
    calendars-load-errors.spec.ts header needs no edit.
- **Acceptance:**
  - [ ] A1. One `chooseContact(page, dialog, contact)` is exported from
        e2e/calendar-helpers.ts, next to `chooseCalendar`.
        calendars-booking, calendars-booking-dialog and calendars-load-errors
        call it, and none of them fills the Contact combobox and clicks an
        option itself.
  - [ ] A2. The shared pick matches the option by exact name with no
        `.first()`. Every caller passes a uniquely named contact:
        `uniquelyNamedContact` (moved from calendars-booking-dialog.spec.ts
        into calendar-helpers.ts) in booking-dialog and load-errors, and
        `uniqueContact` in calendars-booking.
  - [ ] A3. `pauseTimers` is exported from e2e/calendar-helpers.ts directly
        after `chooseContact`, with no local copy left, and
        contact-picker.spec.ts imports it. P7-T40's entry points at its new
        home.
  - [ ] A4. calendars-load-errors.spec.ts: the RetryWatch.sawSkeleton doc
        says "inside `scope`". The Time-group aria-busy observer reads
        mutation records with `attributeOldValue: true` and never reads the
        live attribute in its callback.
  - [ ] A5. The calendars-list test watches Retry inside the calendar column
        only, not `main`. The test proves its scope is that column: one
        element, holding the calendars alert, not holding the Month view, and
        holding the Calendars group after Retry.
  - [ ] A6. Every line of the calendars-load-errors.spec.ts header is 80
        characters or less (the P7-T24 note; already true since P7-T25, so
        no edit).
  - [ ] A7. The calendars-booking-dialog.spec.ts header claims only what the
        spec relies on: open times on 9 and 10 September, and 12:00 AM on the
        9th, which the phone test checks. It no longer claims sixteen times
        on both days.
  - [ ] A8. failReads' doc says that any other API call reading the table
        through `Object.values` throws while the fault is on, naming
        `render()` in templates.ts, `summary()` in analytics.ts and
        `integrityReport()` in settings.ts.
  - [ ] A9. `NAVIGATION` is read-only: `Object.freeze({ timeout: 15_000 })`,
        with type `Readonly<{ timeout: number }>`. Its doc says plainly that
        checks that the URL did not change keep the 5s default too. A
        one-line LEARNINGS note (reported by the implementer, appended by the
        recorder) says the first wait after a cross-route navigation passes
        the shared `NAVIGATION`.
  - [ ] A10. No app, seed or mock change, and no regression.
        `git diff --stat -- src` is empty, `SEED_VERSION` stays 4,
        `npm run check` is green with the same Vitest count, and the full
        `npm run e2e` passes with 103 tests (102 + 1 fixture self-test). This
        entry carries a Skills line, this acceptance and the Decided lines.
- **Refs:** added by `progress.mjs add` on 2026-10-23

### P7-T31 — LinkButton helper and nativeButton lint rule
- **Owner:** agent · **Depends:** —
- **Skills:** `shadcn`, `vitest`, `writing-for-agents`
- **Scope:** Export a cn(buttonVariants()) link helper from ui/button.tsx; no-restricted-syntax for nativeButton={false} in modules; fix pagination.tsx PaginationLink
  - From the P7-T19 review: move the six P7-T19 links onto the helper, so no caller can drop `cn()` again.
  - Add a CLAUDE.md "Non-obvious constraints" line: a navigating control is the link helper (or `<Link className={cn(buttonVariants(...))}>`), never `Button render={<Link/>} nativeButton={false}` (role="button") and never a bare `buttonVariants()` string (the outline border is lost in light mode). The shadcn skill recommends `nativeButton={false}`, so agents will keep reaching for it.
  - Decided: the helper is a component, `LinkButton` (Next's `Link` with
    `cn(buttonVariants({ variant, size, className }))`), not a class-string
    function, so callers never handle the class string.
  - Decided: `PaginationLink` stays a plain `<a>`, because it takes any
    href (e.g. `?page=2`). Its classes are spelled `cn(buttonVariants(...))`
    inside ui. It does not move onto Next's Link.
  - Decided: the lint rule covers all app code (`src/**/*.{ts,tsx}` except
    `src/components/ui/**`), not only modules, and bans every
    `nativeButton={false}`. A non-link element that really is a button
    disables the line with a reason. ui primitives (vendor code) are exempt.
  - Decided: the same rule also rejects a bare
    `className={buttonVariants(...)}`, the other half of the CLAUDE.md line.
  - Decided: LinkButton carries `data-slot="link-button"`, not `"button"`,
    so `[data-slot="button"]` lookups (such as the Retry lookup in
    e2e/calendars-load-errors.spec.ts) keep matching buttons only.
  - Decided: the per-site why-comments from P7-T19 are removed. The why
    lives once, in LinkButton's JSDoc.
- **Acceptance:**
  - [ ] A1. LinkButton exists and is a plain link with Button's look.
        src/components/ui/button.tsx exports `LinkButton`: Next's `Link`
        with `cn(buttonVariants({ variant, size, className }))`, Button's
        default variant and size, and `data-slot="link-button"`; every other
        Link prop (href, ref, onNavigate, aria-label) is passed through. It
        renders an `<a href>` with no role attribute. Its class string equals
        `<Button>`'s for all 6 variants x 8 sizes, and with a caller
        className. outline/sm keeps `border-border` and the 8px radius
        class, without `border-transparent` or `rounded-lg`. A test pins the
        cause: Base UI's Button rendering an `<a>` with
        `nativeButton={false}` has role="button".
  - [ ] A2. The six P7-T19 links are LinkButtons and look and behave as
        before: View contact (contact-panel, outline sm), Back to inbox in
        the empty state (thread-view, outline), Back to inbox on a phone
        (thread-view, ghost icon-sm, aria-label), Open board (pipeline-card,
        ghost sm), Availability (calendars-workspace, outline) and Back to
        calendars (availability-workspace BackLink, outline, ref +
        onNavigate). No `buttonVariants` import is left in app code outside
        src/components/ui. e2e/link-buttons.spec.ts and the
        availability-editor Back-link test pass with their assertions
        unchanged.
  - [ ] A3. PaginationLink is a link. src/components/ui/pagination.tsx
        renders `<a>` with
        `cn(buttonVariants({ variant: isActive ? "outline" : "ghost", size, className }))`,
        not a Base UI Button. It has no role attribute, aria-current="page"
        when active, outline/ghost icon parity with Button, and
        PaginationPrevious/Next keep the default size and their padding
        override. No `nativeButton=` is left anywhere in src.
  - [ ] A4. The lint rule. eslint.config.mjs sets `no-restricted-syntax`
        (error) for `src/**/*.{ts,tsx}` except `src/components/ui/**`. It
        rejects any `nativeButton={false}` and a bare
        `className={buttonVariants(...)}`, with messages that name
        LinkButton and CLAUDE.md. `cn(buttonVariants())`, `<LinkButton>`,
        `nativeButton` and `nativeButton={true}` pass. ui primitives are
        exempt. The repo lints clean.
  - [ ] A5. CLAUDE.md "Non-obvious constraints" has the line: a navigating
        control is `<LinkButton>` (or `<Link className={cn(buttonVariants(...))}>`);
        never `Button render={<Link/>} nativeButton={false}`, because of
        role="button"; never a bare `buttonVariants()` string, because the
        outline border is lost in light mode; the shadcn skill recommends
        `nativeButton={false}`, and ESLint rejects both spellings outside
        src/components/ui.
  - [ ] A6. Every new test has been seen failing: LinkButton without cn()
        fails the parity and outline-sm tests; LinkButton as
        `Button render={<Link/>} nativeButton={false}` fails the no-role
        test; the old PaginationLink fails both PaginationLink tests; with
        the eslint block removed, the error cases fail; putting
        `Button render={<Link/>} nativeButton={false}` or
        `className={buttonVariants(...)}` back at a module site makes
        `npx eslint <file>` exit 1.
  - [ ] A7. Comments and docs match the code: LinkButton's JSDoc gives both
        causes (role=button; the class merge) and says it is a local
        addition to keep when updating; PaginationLink has a one-line why;
        the six sites no longer carry the P7-T19 why-comments; the eslint
        block comment explains the rule; the link-buttons.spec.ts header
        names LinkButton; this entry has a Skills line, the Decided lines
        and this acceptance.
  - [ ] A8. No seed, API or mock change and no regression. `SEED_VERSION`
        stays 4, nothing under src/lib changes, `npm run check` is green
        with the Vitest count up only by the new button.test.ts tests, the
        full `npm run e2e` passes with 103 tests and the existing specs'
        assertions unchanged, and `npm ls @tanstack/react-table` prints
        8.21.3.
- **Refs:** added by `progress.mjs add` on 2026-10-23

### P7-T32 — Link-button icon padding and link-buttons spec scoping
- **Owner:** agent · **Depends:** P7-T31
- **Skills:** `shadcn`, `playwright-cli`, `vitest`, `writing-for-agents`
- **Scope:** From the P7-T19 review (this id was first added by mistake as a duplicate of P7-T31, and was repurposed rather than deleted, since the tracker cannot delete rows).
  - Give the View contact (contact-panel.tsx) and Open board (pipeline-card.tsx) icons `data-icon="inline-start"` / `"inline-end"`, as the calendars links have, so the size's icon padding applies; update the A2 look values in e2e/link-buttons.spec.ts if they change.
  - In e2e/link-buttons.spec.ts (~:163), scope the thread-header contact link lookup to the thread header instead of `main ... .first()`, so it does not depend on DOM order.
  - From the P7-T31 review, in eslint.config.mjs: the `nativeButton={false}` message speaks only of links, but the ban also fires on a Base UI trigger (Menu, Popover, Dialog, Select) that renders a non-button element; add a clause for that case ("a trigger that renders a non-button element: disable this line with a reason"), and keep scripts/eslint-config.test.mjs's message assertions green. Shrink LINK_BUTTON_RULE's block comment to a pointer to LinkButton's JSDoc in ui/button.tsx, so the two causes are explained once (CLAUDE.md keeps its line).
  - In src/components/ui/button.test.ts (~:84), drop `expect(VARIANTS).toHaveLength(6)` / `expect(SIZES).toHaveLength(8)`, which check fixed literals and cannot fail; say in the test that the `expectTypeOf` pair is the guard and fails under `npm run typecheck`, not Vitest.
  - Decided: the padding is pinned through the shared `sizeLook` object, so
    all four look tests (Open board, View contact, both Back to inbox
    links) pin it in one place, as P7-T19 decided for the other fields.
    This supersedes P7-T19's "no data-icon added".
  - Decided: the thread header is found from its own Contact details toggle,
    as the nearest ancestor that holds a contact link
    (`xpath=ancestor::*[.//a[starts-with(@href, "/contacts/")]][1]`). The
    lookup is test-only: no markup hook is added to the app.
  - Decided: the trigger clause is proven by a `PopoverTrigger` rendered as
    a div: it is flagged with the clause, and it lints clean behind a
    reasoned `eslint-disable-next-line no-restricted-syntax -- …`.
  - Decided: the "lists every variant and size" test stays, now type-only,
    because its `expectTypeOf` pair is the typecheck guard.
- **Acceptance:**
  - [ ] A1. Icon padding. View contact's icon is
        `<ExternalLinkIcon data-icon="inline-start" />` (contact-panel.tsx)
        and Open board's is `<ArrowRightIcon data-icon="inline-end" />`
        (pipeline-card.tsx), so sm's icon padding applies. In light mode
        View contact computes paddingLeft 6px / paddingRight 10px, and Open
        board 10px / 6px. Their height, radius, icon width and border are
        unchanged (28px / 8px / 14px, visible and none).
  - [ ] A2. The spec's look checks include padding. `ButtonLook` and
        `buttonLook()` read paddingLeft and paddingRight, `sizeLook()`
        returns them, and every `sizeLook` assertion pins them: the
        empty-state Back to inbox 10px / 10px, the phone Back to inbox
        0px / 0px. The spec header and `sizeLook`'s JSDoc mention padding
        and where 10px and 6px come from.
  - [ ] A3. The thread-header contact link is found inside the thread
        header, not through `main … .first()`. The header comes from its
        Contact details toggle (the nearest ancestor that holds a
        `/contacts/` link). It resolves to one element, holds no View
        contact link and exactly one `/contacts/` link, and that lookup has
        no `.first()` left.
  - [ ] A4. The ESLint `nativeButton={false}` message still names
        LinkButton and CLAUDE.md, and adds the trigger clause: a Base UI
        trigger (Menu, Popover, Dialog, Select) that renders a non-button
        element disables the line with a reason. The selectors are
        unchanged. A PopoverTrigger-as-div snippet is flagged with that
        message and lints clean behind a reasoned
        `eslint-disable-next-line no-restricted-syntax -- …`. The existing
        message assertions stay green and the repo lints clean.
  - [ ] A5. LINK_BUTTON_RULE's block comment is a pointer: it names the two
        banned spellings and sends the reader to LinkButton's JSDoc in
        src/components/ui/button.tsx for the why, without explaining
        role=button or the class merge again. CLAUDE.md's line and
        LinkButton's JSDoc are unchanged.
  - [ ] A6. button.test.ts no longer has `expect(VARIANTS).toHaveLength(6)`
        or `expect(SIZES).toHaveLength(8)`. The test's comment says the
        `expectTypeOf` pair is the guard and fails under
        `npm run typecheck`, not Vitest. With "link" removed from VARIANTS,
        `npm run typecheck` fails at button.test.ts while
        `npx vitest run src/components/ui/button.test.ts` still passes.
  - [ ] A7. Every new or changed assertion has been seen failing. On the
        markup before data-icon, the View contact and Open board tests fail
        on padding (10px received). Against the old ESLint message, the
        trigger-clause assertions fail.
  - [ ] A8. Docs and no regression. This entry has a Skills line, the
        Decided lines and this acceptance. `SEED_VERSION` stays 4 and
        nothing under src/lib changes. `npm run check` is green, with the
        Vitest count unchanged and test:scripts up by 1. The full
        `npm run e2e` passes with 103 tests. `npm ls @tanstack/react-table`
        prints 8.21.3, `node scripts/progress.mjs --check` is clean, and
        `git grep "nativeButton=" -- src` is empty.
- **Refs:** added by `progress.mjs add` on 2026-10-23; repurposed in the P7-T19 review

### P7-T33 — App-wide unsaved-changes guard (sidebar links, reload, tab close)
- **Owner:** agent · **Depends:** —
- **Skills:** `vercel-react-best-practices`, `vercel-composition-patterns`, `playwright-cli`
- **Scope:** Extend the availability guard via Next Link onNavigate + context blocker (link.md 'Blocking navigation') and a beforeunload handler while dirty.
  - From the P7-T20 review: in calendars-availability-editor.spec.ts ("a clean editor switches and leaves without asking"), cover the two missing clean cases, a calendar switch right after Save and Back right after load, so each control is proven unguarded after load, Discard and Save.
  - In availability-workspace.tsx, call `setDirty(false)` before `router.push("/calendars")` on Discard, so a second Back click during a slow push does not ask again.
  - availability-form.tsx reports `isDirty` through an effect that re-fires when `onDirtyChange` changes identity: say in the prop doc that it must be stable (as `setDirty` is), or report through RHF's `form.subscribe({ formState: { isDirty: true } })`, which the app-wide blocker will need anyway.
  - Decided: the leave question is the app's `ConfirmDialog`, owned by a
    new `UnsavedChangesProvider` (src/components/providers/unsaved-changes.tsx)
    in the (app) layout. A page registers the name of what has unsaved edits
    with `useUnsavedChanges(subject)`; a link asks through
    `useLeaveGuard()(href)` as its Next Link `onNavigate`.
  - Decided: reload and tab close ask through the browser's own
    `beforeunload` prompt, added only while a page is registered. Its text
    is the browser's and cannot be set.
  - Decided: the guarded links are the sidebar's 7 nav links, the user
    menu's My profile and Team settings, and Back to calendars. This
    supersedes P7-T20's guard-scope line. The browser's back and forward and
    a programmatic `router.push` stay unguarded: Next has no API to cancel a
    history traversal.
  - Decided: Back to calendars moves to the provider's question; the
    workspace's own dialog keeps only the calendar switch.
  - Decided: the Discard fix (the second scope item) lives in the
    provider's Discard changes, which releases the registration before it
    calls `router.push(href)`.
  - Decided: the `onDirtyChange` item is settled by the prop doc ("must
    keep one identity"), with no `form.subscribe`: the provider is fed from
    the workspace's `dirty` state, which the form already reports.
  - Decided: the clean-editor e2e becomes one test per clean state (just
    loaded, after Discard changes, after Save), each driving the calendar
    switch, Back to calendars and a sidebar link.
- **Acceptance:**
  - [ ] A1. Every sidebar link asks first while the editor has unsaved
        edits. On /calendars/availability with Slot duration changed to 45,
        each of the sidebar's 7 nav links and the user menu's My profile and
        Team settings opens "Discard unsaved changes?" naming Discovery Call
        ("Leaving this page will discard them"), with Keep editing focused;
        the URL stays /calendars/availability. Keep editing or Escape closes
        it with the edit intact (45, the form's Discard changes enabled)
        and, for a nav link, focus back on that link.
  - [ ] A2. Discard changes on a sidebar link leaves at once and drops the
        edit: Contacts goes to /contacts with no alert dialog, and reopening
        the editor shows Slot duration 30.
  - [ ] A3. Back to calendars goes through the same app-wide question. The
        existing "Back to calendars with unsaved edits asks first, by
        keyboard and pointer" test passes unchanged, and the workspace's own
        dialog now handles only the calendar switch.
  - [ ] A4. Discard releases the guard before the push. With /calendars
        route data held, after Discard changes a second Back click during
        the push opens no question, and once released the page lands on
        /calendars.
  - [ ] A5. Reload and tab close ask while the editor has unsaved edits.
        The browser's beforeunload prompt appears; dismissing it on reload
        keeps the page and the edit (45); dismissing it on close keeps the
        tab open; accepting it on reload reloads to the saved Slot duration
        30.
  - [ ] A6. The browser's Back is not guarded and leaves no stale question.
        With the question open from a sidebar link, browser Back returns to
        /calendars with no alert dialog and no beforeunload guard left.
  - [ ] A7. A clean editor never asks. Right after load, after the form's
        Discard changes and after Save, switching calendars, Back to
        calendars and a sidebar link each act at once with no alert dialog,
        and a beforeunload is not prevented. This covers the P7-T20
        review's missing cases: switch after Save, Back after load.
  - [ ] A8. The `onDirtyChange` prop doc says the callback must keep one
        identity across renders (a state setter, as `setDirty` is) and why.
        The reporting effect is unchanged and no `form.subscribe` is added.
  - [ ] A9. Every new test has been seen failing. On HEAD's src, T-A fails
        at the dialog check and T-B sees no beforeunload guard. T-C fails
        against a provider that pushes before releasing. T-D fails without
        the close-on-release. Each T-E fails against a type-clean
        AvailabilityForm that always reports dirty, and its beforeunload
        check fails against a listener installed regardless of dirty.
  - [ ] A10. No seed, API or mock change and no regression. SEED_VERSION
        stays 4, nothing under src/lib or src/components/ui changes,
        `npm run check` is green with the Vitest count unchanged (547), the
        full `npm run e2e` passes with 109 tests (103 + 6) and the other
        specs unchanged, `npm ls @tanstack/react-table` prints 8.21.3, and
        `node scripts/progress.mjs --check` is clean.
  - [ ] A11. Docs match the code. unsaved-changes.tsx's JSDoc says what is
        guarded and what is not (browser back/forward, `router.push`,
        new-tab clicks), that there is one registrant, and that the prompt
        text is fixed. The AvailabilityWorkspace doc comment no longer says
        the sidebar, reload or tab close are unguarded. The spec header
        describes the new coverage. This entry has a Skills line, the
        Decided lines and this acceptance.
- **Refs:** added by `progress.mjs add` on 2026-10-23

### P7-T34 — Calendar update: validate or allow-list keys outside the settings schema
- **Owner:** agent · **Depends:** —
- **Skills:** `tdd`, `vitest`
- **Scope:** update() passes name/color/teamMemberIds/isActive/description unchecked (null or wrong type overwrites required fields) and lets createdAt be overwritten; validate the merged record or allow-list, always keep prev.createdAt (calendars.ts:163-164).
  - From the P7-T22 review, in the same file: add one BAD_PATCHES row whose issue path is top-level and unlabelled (e.g. a non-object patch, as a JSON client might send) to pin the "Calendar settings" fallback label. Type `withoutUndefined` as `{ [K in keyof T]?: Exclude<T[K], undefined> }` so TypeScript enforces what it guarantees. Note at `settingLabel` that "window N" counts windows in the order sent, while the editor's `toAvailabilityPatch` sorts them by start time, so whoever wires `ApiError.field` into the form maps it through the same order.
  - Decided: update() saves what `calendarSettingsSchema` parses (an
    allow-list), never the raw patch. The editable keys are the booking
    settings plus name, description, color, teamMemberIds and isActive. id,
    slug, type, createdAt, createdBy, updatedAt and unknown keys are ignored
    at every depth, so a whole-record round trip still saves. slug and type
    are fixed at creation: slug is the availability editor's `?calendar=`
    key, and changing it would need a uniqueness rule.
  - Decided: `null` removes an optional field (description,
    maxBookingsPerDay); a required field given `null` is a 422 "Not a valid
    value."
  - Decided: name is trimmed and must not be empty ("Can't be empty.").
    color must be a `TAG_COLORS` value ("Not a calendar colour.").
    teamMemberIds is an array of non-empty strings, checked for shape only,
    not against users (a contact's ownerId isn't checked either).
  - Decided: a patch that is not an object is a 422 "Calendar settings: Not
    a valid value." with `field` unset.
  - Decided: the new labels are Name, Description, Colour, Team members and
    Active.
- **Acceptance:**
  - [ ] A1. A null or wrong-typed value never overwrites a calendar field.
        On Discovery Call each of these is a 422 `INVALID_CALENDAR` with this
        field and message, and `get(id)` is unchanged afterwards:
        `{name:null}` name "Name: Not a valid value."; `{name:'   '}` name
        "Name: Can't be empty."; `{color:'purple'}` and `{color:null}` color
        "Colour: Not a calendar colour."; `{teamMemberIds:null}`
        teamMemberIds and `{teamMemberIds:['']}` teamMemberIds.0, both "Team
        members: Not a valid value."; `{isActive:null}` and
        `{isActive:'yes'}` isActive "Active: Not a valid value.";
        `{description:5}` description "Description: Not a valid value."
  - [ ] A2. A patch that is not an object (JSON `null`) is a 422
        `INVALID_CALENDAR` "Calendar settings: Not a valid value." with
        `field` unset, not a TypeError, and nothing is written. This pins
        `settingLabel`'s fallback label.
  - [ ] A3. Valid values still save, and `null` removes the description.
        `{name:'  Intro Call  ', description, color:'sky', teamMemberIds:[a
        seeded user], isActive:false}` resolves; the returned and stored
        calendars equal the previous one with name "Intro Call" (trimmed),
        those values and a new updatedAt, and the calendar then answers
        `availableSlots` with 409 `CALENDAR_INACTIVE`. `{description:
        undefined}` keeps the description; `{description:null}` removes the
        key from the returned and stored calendar (never stored as null); a
        later string sets it again.
  - [ ] A4. id, slug, type, createdAt, createdBy, updatedAt and unknown keys
        (top-level and inside availability rules and windows) are ignored. A
        patch carrying all of them plus `bufferAfterMin: 20` resolves; the
        returned and stored calendars equal the previous one except
        bufferAfterMin 20 and a fresh updatedAt (not the sent one). createdAt
        is unchanged, no foo, createdBy or nested extra key is stored,
        `get('cal_other')` is a 404, and `list()` still has the same four
        ids.
  - [ ] A5. Existing behaviour holds. Every existing calendars.test.ts case
        passes with its assertions unchanged: P7-T22's undefined-ignored and
        null-cap tests, all 21 original BAD_PATCHES rows, "saves touching
        windows" and "re-saves every seeded calendar's own settings" (a
        whole-record round trip still resolves to the same record). Only the
        row type (`CalendarPatch`, `at: string | undefined`) and the re-save
        comment change.
  - [ ] A6. The types say what the code does. `CalendarPatch` is
        `Partial<Pick<Calendar, the schema's keys>>` with maxBookingsPerDay
        and description also accepting null. `withoutUndefined` returns
        `{ [K in keyof T]?: Exclude<T[K], undefined> }`. `SETTING_LABELS`
        (`Record<SettingKey, string>`) has the five new labels.
        `availabilitySchema`, the editor's form schema, is unchanged.
  - [ ] A7. Every new test has been seen failing: on HEAD's src the nine A1
        rows resolve instead of rejecting, the A2 row throws a TypeError, the
        A4 test fails at createdAt, and the description test fails at
        `not.toHaveProperty`. Each mutant (raw patch saved, a loose schema,
        an unconditional `path.join`, name without trim/min, no description
        null branch, color off the schema) turns its own test red.
  - [ ] A8. Comments match the code: update()'s doc (allow-list, ignored
        keys with createdAt always kept, null removes the cap and the
        description, a non-object patch is a 422 with no field),
        `CalendarPatch`'s and `withoutUndefined`'s docs, `settingLabel`'s
        note on window order vs `toAvailabilityPatch`'s start-time sort,
        `calendarSettingsSchema`'s doc (no "pass through unchecked"), and the
        re-save test comment.
  - [ ] A9. No seed, mock or UI change and no regression. SEED_VERSION stays
        4; nothing under src/lib/mock or src/components changes. `npm run
        check` is green with the Vitest count up by exactly the 13 new cases
        (10 BAD_PATCHES rows, 3 its). The full `npm run e2e` passes with the
        specs unchanged. `npm ls @tanstack/react-table` prints 8.21.3, and
        `node scripts/progress.mjs --check` is clean.
- **Refs:** added by `progress.mjs add` on 2026-10-23

### P7-T35 — Validate expectedCloseAt in api.opportunities create/update
- **Owner:** agent · **Depends:** —
- **Scope:** src/lib/api/opportunities.ts accepts any string for expectedCloseAt; reject non-ISO values with a 422 so non-UI callers cannot store junk. Tests first.
  - From the P7-T23 review: e2e/deal-form.spec.ts sets `timezoneId: 'Asia/Singapore'` but no assertion depends on it. Add an edit-deal round trip (open a seeded deal, save, reopen, the Expected close day is unchanged) so the zone covers the local-midnight rule end to end, or drop the setting.
- **Acceptance:**
  - [ ] (define before starting)
- **Refs:** added by `progress.mjs add` on 2026-10-23

### P7-T36 — Booking dialog: error state and Retry when calendars.list fails
- **Owner:** agent · **Depends:** —
- **Scope:** booking-dialog.tsx:152 renders calendars.data ?? [], so a failed list leaves the Calendar select empty with no error or Retry; mirror P7-T24.
  - From the P7-T24 review: P7-T24's guard `calendars.error && calendars.data === undefined` (calendars-workspace.tsx) has no test that goes red when `&& calendars.data === undefined` is dropped, because nothing on /calendars refetches the list with it on screen. Prove the same guard here with a test that can go red (a failed refetch with the list loaded keeps the list), or say in this task's acceptance that it holds by construction, as use-resource keeps `data` on a failed refetch.
  - From the P7-T30 review, in calendars-load-errors.spec.ts: before installing the open-times aria-busy observer (~:540), assert `group` is not `aria-busy="true"`, so the "not busy now" comment is enforced (chooseContact and a radio click run between openTimes and the install), and give `__timesWentBusy` a clearer name. Add `exact: true` to the "Month view" region lookup (~:273), as `viewRegion` has. The calendars test's column scope (~:276) also narrows `watchRetry`'s skeleton watch; give `watchRetry` separate alert and skeleton scopes, or say why the column is enough.
  - In e2e/calendar-helpers.ts, fold failReads' new render()/summary()/integrityReport() examples into the paragraph above them, which already makes the "reads through `Object.values` throw too" point. In calendars-booking-dialog.spec.ts (~:96), move `contactInput` next to its use.
- **Acceptance:**
  - [ ] (define before starting)
- **Refs:** added by `progress.mjs add` on 2026-10-23

### P7-T37 — Contacts list: error state instead of false 'No contacts found' on list failure
- **Owner:** agent · **Depends:** —
- **Scope:** contacts-table.tsx renders data?.rows ?? [] on a failed contacts.list; add LoadError + Retry like P7-T24/T25, with e2e red/green.
- **Acceptance:**
  - [ ] (define before starting)
- **Refs:** added by `progress.mjs add` on 2026-10-23

### P7-T38 — useResource unit test: failed refetch keeps data for same query
- **Owner:** agent · **Depends:** —
- **Scope:** Hook test: refetch rejects -> data kept, error set, isRefreshing back to false. Protects every LoadError caller.
- **Acceptance:**
  - [ ] (define before starting)
- **Refs:** added by `progress.mjs add` on 2026-10-23

### P7-H4 — Decide: should an ended, already-Cancelled appointment stay frozen?
- **Owner:** human · **Depends:** —
- **Scope:** Today it can be marked Showed/No Show (target-only rule); 409 message reads oddly when slot rebooked. If frozen, change canMoveToStatus + its Vitest row.
- **Acceptance:**
  - [ ] (define before starting)
- **Refs:** added by `progress.mjs add` on 2026-10-23

### P7-T39 — Name the remaining TagPickers and the contacts search box
- **Owner:** agent · **Depends:** —
- **Scope:** Deal sheet TagPicker: id + FieldLabel htmlFor (opportunity-form-sheet.tsx ~499); contacts-toolbar and bulk Tags popover TagPickers need an aria-label prop; contacts search Input (contacts-toolbar.tsx:38) needs aria-label; extend select-a11y.spec.ts
  - From the P7-T28 review, in e2e/select-a11y.spec.ts: retitle the per-route tests (~:240) from "Chromium ignores every Select's hidden input" to say they also pin the names (e.g. "every Select is named and its hidden input ignored", as the Owner-popover test reads). In `expectNamedControls`' doc, say the count is checked once the named triggers are present, so a Select that mounts later is not caught. Cite the TAG_COMBOBOX source as AriaCombobox.mjs's `${id}-hidden-input` expression, not a line range, so a Base UI patch bump does not stale it.
- **Acceptance:**
  - [ ] (define before starting)
- **Refs:** added by `progress.mjs add` on 2026-10-23

### P7-T40 — ContactPicker: hold fetched contact for outside-set values
- **Owner:** agent · **Depends:** —
- **Scope:** Edit path still uses each refetch's object; after fetch() swap an invalidation rewrites typed text. Keep first fetched copy per id (contact-picker-value.ts) + unit test.
  - From the P7-T29 review: the held pick (and a held fetched copy) keeps a contact's old name if it is renamed elsewhere while the picker stays mounted. Every consumer unmounts it when its dialog or sheet closes today, so say that in `pickerValue`'s doc rather than adding a refresh.
  - In e2e/calendar-helpers.ts `pauseTimers` (moved there in P7-T30): `pauseAt(now + 1s)` throws "Cannot fast-forward to the past" if more than 1s of page time passes before it runs. Widen the margin to a few seconds, or state the limit in the helper's comment (every timer due inside the margin fires at once on pause).
  - From the P7-T30 review: contact-picker.spec.ts keeps its own `chooseByName(page, input, contact)`, the same fill and exact-name click as `chooseContact`. Let `chooseContact` take the input locator (or add an input-level variant) so both share one helper.
- **Acceptance:**
  - [ ] (define before starting)
- **Refs:** added by `progress.mjs add` on 2026-10-23

### P7-T41 — Document the Base UI trigger exception in LinkButton JSDoc
- **Owner:** agent · **Depends:** —
- **Scope:** LinkButton JSDoc (ui/button.tsx) names the trigger-as-non-button disable exception the lint message allows; tidy eslint-config.test.mjs duplicate trigger asserts + comment; reword link-buttons spec header padding attribution
- **Acceptance:**
  - [ ] (define before starting)
- **Refs:** added by `progress.mjs add` on 2026-10-23

### P7-T42 — Team settings link: stop 404 prefetch until P9
- **Owner:** agent · **Depends:** —
- **Scope:** prefetch={false} on nav-user Team settings Link (or placeholder page); then remove excuseTeamSettingsPrefetch from calendars-availability-editor.spec.ts
- **Acceptance:**
  - [ ] (define before starting)
- **Refs:** added by `progress.mjs add` on 2026-10-23

### P7-T43 — Unsaved-changes guard: stable guardLeave, menu focus return, mobile Sheet
- **Owner:** agent · **Depends:** —
- **Scope:** Keep subject in a ref so guardLeave/context keep identity; finalFocus to user-menu trigger for menu links (fix comment); close mobile Sheet on question; reword A9/'Released first' ordering claim
  - From the P7-T33 review (pre-existing, not caused by P7-T33): on a phone (390px) the sidebar Sheet stays open after any sidebar link navigates, even with no unsaved edits, so the new page sits behind the open panel. Close it (`setOpenMobile(false)` from `useSidebar`) when a sidebar or user-menu link navigates, and when the guard's Discard changes leaves; the question itself already opens over the Sheet and Escape closes only the question. Prove both with an e2e at a phone viewport (clean link click, and Discard from the guard).
  - In unsaved-changes.tsx's JSDoc, name the case where the registration is released while the question is open because a save finished (the question closes and the clicked link is dropped), or go on to `leave.href` then, since nothing is left to lose.
- **Acceptance:**
  - [ ] (define before starting)
- **Refs:** added by `progress.mjs add` on 2026-10-23

## Exit criteria (phase gate)
- [ ] A booking appears in month, week and day views, on the contact
      timeline, and in the dashboard Upcoming card, and its slot disappears
      from availability (e2e).
- [ ] Reloading any `/calendars?view=…&date=…` URL restores the same view.
- [ ] Zero console errors and hydration warnings across all routes (e2e smoke).
- [ ] `npm run check` and `npm run e2e` are green; `npm ls @tanstack/react-table`
      prints 8.21.3.
- [ ] Human check: the owner looks at the week view once from their timezone.
