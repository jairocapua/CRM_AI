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
- **Acceptance:**
  - [ ] (define before starting)
- **Refs:** added by `progress.mjs add` on 2026-10-23

### P7-T23 — Deal form Expected close uses shared isCalendarDay
- **Owner:** agent · **Depends:** —
- **Scope:** validation/opportunity.ts dateInputToIso uses date-fns parse and accepts '0099-01-01'; switch to @/lib/dates isCalendarDay/parseCalendarDay with a red-first test.
- **Acceptance:**
  - [ ] (define before starting)
- **Refs:** added by `progress.mjs add` on 2026-10-23

### P7-T24 — Calendars sidebar: error state and Retry when calendars.list fails
- **Owner:** agent · **Depends:** —
- **Scope:** calendars-workspace renders calendars.data ?? [] so a failed list reads empty; reuse LoadError.
- **Acceptance:**
  - [ ] (define before starting)
- **Refs:** added by `progress.mjs add` on 2026-10-23

### P7-T25 — Contact detail: error state instead of endless skeleton on non-404 load failure
- **Owner:** agent · **Depends:** —
- **Scope:** contact-detail.tsx shows a skeleton forever on non-404 errors; reuse LoadError with Retry.
- **Acceptance:**
  - [ ] (define before starting)
- **Refs:** added by `progress.mjs add` on 2026-10-23

### P7-T26 — Past appointments: only Showed/No-show; Cancel and Confirmed for future only (P7-H3)
- **Owner:** agent · **Depends:** —
- **Scope:** Apply the P7-H3 owner rule (DECISIONS.md 2026-10-23) in two places. Past = the appointment's end is before the demo now (apiNow()/nowIso(), never new Date()). (1) appointment-details-dialog.tsx: for a past appointment the status select offers only Showed and No-show and the Cancel button is not shown; for a future one Cancel and Confirmed stay offered as today. (2) src/lib/api/calendars.ts setStatus()/cancel(): reject moving a past appointment to confirmed or cancelled with ApiError 422 (plain-language message, new code e.g. PAST_APPOINTMENT), checked in the same synchronous block as the write, nothing written. The rule names target statuses only; Showed/No-show on future appointments is unchanged. Flag to the owner if a case is unclear (e.g. a past appointment already Cancelled).
- **Acceptance:**
  - [ ] Vitest: setStatus() on a past appointment to confirmed and cancel() on a past appointment both reject with ApiError status 422 and write nothing (appointment and activities unchanged); past -> showed, past -> no_show and showed <-> no_show succeed; future cancel/confirm still succeed. e2e or component test: the details dialog for a past appointment offers only Showed and No-show and has no Cancel button; for a future appointment Cancel and Confirmed are offered.
- **Refs:** added by `progress.mjs add` on 2026-10-23

### P7-T27 — e2e: longer toHaveURL timeout for cross-route navigation
- **Owner:** agent · **Depends:** —
- **Scope:** Two specs flaked once at 5s toHaveURL after leaving /calendars under full-suite load; raise timeout for cross-route nav or cap Playwright workers on Windows.
  - From the P7-T21 review: the playwright.config.ts comment above `timeout: 60_000` says expect's timeout and the worker count are "left at their defaults on purpose"; update it to say what this task decided (and name P7-T27). In calendars-booking.spec.ts, the two `test.slow()` comments say "Playwright's old 30s default": 30s is still Playwright's default, so say "the 30s Playwright default this suite used before", and date the measured durations ("measured in P7-T21").
- **Acceptance:**
  - [ ] (define before starting)
- **Refs:** added by `progress.mjs add` on 2026-10-23

### P7-T28 — Name the unlabelled Select triggers
- **Owner:** agent · **Depends:** —
- **Scope:** Add aria-label to SelectTriggers in contacts-toolbar.tsx:52, board-toolbar.tsx:43, bulk-actions-bar.tsx:102; add non-empty-name check in e2e/select-a11y.spec.ts
  - From the P7-T16 review: CLAUDE.md's read_page note says Chromium ignores the hidden input behind every Select *and Combobox*, citing e2e/select-a11y.spec.ts, but the spec checks only Selects. Add one Combobox case (the TagPicker in the Add contact sheet) so the note is proven, or narrow the note to Select.
  - Also from P7-T16: the per-route tests wait only for the first trigger, so a Select that mounts after the skeletons clear would go unchecked; pin the expected trigger count (or names) per route, as the Add contact test already does.
- **Acceptance:**
  - [ ] (define before starting)
- **Refs:** added by `progress.mjs add` on 2026-10-23

### P7-T29 — Fix ContactPicker selection race after a pick
- **Owner:** agent · **Depends:** —
- **Scope:** Keep picked Contact in local state as value immediately; use selected.data only when id matches. Add e2e typing right after a pick without aria-selected wait.
  - From the P7-T17 review: new-conversation-dialog.tsx is a third ContactPicker consumer; add it as a third entry in SURFACES in e2e/contact-picker.spec.ts (and name it in that file's header) so its behaviour is pinned too. In pickContacts, make the uniqueness check cover phone and jobTitle as well (add them to SeededContact in calendar-helpers.ts), since the server searches those. In query-engine.test.ts, note on the mixed-fields case that its first assertion is the one proving function fields work.
- **Acceptance:**
  - [ ] (define before starting)
- **Refs:** added by `progress.mjs add` on 2026-10-23

### P7-T30 — Shared chooseContact e2e helper
- **Owner:** agent · **Depends:** —
- **Scope:** Move the three copies of booking-dialog contact pick (fill + option click) into e2e/calendar-helpers.ts chooseContact and use it in calendars-booking, calendars-booking-dialog, calendars-load-errors specs.
  - From the P7-T18 review, in the same spec files: in calendars-load-errors.spec.ts, the RetryWatch.sawSkeleton doc should say "inside `scope`" (watchRetry now takes a scope), and the aria-busy MutationObserver should read the mutation records (attributeOldValue: true) rather than the live attribute. In calendars-booking-dialog.spec.ts, the header claims sixteen times on both 9 and 10 September but only the 9th is checked: trim the claim or assert it.
  - From the P7-T21 review: failReads' Limits paragraph in calendar-helpers.ts names only calendars.ts. Add that any other API call reading the table through `Object.values` throws too while the fault is on, e.g. template rendering (templates.ts), analytics (analytics.ts) and the settings integrity check (settings.ts).
- **Acceptance:**
  - [ ] (define before starting)
- **Refs:** added by `progress.mjs add` on 2026-10-23

### P7-T31 — LinkButton helper and nativeButton lint rule
- **Owner:** agent · **Depends:** —
- **Scope:** Export a cn(buttonVariants()) link helper from ui/button.tsx; no-restricted-syntax for nativeButton={false} in modules; fix pagination.tsx PaginationLink
  - From the P7-T19 review: move the six P7-T19 links onto the helper, so no caller can drop `cn()` again.
  - Add a CLAUDE.md "Non-obvious constraints" line: a navigating control is the link helper (or `<Link className={cn(buttonVariants(...))}>`), never `Button render={<Link/>} nativeButton={false}` (role="button") and never a bare `buttonVariants()` string (the outline border is lost in light mode). The shadcn skill recommends `nativeButton={false}`, so agents will keep reaching for it.
- **Acceptance:**
  - [ ] (define before starting)
- **Refs:** added by `progress.mjs add` on 2026-10-23

### P7-T32 — Link-button icon padding and link-buttons spec scoping
- **Owner:** agent · **Depends:** P7-T31
- **Scope:** From the P7-T19 review (this id was first added by mistake as a duplicate of P7-T31, and was repurposed rather than deleted, since the tracker cannot delete rows).
  - Give the View contact (contact-panel.tsx) and Open board (pipeline-card.tsx) icons `data-icon="inline-start"` / `"inline-end"`, as the calendars links have, so the size's icon padding applies; update the A2 look values in e2e/link-buttons.spec.ts if they change.
  - In e2e/link-buttons.spec.ts (~:163), scope the thread-header contact link lookup to the thread header instead of `main ... .first()`, so it does not depend on DOM order.
- **Acceptance:**
  - [ ] (define before starting)
- **Refs:** added by `progress.mjs add` on 2026-10-23; repurposed in the P7-T19 review

### P7-T33 — App-wide unsaved-changes guard (sidebar links, reload, tab close)
- **Owner:** agent · **Depends:** —
- **Scope:** Extend the availability guard via Next Link onNavigate + context blocker (link.md 'Blocking navigation') and a beforeunload handler while dirty.
  - From the P7-T20 review: in calendars-availability-editor.spec.ts ("a clean editor switches and leaves without asking"), cover the two missing clean cases, a calendar switch right after Save and Back right after load, so each control is proven unguarded after load, Discard and Save.
  - In availability-workspace.tsx, call `setDirty(false)` before `router.push("/calendars")` on Discard, so a second Back click during a slow push does not ask again.
  - availability-form.tsx reports `isDirty` through an effect that re-fires when `onDirtyChange` changes identity: say in the prop doc that it must be stable (as `setDirty` is), or report through RHF's `form.subscribe({ formState: { isDirty: true } })`, which the app-wide blocker will need anyway.
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
