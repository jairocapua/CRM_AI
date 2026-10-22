# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T14 in review.

## Last change
- P7-T14: below sm, month chips and '+N more' are at least 24x24 (CSS only); sm and up unchanged.
- Details dialog finalFocus: opener, else restored chip by id, else that day's '+N more', else Base UI default.
- `localStartDay` extracted in month-grid.ts (unit-tested). check + e2e (56) green; no src/lib change, SEED_VERSION 4.

## Next up
- **Agent:** P7-T15 Show end date when an appointment crosses midnight.

## Waiting on you
- Review of P7-T14; look at /calendars?view=month&date=2026-09-08 at ~375px, light and dark (week rows grow ~64px to 114px).

## Open suggestions (non-blocking review notes)
- month-view.tsx comments and e2e describe say "thin bar"; below sm the chip is a 24px tinted pill. Reword or hide tint below sm.
- Escape before the cancel refetch lands drops focus to <body> (BACKLOG / P10-T02).
- A3 wording: "existing assertions intact", not "unmodified".
- Consider 44px targets or touch-action: manipulation; gap-1 below sm so the focus ring isn't clipped.
- appointmentFocusFallback also serves day view; move or rename it.
- e2e flake: contact Appointments tab click lost before hydration (fold into P7-T21).
- Earlier: focus after Retry; dashboard appointments card error state; failReads helper limits; Playwright workers.

## Blockers
- None.
