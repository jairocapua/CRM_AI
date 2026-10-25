# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.
> Since 2026-10-25 the build may also run from Hermes Agent, which has no `Workflow` tool: the orchestrator follows `.claude/workflows/build-phase.js` step by step with helper agents (implementer, then verifier + reviewer in parallel, up to 2 fix rounds) and does the recorder steps itself.

## Now
- **Phase:** P8 Automation — active, 7/8 tasks done (P7 merged to GitHub `master` via PR #2 on 2026-10-25; local `master` fast-forwarded to it).
- **Branch:** `phase/p8-automation`, cut from `master` at `584f50e`. Nothing pushed.
- **Status:** P8-T07 in review (Autopilot approves next).

## Last change
- P8-T07: `/automation/[id]` has a "Run history" table (10 a page, newest first; Started / Contact / Status / Duration) and a run sheet that reuses the step list with per-step statuses and notes ("SMS not delivered · Jul 19, 11:17 PM"). Contacts link to `/contacts/<id>`; a missing contact reads "Unknown contact". `listRuns` now returns `Page<WorkflowRunRow>` with a read-time `contactName`. Runs follow one fault, one alert. Drafts show "No runs yet". Seed copy: a run stopped at a fork says "the contact unsubscribed".
- Review: light; one fix round (the sort-arrow flip got a unit test and an e2e), plus a contact-named button label, a footer hidden on first load and a contacts-fault e2e.
- Verify: `npm run check` green (987 Vitest), 46 e2e passed (automation-runs, -detail, -diagram, -list, smoke, fixture), new spec stable over 3 repeats, react-table 8.21.3. Screenshots checked: desktop, phone, dark, sheet on desktop and phone.

## Next up
- P8-T08 Automation requests (deep review): `AutomationRequest` type, table, seeder appended last, `src/lib/api/automation-requests.ts` like `smart-lists.ts`, `/automation/requests` list + RHF/zod form (replaces the placeholder page in place), dangling `shippedWorkflowId` integrity check. Then the P8 phase gate.

## Waiting on you (owner)
- Nothing blocking. Optional: the fixed triggers/waits for four automations (DECISIONS [P8-T01], "Fixed choices") and the list's status wording ([P8-T03]); change either if you prefer.

## Open suggestions (non-blocking)
- `docs/BACKLOG.md` holds P8-T01..T07 leftovers: unique slugs/tag names in the API, channel typing, detail page title, `next typegen` before `tsc` on a fresh clone, React Flow's hard-coded `role="application"`, UTC clock-time waits in seeded runs, DataTable `aria-sort`, a run status filter, one flaky-under-load fixture test.
- Calendar ids, pipeline/stage ids and `templateId` are still id-typed in authored configs; they need stable keys before any definition uses them.

## Blockers
- None.
