# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T03 in review.

## Last change
- P7-T03 rework (P7-H2): `isBlocked()` in `src/lib/mock/slots.ts` now checks buffers both ways; neighbours need a gap >= max(before, after) whichever was booked first. hasRoomFor/openSlots/freeSlots/book/setStatus/seed place() all share it.
- Tests: booking-order table (both orders, both zones, availableSlots agrees with book()), boundary rows at gap = max and one minute short, restore-mirror 409 row, seed buffer oracle. Three expected lists updated with reasons. 172/172 green; 5 mutants all killed.
- Seed: only Discovery 2026-08-31 18:00Z moves to 19:30Z (47 moved in total vs the pre-P7 seed). SEED_VERSION stays 4, so a dev browser that loaded 1704c7b keeps the old placement until a manual reseed.
- Earlier P7-T03 work (engine, book/setStatus guards, seed placement, harness) unchanged; see git log.

## Next up
- **Agent:** P7-T04 (once P7-T03 is approved).

## Waiting on you
- Review of P7-T03 rework (`git show HEAD`).
- P7-H1: update CLAUDE.md Commands (check pipeline, plus `npm run e2e`).

## Open suggestions (non-blocking review notes)
- vitest.setup.ts comment mis-explains the mechanism: @date-fns/tz enumerates `Date.prototype` own names at evaluation; under fake timers that is ClockDate.prototype (no own getters). Fix is right, comment is not.
- Type `availableSlots(calendarId, day: CalendarDay): ISODate[]` with an exported alias so T08 sees the day is calendar-zone.
- isBlocked() equals padding each booking by max(before, after) on both sides; add a one-line comment stating the equivalence.
- book() JSDoc (calendars.ts:138-139) says buffer intrusion cannot happen through the API; narrow to "through book() or setStatus()" since calendars.update() can raise buffers (P7-T11).
- calendars.test.ts:169 comment "inside the 15-minute buffer after 19:00Z" reads oddly; reword to "inside the booking's 15-minute after-buffer (it ends at 19:00Z)".
- DECISIONS seed-placement line could note "buffers applied both ways".
- Seed realism: 11 upcoming appointments were created further ahead than dateRangeDays allows; could clamp createdAt.
- `setStatus()` logs a status_changed activity on no-op changes; add a guard before P7-T07.
- Spring-forward window edges untested (seeded Sundays closed); TZDate pushes skipped edges forward an hour; T09 editor note. P7-T09 zod: zero-padded HH:mm, valid IANA zone, no overlapping windows.
- Buffers do not reach across zone midnight from the previous day's bookings.
- Carried: P7-T02 notes (smoke heading assert, teardown settle, `.next-e2e` distDir, narrow rules-of-hooks override, `context.newPage()` fixtures, no check during e2e, pin timezoneId/locale in T05/T06 specs, orphan `next start` on 3100) and P7-T01 notes (settle() debounce, restrict testing imports, .test.tsx include, seed negative control, per-day oracle, `seededWorld(now)`, Vite 7 engines).

## Blockers
- None.
