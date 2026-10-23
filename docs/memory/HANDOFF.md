# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T19 in review (deep review).

## Last change
- Six module links (View contact, 2x Back to inbox, Open board, Availability, Back to calendars) are now `<Link className={cn(buttonVariants(...))}>`: no role=button.
- cn() restores the light-mode outline border, 8px radius and 14px icons that a raw buttonVariants() string lost.
- New e2e/link-buttons.spec.ts (5 tests, light mode pinned); check green, e2e 82/82.
- Added P7-T31 (LinkButton helper + nativeButton lint rule + pagination fix). P7-T32 is an accidental duplicate, marked blocked: delete it from the phase file.

## Next up
- **Agent:** P7-T20 Availability editor: unsaved-changes guard and empty open day.

## Waiting on you
- Review of P7-T19.
- Your call: add a CLAUDE.md "Non-obvious constraints" note on the link-as-button spelling (the shadcn skill recommends nativeButton={false}).

## Open suggestions (non-blocking review notes)
- View contact / Open board icons lack data-icon, so inline padding never applies (predates task).
- link-buttons.spec.ts:163 header-link lookup relies on DOM order; scope it to the thread header.
- Earlier: P7-T18 notes (fresh form from Appointments tab, SlotsSkeleton columns, `== null` guard).

## Blockers
- None (P7-T32 is a duplicate, not a real blocker).
