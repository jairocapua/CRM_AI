# Build progress

> **Source of truth for build status.** Agents change it only through `node scripts/progress.mjs` (`set` / `phase` / `add` / `sync`).
> Humans may edit it by hand: keep the table format, then run `node scripts/progress.mjs --check`.
>
> **Task status:** `todo` → `in-progress` → `review` (agent finished; awaiting your approval) → `done` · `blocked` (needs you; see Notes)
> **Phase status:** `todo` → `active` → `gate` (all tasks done; exit criteria being verified) → `done` (gate passed; merge the phase branch into `master`)
> **Depends:** task IDs, or a phase ID (meaning that phase's gate has passed). Task definitions live in `docs/phases/`.
> Phases 0–6 were built before this tracker existed; their notes are in `docs/history/phases-0-6.md`.

<!-- summary:start -->
**Overall:** 9/42 tasks done (21%) · **Current phase:** P7 · **Next agent task:** P7-T09 · **Awaiting review:** P7-T08 · **Blocked:** none · **Waiting on you:** P7-H3
<!-- summary:end -->

## P7 — Calendars
Status: active · Progress: 9/21 · Points: 7 (5 for Calendars + 2 for the test harness) · Branch: phase/p7-calendars · File: docs/phases/P7-calendars.md

| ID | Task | Owner | Status | Depends | Commit | Updated | Notes |
|---|---|---|---|---|---|---|---|
| P7-T01 | Vitest harness and first API tests | agent | done | — | 8a2e34d | 2026-10-21 | Vitest 4.1 harness + 77 API/mock tests; reconcile test fails 12-13 on Phase 6 revert; check green |
| P7-T02 | Playwright e2e harness | agent | done | — | d359deb | 2026-10-21 | Playwright e2e harness: next build+start on 3100, boot/console fixture, 15 tests green |
| P7-T03 | Calendar time model and slot engine (step 0) | agent | done | P7-T01 | 4fa791c | 2026-10-21 | Rework P7-H2: buffers symmetric (gap >= max(before,after)), order-independent; 1 seed appt moved; 172 tests green |
| P7-T04 | Calendars page: URL state, toolbar and calendar list | agent | done | P7-T02 | 3f81f6e | 2026-10-21 | /calendars URL state (view/date), toolbar, calendar list toggles, placeholder views; check+e2e green |
| P7-T05 | Month view | agent | done | P7-T03, P7-T04 | 5ed7061 | 2026-10-21 | Month grid with +N more, keeps old grid while loading, historyMethod none/replace/push; e2e 32/32 |
| P7-T06 | Week and day views | agent | done | P7-T03, P7-T04 | c949dab | 2026-10-21 | Approved in review: week/day time grid, packIntervals, now line, scroll-to-first, history replace; e2e 40/40 |
| P7-T07 | Appointment details, status and cancel | agent | done | P7-T05 | 8c3df91 | 2026-10-22 | Details dialog (contact link, two zones, location, status Select), cancel with Undo, live-first ordering; e2e green |
| P7-T08 | Booking dialog and the contact Appointments tab | agent | review | P7-T03, P7-T07 |  | 2026-10-22 | Booking dialog (calendar>contact>day>slot, API error refetch) + contact Appointments tab; check and e2e green |
| P7-T09 | Availability editor | agent | todo | P7-T03, P7-T04 |  |  |  |
| P7-H1 | Update CLAUDE.md Commands for the new check pipeline | human | done | — |  | 2026-10-21 | Done by Claude in review: CLAUDE.md Commands now lists test and test:scripts |
| P7-T10 | Harness polish: browser install and smoke content checks | agent | todo | — |  |  |  |
| P7-T11 | Guard bookings: inactive calendars, unknown contacts, bad windows | agent | todo | — |  |  |  |
| P7-H2 | Decide symmetric buffer semantics | human | done | — |  | 2026-10-21 | Decided in review: symmetric buffers (order-independent); fixed in P7-T03 rework |
| P7-T12 | Merge duplicate day validators into a shared non-mock module | agent | todo | — |  |  |  |
| P7-T13 | Calendars: error state and retry when appointments fail to load | agent | todo | — |  |  |  |
| P7-T14 | Larger tap target for month chips on mobile | agent | todo | — |  |  |  |
| P7-T15 | Show end date when an appointment crosses midnight | agent | todo | — |  |  |  |
| P7-H3 | Decide: can past appointments be cancelled or re-statused? | human | todo | — |  |  |  |
| P7-T16 | Check Base UI Select hidden input in the a11y tree | agent | todo | — |  |  |  |
| P7-T17 | ContactPicker search: full-name match and no client re-filter | agent | todo | — |  |  |  |
| P7-T18 | Booking dialog: slot-load error with Retry, ids from formId, fresh form per open | agent | todo | — |  |  |  |

## P8 — Automation
Status: todo · Progress: 0/8 · Points: 9 (was 8a 5 + 8b 4) · Branch: phase/p8-automation · File: docs/phases/P8-automation.md

| ID | Task | Owner | Status | Depends | Commit | Updated | Notes |
|---|---|---|---|---|---|---|---|
| P8-T01 | Authored types and the automation registry | agent | todo | P7 |  |  |  |
| P8-T02 | Deterministic layout | agent | todo | P8-T01 |  |  |  |
| P8-T03 | Automation list page | agent | todo | P8-T01 |  |  |  |
| P8-T04 | Detail page with the step list | agent | todo | P8-T02, P8-T03 |  |  |  |
| P8-T05 | Read-only diagram | agent | todo | P8-T04 |  |  |  |
| P8-T06 | Run history data | agent | todo | P8-T01 |  |  |  |
| P8-T07 | Run history UI | agent | todo | P8-T04, P8-T06 |  |  |  |
| P8-T08 | Automation requests | agent | todo | P8-T03 |  |  |  |

## P9 — Settings
Status: todo · Progress: 0/6 · Points: 4 · Branch: phase/p9-settings · File: docs/phases/P9-settings.md

| ID | Task | Owner | Status | Depends | Commit | Updated | Notes |
|---|---|---|---|---|---|---|---|
| P9-T01 | Settings API fixes (step 0) | agent | todo | P8 |  |  |  |
| P9-T02 | Settings shell, profile and business | agent | todo | P8 |  |  |  |
| P9-T03 | Team and invites | agent | todo | P9-T01, P9-T02 |  |  |  |
| P9-T04 | Custom fields manager | agent | todo | P9-T01, P9-T02 |  |  |  |
| P9-T05 | Pipelines and stages manager | agent | todo | P9-T01, P9-T02 |  |  |  |
| P9-T06 | Tags manager with merge | agent | todo | P9-T02 |  |  |  |

## P10 — Polish
Status: todo · Progress: 0/7 · Points: 5 · Branch: phase/p10-polish · File: docs/phases/P10-polish.md

| ID | Task | Owner | Status | Depends | Commit | Updated | Notes |
|---|---|---|---|---|---|---|---|
| P10-T01 | Command palette (⌘K) | agent | todo | P9 |  |  |  |
| P10-T02 | Loading and error audit | agent | todo | P9 |  |  |  |
| P10-T03 | Responsive pass at 375px | agent | todo | P9 |  |  |  |
| P10-T04 | Keyboard and accessibility | agent | todo | P9 |  |  |  |
| P10-T05 | Cleanup from the Phase 5 review | agent | todo | P9 |  |  |  |
| P10-T06 | Load the seed lazily | agent | todo | P9 |  |  |  |
| P10-T07 | README and demo walkthrough | agent | todo | P10-T01, P10-T02, P10-T03, P10-T04 |  |  |  |
