# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T10 in review.

## Last change
- P7-T10: `npm run e2e:install` (playwright install chromium); verified on an empty browser cache, 49/49 e2e.
- Smoke spec asserts each route's own h1 inside `<main>`; a blank-render mutant failed all 8 tests.
- CLAUDE.md Commands lists e2e commands; e2e is outside `check` and must not run alongside it (shared `.next`).
- New task P7-T21: raise timeout on long calendars-booking e2e flows (one flaky timeout seen).

## Next up
- **Agent:** P7-T11 Guard bookings: inactive calendars, unknown contacts, bad windows (once P7-T10 is approved).

## Waiting on you
- Review of P7-T10 (run `npm run e2e:install` then `npm run e2e`).
- P7-H3: decide whether past appointments can be cancelled or re-statused.

## Open suggestions (non-blocking review notes)
- Smoke: per-route content landmark (table, board columns) beyond the PageHeader h1.
- smoke.spec.ts:35 hardcodes "Dashboard"; use `findNavItem("/dashboard")!.title`.
- Comment at inbox-list.tsx:118 h1 and PageHeader noting the smoke spec depends on the title.
- Linux CI `--with-deps` note: now in docs/BACKLOG.md (CI job row).
- Earlier: time-grid.test literal pins; FieldGroup / isSubmitting cosmetics; pre-existing lint warnings.

## Blockers
- None.
