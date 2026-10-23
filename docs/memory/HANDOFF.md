# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T48 in review (deep review).

## Last changes (this session)
- P7-T48: next + eslint-config-next 16.3.4 -> 16.4.3 (exact-pinned; minor bump needed, advisories cover <=16.4.0).
- `npm audit fix` (no --force) cleared transitive findings (proxy-addr 2.0.8, zod 4.6.7, shadcn 4.22.1, express 5.3.0, sharp 0.35.5). Audit: 11 -> 0.
- Pins held: react-table 8.21.3 (override), vite 7.3.7, faker 10.6.0. No src/ changes. Gate green; e2e 122 passed.
- docs/spec.md `next` row now 16.4.3; P7-T48 acceptance written in the phase file.

## Next up
- **Agent:** P7-T49 (once P7-T48 is approved).

## Waiting on you
- Review of P7-T48.
- P7-H4: should an ended appointment that is already Cancelled stay frozen? Not blocking.

## Open suggestions (non-blocking review notes)
- P7-T48: spec.md still says shadcn "CLI 4.21" (lockfile 4.22.1); table header date 2026-09-08 could note next re-verified 2026-10-24.
- P7-T47: tags alert can flash above the skeleton on first load; gate on `contactsPage.data !== undefined` (contacts-table.tsx:175).
- P7-T47: TagPicker error state in form sheets/bulk popover has no Retry.
- P7-T47: e2e "re-read keeps badges" is a guard, not proof; Tags cell '—' while loading/failing.
- P7-T46: custom-fields number check accepts "Infinity"/"1e400"; applyPatch doc; parse() first issue only; setStatus() unknown-id test.
- Pre-existing React Compiler lint warnings (3): data-table.tsx:55, contact-form-sheet.tsx:183, opportunity-form-sheet.tsx:145.

## Blockers
- None.
