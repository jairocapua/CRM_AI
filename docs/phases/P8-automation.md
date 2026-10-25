# P8 — Automation

**Phase:** P8 · **Points:** 9 (was 8a 5 + 8b 4) · **Branch:** `phase/p8-automation`

**Goal:** automations are custom-coded by a developer in `src/lib/automations/`
and staff can only view them: a list grouped by folder, a detail page with a
step list and a read-only diagram, run history, and a form for requesting new
automations. The file is the permission boundary.

**Prerequisites:** P7 done and merged into `master`.

**Spec refs:** `docs/design/automation.md` (the full design: types, registry,
layout, API, UI, CSS, store/seed, routes, 8b entities). `docs/spec.md` row 8.
CLAUDE.md "The one rule: the API seam" (automations bullet).

**Decided:** the 8a/8b split was about size; small tasks handle that, so this
is one phase. If scope hurts, cut run history (T06–T07), not the request flow
(T08). `SEED_VERSION` goes to 5 here (P7 took 4; the phase ended at 7: T06 → 6, T08 → 7).

## Tasks

### P8-T01 — Authored types and the automation registry
- **Owner:** agent · **Depends:** P7
- **Review:** deep
- **Skills:** `tdd`, `vitest`
- **Scope** (design §1, §2, §4, §7):
  - Types in `src/types/workflow.ts`: `AutomationDefinition`, and a `StepList`
    where a branch is terminal (rejoin is unrepresentable).
  - `src/lib/automations/`: one module per automation, transcribed from the 8
    fixtures in `src/lib/mock/seed/workflows.ts`, plus `index.ts`
    (`AUTOMATIONS`, keyed by slug, ids `wf_*`). No faker. Transcribing also
    fixes the seed's "Wait N days" label, which draws a different random
    number than the wait itself (`seed/workflows.ts:369-370`).
  - Tags and users are referenced by **stable key** (tag name, user slug);
    `src/lib/api/workflows.ts` resolves them to ids at read time. Do this first
    (it touches `add_tag`, `remove_tag`, `tag_added`, `assign_user`,
    `internal_notification`).
  - `api.workflows.list()`/`get(id)` re-point at the registry. Delete
    `create`/`update`/`duplicate`/`setStatus`/`remove`, the `workflows` store
    table and `seedWorkflows`. Removing the seeder shifts later faker draws;
    accept that. Bump `SEED_VERSION` to 5.
  - Replace the edge→node integrity check with ones that can fail: duplicate
    node ids, every branch has ≥ 1 step. Demo Data counts show
    `automations: <registry length>`.
- **Acceptance:**
  - [ ] Test: every tag/user reference in every definition resolves after two
        reseeds (ids differ between them; references still hold).
  - [ ] `api.workflows` exports only reads; `npm run check` green (the deleted
        table's two typecheck failures in `settings.ts` are resolved).
  - [ ] The integrity report is clean after a reseed.
- **Refs:** design §1, §2, §4, §7

### P8-T02 — Deterministic layout
- **Owner:** agent · **Depends:** P8-T01
- **Review:** deep
- **Skills:** `tdd`, `react-flow`
- **Scope** (design §3): `src/lib/automations/layout.ts` walks the authored
  tree and emits positioned nodes and edges. Width-accumulating subtree spans
  (not ±1 columns), x-pitch `NODE_WIDTH + GUTTER` (~64), `end` nodes emitted at
  every terminal as short pills. Run layout at module scope in `index.ts` so a
  malformed definition fails `next build`. Add an overlap (AABB) check to the
  integrity report.
- **Acceptance:**
  - [ ] Unit tests: linear chain, one fork, a fork inside a branch, end pills at
        every tail, no overlapping boxes for all 8 definitions.
  - [ ] A deliberately malformed definition in a test throws.
- **Refs:** design §3

### P8-T03 — Automation list page
- **Owner:** agent · **Depends:** P8-T01
- **Review:** light
- **Skills:** `shadcn`, `vercel-react-best-practices`
- **Scope** (design §5, §9): `/automation` lists the automations grouped by
  folder, each with a trigger summary, owner and status written as lifecycle
  copy (not editor controls), plus a "Request an automation" button (links to
  `/automation/requests`; that route lands in T08). Read-only card pattern
  from `contact-opportunities-panel.tsx`.
- **Acceptance:**
  - [ ] e2e: 8 automations in 5 folders, each with trigger and owner.
- **Refs:** design §5, §9

### P8-T04 — Detail page with the step list
- **Owner:** agent · **Depends:** P8-T02, P8-T03
- **Review:** light
- **Skills:** `vercel-react-best-practices`
- **Scope** (design §5, §8): `/automation/[id]` exactly like
  `contacts/[id]/page.tsx` (thin server page awaiting `params`, client
  component), plus `generateStaticParams()` from the registry. A nested `<ol>`
  step list (`automation-step-list.tsx`) with an optional `statuses` prop for
  run logs later. Show the "how this behaves" settings
  (`allowMultipleEnrollment`, `stopOnReply`). Below 768px only the list
  renders.
- **Acceptance:**
  - [ ] e2e: hard-refresh on `/automation/wf_speed_to_lead` works and shows
        both branches with their labels.
  - [ ] e2e at 375px: the step list renders.
- **Refs:** design §5, §8

### P8-T05 — Read-only diagram
- **Owner:** agent · **Depends:** P8-T04
- **Review:** deep
- **Skills:** `react-flow`, `vercel-react-best-practices`
- **Scope** (design §5, §6): `automation-graph.tsx` + a custom node. Import
  `@xyflow/react/dist/style.css` into a layer from `globals.css`; prune the
  `--xy-*` bridge as listed. Read-only props from the design
  (`zoomOnScroll={false}` with `preventScrolling={false}`), memoised
  `nodeTypes`, `fitView`, no MiniMap, attribution kept, edges not animated.
  Not mounted below 768px. Follows dark mode.
- **Acceptance:**
  - [ ] e2e: with the cursor over the diagram, the mouse wheel scrolls the
        page and does not zoom the canvas.
  - [ ] e2e: the Speed to Lead diagram has 9 nodes and no overlapping boxes.
  - [ ] e2e at 375px: React Flow is not mounted.
  - [ ] Dark mode: nodes, edges and controls follow the theme.
- **Refs:** design §5, §6

### P8-T06 — Run history data
- **Owner:** agent · **Depends:** P8-T01
- **Review:** deep
- **Skills:** `tdd`, `vitest`
- **Scope** (design "Phase 8b"): `WorkflowRun` / `WorkflowRunStep` types; a
  seeder **appended at the end of `buildDb()`** that imports the real registry
  so run steps reference node ids that exist; `cascadeContactDelete` sweeps
  `workflowRuns`; new `ResourceKey` added in **both** places in `cache.ts`
  (the union and `invalidateAll()`); integrity checks for runs pointing at a
  missing node or contact; `listRuns(workflowId, query)` via `applyQuery`.
  Remove `WorkflowNode.stats` or derive it from runs.
- **Acceptance:**
  - [ ] Test: deleting a contact leaves no orphan runs and the integrity report
        stays clean.
  - [ ] Test: every seeded run step's node id exists in its automation's
        layout.
  - [ ] No fake counters remain next to real run history.
- **Refs:** design "Phase 8b — Plumbing", `src/lib/mock/cascade.ts`, `src/lib/api/cache.ts`

### P8-T07 — Run history UI
- **Owner:** agent · **Depends:** P8-T04, P8-T06
- **Review:** light
- **Skills:** `shadcn`
- **Scope:** a run history table (`DataTable` on the pinned TanStack 8.21.3)
  on the detail page; a run sheet reusing `automation-step-list` with
  per-step statuses; contacts link through.
- **Acceptance:**
  - [ ] e2e: open a run and see its steps with statuses; the contact link opens
        the contact.
- **Refs:** `src/components/common/data-table*`

### P8-T08 — Automation requests
- **Owner:** agent · **Depends:** P8-T03
- **Review:** deep
- **Skills:** `vercel-react-best-practices`, `shadcn`
- **Scope** (design "Phase 8b"): `AutomationRequest` type (uses `Audited`;
  four statuses), store table, a seeder appended at the end, new
  `src/lib/api/automation-requests.ts` shaped like `smart-lists.ts`
  (list/get/create/setStatus/remove; mutations may fail and invalidate).
  `/automation/requests`: list plus a request form (RHF + zod via `Field*`).
  Integrity check for a dangling `shippedWorkflowId`.
- **Acceptance:**
  - [ ] e2e: submit a request, reload, and it is listed with status
        "requested".
  - [ ] Test: a request whose `shippedWorkflowId` points nowhere is reported.
- **Refs:** design "Phase 8b — API and UI", `src/lib/api/smart-lists.ts`

### P8-T09 — Withdraw an automation request
- **Owner:** agent · **Depends:** P8-T08
- **Scope:** Owner decision 2026-10-25: staff may withdraw their own request. New fifth AutomationRequestStatus "withdrawn" (kept in the list, history stays). api.automationRequests.withdraw(id): only while status is "requested" and only by the person who asked (createdBy = current user), else 422/403-style ApiError; may fail, invalidates. /automation/requests shows a Withdraw control (with confirm) only on the current user's own requested requests; the badge reads "Withdrawn".
- **Acceptance:**
  - [ ] e2e: submit a request, withdraw it, reload, it is listed as "Withdrawn" with no Withdraw control. Test: withdraw refuses another user's request and a request that is not "requested".
- **Refs:** added by `progress.mjs add` on 2026-10-26

## Exit criteria (phase gate)
- [ ] `/automation` shows 8 automations in 5 folders (e2e).
- [ ] Speed to Lead renders with both branches, end pills and no overlapping
      boxes; the page scrolls over the diagram (e2e).
- [ ] At 375px the step list renders and React Flow is not mounted (e2e).
- [ ] The integrity report is clean after a reseed and after deleting a
      contact that has runs.
- [ ] `npm run check` and `npm run e2e` are green.
