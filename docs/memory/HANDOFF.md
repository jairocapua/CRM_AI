# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.
> Since 2026-10-25 the build may also run from Hermes Agent, which has no `Workflow` tool: the orchestrator follows `.claude/workflows/build-phase.js` step by step with helper agents (implementer, then verifier + reviewer in parallel, up to 2 fix rounds) and does the recorder steps itself.

## Now
- **Phase:** P9 Settings — active, 0/7 tasks done (P8 merged to GitHub `master` via PR #4 on 2026-10-26; local `master` fast-forwarded to it).
- **Branch:** `phase/p9-settings`, cut from `master` at `4d72e89`. Nothing pushed.
- **Status:** P9 started; P9-T01 Settings API fixes is next. Start it in a fresh session.

## Last change
- P8-T09 (owner decision): staff can withdraw their own automation request while it is still "Requested". A fifth status "Withdrawn" keeps it in the list; a confirm dialog asks first; other people's requests and answered ones show no Withdraw button; the developer cannot change a withdrawn request. One fix round: keyboard focus stays on the button when a withdraw fails, and the button cannot be pressed twice.
- Gate re-run: `npm run check` green (1051 Vitest), full `npm run e2e` 184/184, react-table 8.21.3, tracker OK. The first P8 gate (8cbd834) passed with no code must-fix; P8-T09 was reviewed on its own as the only change since.

## Next up
- After the merge: cut `phase/p9-settings` from `master` (name in `docs/phases/P9-settings.md`), set P9 active, and start P9-T01 in a fresh session: "Autopilot: continue the build per CLAUDE.md".

## Waiting on you (owner)
- Nothing blocking.
- **Optional click-through** (every item is already proven by tests): `npm run dev`, open http://localhost:3000, then Automation (8 cards, 5 folders) → Speed to Lead (diagram with "Replied" / "No reply" and End pills; narrow window shows only the step list) → Run history (click a Started time, see each step's status, click the contact) → "Request an automation" (send one, reload, see "Requested"; press Withdraw, confirm, see "Withdrawn") → `/settings/demo-data` (no integrity problems).
- Optional: the fixed triggers/waits for four automations (DECISIONS [P8-T01]) and the list's status wording ([P8-T03]).

## Open suggestions (non-blocking)
- `docs/BACKLOG.md` holds P8 leftovers and gate suggestions: an ESLint rule confining `@/lib/automations`, stronger "no seeded ids in definitions" tests, unique slugs/tag names in the API, `next typegen` before `tsc` on a fresh clone, React Flow's `role="application"`, DataTable `aria-sort`, a run status filter, a seeded request dated after its automation's first runs, one flaky-under-load fixture test.
- Calendar ids, pipeline/stage ids and `templateId` are still id-typed in authored configs; they need stable keys before any definition uses them.

## Blockers
- None.
