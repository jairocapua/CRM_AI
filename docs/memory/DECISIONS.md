# Decision log

> Small judgment calls go here as one-liners. Format: `- YYYY-MM-DD [TASK-ID] decision — why`.
> If the spec is silent, pick the simplest option that respects CLAUDE.md and log it here. Product-level questions go to the owner instead.

## Before the tracker (Phases 0–6)
- 2026-09-08 [plan] Front-end only behind an `api.*` seam; a real backend replaces `src/lib/api/http.ts`'s body with `fetch()` and no component changes.
- 2026-09-08 [plan] `@tanstack/react-table` pinned to 8.21.3 with an `overrides` entry — 9.x is a hard API break.
- 2026-09-24 [plan] Automations are developer-authored code in `src/lib/automations/`, read-only for staff; no drag-and-drop builder (`docs/design/automation.md`).
- 2026-09-26 [P3] CSV import/export and Smart Lists deferred; the API already supports both.
- 2026-09-26 [P4] Pipeline/stage management and an opportunities list view deferred; "Show lost" replaces "show closed" so won deals always show.
- 2026-09-26 [P6] Lead sources are one-hue bars, not a donut (9 sources, 8 palette slots, no cycling).
- 2026-09-26 [P6] Won revenue is cumulative, so the line ends on the headline figure.
- 2026-09-26 [P6] Pipeline value, forecast and stage counts cover one pipeline, never all three summed (Client Onboarding is post-sale work).
- 2026-09-26 [P6] Reads keep `canFail: false`; the dashboard period is component state, not `?period=`.

## Build system (2026-10-21, owner decisions)
- 2026-10-21 [bootstrap] Build through AIPM's `build-phase` workflow: small tasks, one commit per task on a phase branch, the owner merges at each gate, never push.
- 2026-10-21 [bootstrap] Proof is Vitest (logic) plus Playwright (e2e, headless).
- 2026-10-21 [bootstrap] Autopilot: Claude approves or reworks each task; stops for the owner on product questions, phase gates and pushes.
- 2026-10-21 [bootstrap] Calendar times follow each calendar's own timezone (`@date-fns/tz`), displayed in the viewer's local time.
- 2026-10-21 [bootstrap] Phases 8a and 8b merged into P8; `SEED_VERSION` 4 goes to P7, 5 to P8.
- 2026-10-21 [bootstrap] CSV import/export, Smart Lists UI and the opportunities list view stay in `docs/BACKLOG.md` until P7–P10 are done.

## During the build
