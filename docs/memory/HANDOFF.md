# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T03 in review.

## Last change
- P7-T03: new pure slot engine `src/lib/mock/slots.ts` (@date-fns/tz): days are calendar-zone `YYYY-MM-DD`, windows are wall-clock, slots step by elapsed minutes (25-hour 2026-11-01 handled); dateRangeDays now honoured.
- `book()` rejects non-offered starts (409 SLOT_UNAVAILABLE) and non-instants (422 INVALID_START); `setStatus()` restoring a cancelled booking checks `hasRoomFor` (409 on conflict). AppointmentDraft narrowed; record built field by field.
- Seed: same faker stream, appointments placed on open LA grid slots (46 moved, 1 to next day); SEED_VERSION 4. KPIs unchanged.
- Harness: `vitest.setup.ts` preloads @date-fns/tz (fake-timer Date bug); `setDemoNow`, `stubLocalStorage`; 60 new tests, 145 total green. Added P7-T11 (booking guards) and P7-H2 (buffer semantics decision).

## Next up
- **Agent:** P7-T04 (once P7-T03 is approved).

## Waiting on you
- Review of P7-T03 (`git show HEAD`).
- P7-H1: update CLAUDE.md Commands (check pipeline, plus `npm run e2e`).
- P7-H2: decide symmetric buffer semantics before P7-T08.

## Open suggestions (non-blocking review notes)
- vitest.setup.ts comment mis-explains the mechanism: @date-fns/tz enumerates `Date.prototype` own names at evaluation; under fake timers that is ClockDate.prototype (no own getters). Fix is right, comment is not.
- Type `availableSlots(calendarId, day: CalendarDay): ISODate[]` with an exported alias so T08 sees the day is calendar-zone.
- Seed test 'never overlap' checks raw overlap only; also assert buffer clearance.
- Seed realism: 11 upcoming appointments were created further ahead than dateRangeDays allows; could clamp createdAt.
- `setStatus()` logs a status_changed activity on no-op changes; add a guard before P7-T07.
- Spring-forward window edges untested (seeded Sundays closed); TZDate pushes skipped edges forward an hour; T09 editor note. P7-T09 zod: zero-padded HH:mm, valid IANA zone, no overlapping windows.
- Buffers do not reach across zone midnight from the previous day's bookings.
- Carried: P7-T02 notes (smoke heading assert, teardown settle, `.next-e2e` distDir, narrow rules-of-hooks override, `context.newPage()` fixtures, no check during e2e, pin timezoneId/locale in T05/T06 specs, orphan `next start` on 3100) and P7-T01 notes (settle() debounce, restrict testing imports, .test.tsx include, seed negative control, per-day oracle, `seededWorld(now)`, Vite 7 engines).

## Blockers
- None.
