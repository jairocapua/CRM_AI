# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.
> Since 2026-10-25 the build may also run from Hermes Agent, which has no `Workflow` tool: the orchestrator follows `.claude/workflows/build-phase.js` step by step with helper agents (implementer, then verifier + reviewer in parallel, up to 2 fix rounds) and does the recorder steps itself.

## Now
- **Phase:** P8 Automation — active again: the owner added P8-T09 (withdraw a request) after the gate passed; the gate re-runs after it. **Do not merge yet.**
- **Branch:** `phase/p8-automation`, cut from `master` at `584f50e`. Nothing pushed.
- **Status:** P8 phase gate passed on 2026-10-25; next phase P9 Settings starts after the merge.

## Last change
- P8 phase gate: `npm run check` green (1030 Vitest), full `npm run e2e` 181/181 passed (no flaky retries), react-table 8.21.3, tracker OK. Gate review passed with no code must-fix; three stale doc lines fixed (design status note, phase file `SEED_VERSION` note); CLAUDE.md "Phase 8a" wording fixed with owner approval.
- Exit criteria, each backed by tests: 8 automations in 5 folders (`automation-list.spec.ts`); Speed to Lead's branches, end pills, no overlaps, page scroll over the diagram (`automation-diagram.spec.ts`, `layout.test.ts`); 375px step list without React Flow (`automation-detail.spec.ts`, `automation-diagram.spec.ts`); integrity clean after reseeds and after deleting a contact with runs (`settings.test.ts`, `contacts.test.ts`).
- This session under Autopilot: P8-T06 run history data, P8-T07 run history UI, P8-T08 automation requests, then the gate.

## Next up
- After the merge: cut `phase/p9-settings` from `master` (name in `docs/phases/P9-settings.md`), set P9 active, and start its first task in a fresh session: "Autopilot: continue the build per CLAUDE.md".

## Waiting on you (owner)
- **Merge P8:** wait: P8-T09 and a gate re-run come first; the branch will be pushed again after.
- **Human checks** (run `npm run dev`, open the app):
  1. Automation: 8 cards in 5 folder sections, each with a trigger, owner and plain-words status, no switches; a card's name opens its page.
  2. Speed to Lead on a wide window: the diagram forks into "Replied" / "No reply", each path ending in a small "End" pill; the mouse wheel scrolls the page, not the diagram; dark mode recolours nodes, lines and zoom buttons.
  3. Narrow the window below ~768px: only the numbered step list shows.
  4. Run history: click a time in the Started column; a side panel shows each step as OK / Failed / Skipped; the contact's name opens their contact page.
  5. Requests: "Request an automation", fill in and send; reload; it is listed as "Requested".
  6. `/settings/demo-data` (type the URL): automations 8 plus run and request counts, no integrity problems; delete a contact who appears in run history, check again: still none.
- Optional: the fixed triggers/waits for four automations (DECISIONS [P8-T01]), the list's status wording ([P8-T03]), and whether staff may withdraw their own requests ([P8-T08]).

## Open suggestions (non-blocking)
- `docs/BACKLOG.md` holds P8 leftovers and gate suggestions: an ESLint rule confining `@/lib/automations`, stronger "no seeded ids in definitions" tests, unique slugs/tag names in the API, `next typegen` before `tsc` on a fresh clone, React Flow's `role="application"`, DataTable `aria-sort`, a run status filter, a seeded request dated after its automation's first runs, one flaky-under-load fixture test.
- Calendar ids, pipeline/stage ids and `templateId` are still id-typed in authored configs; they need stable keys before any definition uses them.

## Blockers
- None.
