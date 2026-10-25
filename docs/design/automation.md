# Phase 8 design — Automation becomes dev-owned, staff-viewable

> **Status (2026-10-21):** approved 2026-09-24, copied into the repo for Phase 8.
> Since then: 8a and 8b are one phase, **P8** (`docs/phases/P8-automation.md`),
> split into small tasks; the seed bumps are now `SEED_VERSION` 5 (Phase 7 takes 4);
> and Vitest exists from P7-T01, so "keeping layout honest with no test runner"
> below is extra protection, not the only one.
> P8-T01 (2026-10-25) built §1, §2, §4 and §7 with recorded deviations:
> `trigger.kind` dropped, users keyed by a new `User.slug`, seven keyed config
> kinds plus `owner`. See `docs/memory/DECISIONS.md` lines tagged [P8-T01].
> P8-T05 deviations: no edge-to-edge canvas (§8; the detail page keeps its
> padding), invisible handles (§6), `maxZoom: 1` and `minZoom: 0.2` (§5), and
> `disableKeyboardA11y`. See [P8-T05] in DECISIONS.md.
> P8-T06/T07: `Workflow.stats` and `WorkflowNode.stats` are deleted (§9), and
> `listRuns` returns `Page<WorkflowRunRow>` (run plus read-time `contactName`).
> See [P8-T06] and [P8-T07] in DECISIONS.md.
> P8-T02: layouts are computed once at import as a frozen `LAYOUTS`, not per
> read (§4). P8-T08: `setStatus` takes a third `{ notes, shippedWorkflowId }`
> argument, `list` returns `Page<AutomationRequestRow>`, and requests are
> seeded last. `SEED_VERSION` ended the phase at 7 (P8-T01 → 5, T06 → 6,
> T08 → 7). See [P8-T02] and [P8-T08] in DECISIONS.md.
> P8-T09 (owner decision): a fifth request status, `withdrawn`, which only
> the asker can set while a request is still `requested`, so the "Four
> statuses, not five" note below no longer holds. See [P8-T09] in DECISIONS.md.

## Context

Phase 8 was planned as a GoHighLevel-style no-code workflow builder: a React Flow
canvas where staff drag nodes, wire branches and autosave a graph. The user is
changing direction: **automations are custom-coded by a developer. Staff can view
them and request new ones, but cannot build or edit them.**

The reason this is a better fit for Nimbus: a drag-and-drop builder that persists
to `localStorage` is the least migratable surface in the app — the day a real
backend lands, an editor needs real validation, versioning, and an execution
engine behind it. A read-only view over developer-authored automations keeps the
product honest about who owns the logic, and the "definition" becomes a typed
module that a real backend can execute unchanged.

None of this is built yet. Phase 8 has not started (current position: Phase 4 —
Opportunities), so this is a plan change rather than a rewrite of shipped code.
What already exists is scaffolding: the full `Workflow` type graph, 8 seeded
fixtures, a 6-method API module, the React Flow CSS bridge, the nav entry, and
`@xyflow/react@12.11.6` — with **zero imports anywhere in `src/`**. The route is a
22-line stub rendering a hardcoded `EmptyState`.

### Decisions taken

| Question | Decision |
|---|---|
| Where definitions live | **TypeScript in the repo.** The file is the permission boundary. |
| What staff see | **Read-only React Flow diagram** (no palette, no drag, no save). |
| "Upon request" | **A real in-app request flow** — record with status. |
| Runs | **Run history + logs** — which contact, when, which steps fired. |

### The organising idea: a three-way ownership split

- **Definitions = code.** `src/lib/automations/`, immutable at runtime, dev-owned.
- **Runs = seeded mock data.** History, read-only to everyone.
- **Requests = mock DB.** The single staff-writable surface in the whole feature.

Components still call `api.workflows.*`. The registry is read **behind** the
seam, inside `src/lib/api/workflows.ts`, so the backend-migration story in
CLAUDE.md is unchanged: swap that module's body for `fetch()` and nothing in the
UI moves.

---

## Scope: split into two phases

This is honestly a **re-scope upward**, not a de-scope. The editor added zero
entities; this adds two (`WorkflowRun`, `AutomationRequest`) plus a form. Costed
against Phase 3 (7 pts = table + filters + bulk bar + RHF form + detail route),
the whole thing is ~9 pts. So it splits along the ownership boundary, at the
read/write line:

- **Phase 8a — Automation (read-only), 5 pts.** Registry, layout, list page,
  `[id]` detail, step list, diagram. Deletes the editor API surface. **Zero
  writes** — no new tables, no cascade change, no form. Ships a complete story
  on its own: "automations are built by developers; here they are."
- **Phase 8b — Requests + run history, 4 pts.** Two entities, seeders, cascade,
  integrity checks, the request form, the run log. Purely additive.

Numbered `8a`/`8b` so Phases 9 and 10 keep their numbers.

If 8b must be trimmed further, cut **run history**, not the request flow — the
"which steps fired" value is largely delivered by the step list rendering the
definition, and `Workflow.stats` already carries aggregates.

---

## Phase 8a — Automation (read-only)

### 1. Authored types (`src/types/workflow.ts`)

Extend the existing file; `src/types/index.ts:8` already re-exports it.

Keep `TriggerKind`, `ActionKind`, `WorkflowNodeConfig`, `WorkflowNode`,
`WorkflowEdge`, `WorkflowStatus`. Add the authored layer:

```ts
export interface AutomationDefinition {
  /** Stable, hand-written: "wf_speed_to_lead". Never faker-generated. */
  id: ID;
  name: string;
  description: string;
  folder: string;
  status: WorkflowStatus;
  /** Stable key (user slug/role), resolved to a real user at read time. */
  owner: string;
  trigger: { kind: TriggerKind; label: string; config: WorkflowNodeConfig };
  steps: StepList;
  settings: { allowMultipleEnrollment: boolean; stopOnReply: boolean };
}
```

**Make rejoin unrepresentable.** A branch is terminal — no fixture rejoins, GHL
does not either, and a rejoin turns the tree into a DAG that breaks tree-walking
layout outright. Encode it in the type rather than documenting it:

```ts
type StepList = [...LinearStep[], BranchStep] | LinearStep[];
```

Steps after an `if_else` in the same array are then a compile error rather than
silently-unreachable nodes.

Authored steps carry **no `position`/`width`/`height`** — hand-writing
coordinates is miserable and rots. Those are derived (§3).

### 2. The registry (`src/lib/automations/`)

One module per automation, transcribed from the 8 existing fixtures in
`src/lib/mock/seed/workflows.ts` (389 lines) — the content is good: realistic
copy, `{{contact.first_name}}` merge fields, and Speed to Lead's real two-branch
`FilterGroup` (`b_replied` / `b_silent`). It loses faker stats and positions and
gains nothing else.

```
src/lib/automations/
  index.ts             AUTOMATIONS registry, keyed by slug
  layout.ts            definition -> WorkflowNode[] / WorkflowEdge[]
  speed-to-lead.ts     ... and 7 more
```

**No faker.** ESLint confines it to `src/lib/mock/seed/**`, and these are
constants.

**The easy-to-miss piece: definitions cannot reference tags or users by id.**
`seed/workflows.ts:97-98` resolves `tagId("Demo Booked")` and `userIds.slice(0,2)`
from faker rows whose nanoid ids change on every reseed. Code-owned definitions
have no access to those. So definitions reference **stable keys** — tag *name*,
user *slug* — and `src/lib/api/workflows.ts` resolves them to ids at read time.
This affects five members of the config union: `add_tag`, `remove_tag`,
`tag_added`, `assign_user`, `internal_notification`. Do this resolution step
first; it is easy to discover halfway through transcribing module three.

Do **not** add `sourcePath` as a field. There is no reliable runtime way to get a
module's source path in a Next client bundle, so it would be hand-written and
would rot on rename. Derive it for display from the registry key:
`src/lib/automations/${key}.ts`.

### 3. Deterministic layout (`src/lib/automations/layout.ts`)

Walks the authored tree and emits positioned `WorkflowNode[]` / `WorkflowEdge[]`.
Hand-rolled (~90 lines), not dagre/elk — the shapes are linear chains plus one
fork.

Reuse `NODE_WIDTH = 260`, `NODE_HEIGHT = 78`, `Y_STEP = 130` from
`seed/workflows.ts:18-21`. **Do not reuse the `300` x-pitch** — against a 260
node that is a 40px gutter, which only survived because exactly one fixture
forks. Re-derive as `NODE_WIDTH + GUTTER` with a real gutter (~64).

Three things the naive version gets wrong:

- **Fan-out is not ±1.** The seed hardcodes columns −1/+1 because n=2. General
  form: `parentCol + (i - (n-1)/2) * spread`.
- **Subtree width, not node count, drives collisions.** `BranchStep` is
  recursive, so a branch containing its own fork will happen eventually. Write
  the width-accumulating version from the start — measure each subtree's column
  span bottom-up, assign x by accumulating sibling spans. ~30 extra lines, and
  it is the difference between "works for these 8" and "works".
- **`end` nodes are emitted, not authored.** Today exactly one of eight fixtures
  has an explicit `end` (`seed/workflows.ts:243`) — a fixture accident. Append
  `end` at every terminal including each branch tail: diagrams read as finished,
  run logs get a terminal node id, and one decision leaves the authoring API.
  Render it as a short pill (~40px) rather than a 260×78 card so two side-by-side
  `end` nodes on a fork are not noisy — `WorkflowNode` already carries per-node
  `width`/`height` (`src/types/workflow.ts:87-88`).

**Keeping layout honest with no test runner.** `package.json` has no test script
(dev/build/start/lint/format/typecheck/check only), so use the two surfaces that
already exist:

1. Run layout **at module scope** in `index.ts`, so importing the registry
   evaluates it and a `throw` (empty branch, malformed step) fails `next build`.
   Guarantee the build imports it by giving `/automation/[id]` a
   `generateStaticParams()` returning the registry ids — worth doing anyway,
   since the full set of automations is known at build time.
2. Add an **AABB overlap check** to the integrity report (§6). ≤20 automations ×
   ≤15 nodes is nothing, and a colliding 3-branch fork shows up as a red line on
   the Demo Data page the day it is added.

### 4. API (`src/lib/api/workflows.ts` — rewrite)

Delete `create`, `update`, `duplicate`, `setStatus`, `remove` — all editor-only.
`update` is explicitly documented as debounced-autosave-from-canvas
(`workflows.ts:60-64`); there is no canvas any more.

Keep `list()` and `get(id)`, re-pointed at the registry: read `AUTOMATIONS`, run
`layout()`, resolve stable keys → ids against `db.tags` / `db.users`, return
`Workflow`. Keep `{ canFail: false }` per the read convention, and use
`nowIso()`/`apiNow()`, never `new Date()`.

`list()` stays `Promise<Workflow[]>` — 8 rows do not need `Page`.

**No new ESLint rule.** The existing seam restriction exists because
`@/lib/mock` is *mutable state*; automation definitions are frozen, pure,
serialisable data with no failure mode if imported directly, and
`eslint.config.mjs` already forks `no-restricted-imports` three ways (`:35`,
`:38-53`, `:56-59`). Routing reads through `api.workflows.*` is still correct —
for the migration story, not for safety. Record that as prose in CLAUDE.md.

### 5. UI (`src/components/modules/automation/`)

**Build the step list first and let the diagram be the enhancement.** Three
reasons, and the third is the decisive one:

1. React Flow renders divs, so it is not invisible to screen readers — but
   reading order is DOM insertion order, not graph order, and edges and branch
   labels are SVG paths with no accessible text. A nested `<ol>` conveys
   "then, and if X then Y" natively.
2. A two-branch fork needs ~600px. `useIsMobile()` (`src/hooks/use-mobile.ts`,
   SSR-safe, breakpoint 768) already exists — below that, render the list and do
   not mount React Flow at all.
3. **The step list is the run-log renderer.** Phase 8b needs "which steps fired,
   in order, with status" — that is this component with per-step status
   decoration. One component, two uses.

If the diagram slips, there is still a complete product.

Components:

- `automation-step-list.tsx` — nested `<ol>`; optional
  `statuses?: Map<ID, RunStepStatus>` prop for 8b.
- `automation-graph.tsx` — read-only React Flow.
- `automation-node.tsx` — custom node: kind icon + label + a one-line config
  summary (a ~20-case switch over `WorkflowNodeConfig`).
- `automation-list.tsx` / `automation-card.tsx` — grouped by folder.

**The highest-value screen is the list page, not the diagram** — "these eight
automations exist, here is what each does, who owns it, and how to ask for a new
one" carries the entire concept change on its own. Build it first.

Read-only precedent to copy:
`src/components/modules/contacts/detail/contact-opportunities-panel.tsx` —
`useResource` + `Skeleton` loading + a muted one-line empty state (not the full
`EmptyState`) + non-interactive `<Card size="sm">`, no links or handlers.

**React Flow props** (verified against `@xyflow/react@12.11.6`
`component-props.d.ts`):

```tsx
nodesDraggable={false} nodesConnectable={false} edgesReconnectable={false}
elementsSelectable={false} nodesFocusable={false} edgesFocusable={false}
panOnDrag zoomOnScroll={false} preventScrolling={false}
zoomOnDoubleClick={false} fitView fitViewOptions={{ padding: 0.2 }}
```

`zoomOnScroll={false}` **paired with `preventScrolling={false}`** is the one that
matters: by default React Flow captures wheel events, so on a detail page with
run history below the graph, scrolling with the cursor over the diagram traps the
page scroll. Leave zoom to `<Controls showInteractive={false} />`. Keep
`panOnDrag` — a diagram you cannot pan is worse than a screenshot. Memoise
`nodeTypes` at module scope or React Flow warns every render. Ignore
`Workflow.viewport` (`src/types/workflow.ts:114`) — it exists for an editor's
"resume where you left off"; `fitView` every time. **Cut the MiniMap** — with ≤9
fitView'd nodes it is decoration.

Do **not** set `proOptions={{ hideAttribution: true }}`. Hiding attribution is
only licence-compliant under a React Flow Pro subscription. The CSS bridge
already sets `--xy-attribution-background-color-default: transparent`, which is
the right instinct: keep it, de-emphasise it.

### 6. CSS (`src/app/globals.css`)

**The stylesheet import is a cascade problem, not a code-splitting one.**
`@xyflow/react/dist/style.css` is currently imported nowhere and React Flow will
not lay out without it. Importing it inside the client component does not
route-scope it at runtime (Next hoists it into the build graph) and gives no
control over layers. Tailwind v4 puts everything in
`@layer theme, base, components, utilities`; React Flow's stylesheet is
**unlayered**, and unlayered CSS beats layered CSS regardless of source order —
so `.react-flow__node` would win over every Tailwind utility on a custom node,
whatever the import site. Import it into a layer from `globals.css`, alongside
the existing `@import "tailwindcss"` block:

```css
@import "@xyflow/react/dist/style.css" layer(components);
```

Verify this resolves through Tailwind v4's `@import` handling for a package path.
If it does not, the fallback is a wrapper class with raised specificity — not
`!important`.

**Prune the bridge** (`globals.css:206-236`, ~20 declarations → ~9). With custom
node components and no editing, these go dead: `--xy-connectionline-*` (only
renders while dragging from a handle), `--xy-edge-stroke-selected-*` and
`--xy-node-boxshadow-selected-*` (nothing is selectable),
`--xy-node-boxshadow-hover-*`, `--xy-node-border-*`,
`--xy-node-background-color-*` (these three style React Flow's *built-in* nodes,
not custom ones), and `--xy-minimap-*` (MiniMap cut). **Keep** `--xy-handle-*`
(custom nodes still render `<Handle>`, and visible source handles on `if_else`
are informative), all five `--xy-controls-*`, `--xy-background-color`,
`--xy-edge-stroke-default`, `--xy-edge-stroke-width-default`, and
`--xy-attribution-*`.

### 7. Store, seed and integrity

**Delete `workflows: Table<Workflow>` from `src/lib/mock/db-state.ts:60`.** An
always-empty table would report `workflows: 0` on the Demo Data page while eight
automations show in the nav. Deleting it produces two *useful* typecheck failures
at `src/lib/api/settings.ts:99` and `:232`. **Keep** the `"workflows"`
`ResourceKey` — `useResource` still needs it.

**Bump `SEED_VERSION` to `2`** (`db-state.ts:29`). The reseed path is already
safe: `db.ts` `migrate: () => EMPTY_DB`, and `settings.ts:22` reseeds when
`seededAt` is absent.

**The real coupling is faker stream position, not foreign keys.** Worth stating
plainly, because it is the opposite of what it looks like: *no seeded row points
at a workflow id today.* `sentByAutomation`, `Activity.workflowId` and
`"workflow.enrolled"` exist only as type declarations and are never written;
`seed/calendars.ts:176` `source: "workflow"` is an enum value, not a key. But
`seed/index.ts:39-45` says call order is load-bearing — faker is seeded once and
consumed sequentially. `seedWorkflows` sits at position 9 of 13, so **removing it
shifts every faker draw for `seedTasks`, `seedNotes`, `seedSmartLists` and
`seedActivities`.** Not a crash; every task title, note body and activity in the
demo world changes. Take that cost here, at the reseed, not in a prep commit.

**Replace the integrity check, do not delete it.** `settings.ts:230-236`'s
edge→node check becomes structurally unfailable once edges are generated. Swap in
checks that *can* fail: node-box overlap (§3), duplicate node ids, every branch
has ≥1 step. Demo Data counts become `automations: <registry length>` — counting
a code constant in a "Demo Data" panel is slightly odd but honest, and doubles as
a smoke test that the registry loaded.

### 8. Routes

Use **real routes, not client tabs**. The `/automation/requests` vs
`/automation/[id]` collision is a phantom concern — Next resolves static segments
before dynamic ones by design, and no automation may be id `"requests"`, which is
trivial when ids are hand-authored as `wf_*`. On merit, routes win: the request
list is linkable, gets its own `metadata`, and the repo's only other multi-view
section already uses routes (`src/app/(app)/settings/page.tsx` +
`settings/demo-data/page.tsx`).

- `/automation` — list, grouped by folder, plus a "Request an automation" CTA.
- `/automation/[id]` — detail: step list + diagram + `generateStaticParams()`.
  Follow `src/app/(app)/contacts/[id]/page.tsx` exactly: thin server component
  awaiting `params`, delegating to a client component.
- `/automation/requests` — Phase 8b.

Drop the stub's `p-4 md:p-6` wrapper on the detail route for an edge-to-edge
canvas. `src/app/(app)/layout.tsx:15-21` already warns that a missing `min-h-0`
anywhere in the chain silently collapses the canvas to zero height.

### 9. Copy and dead fields

- `WorkflowStatus` is `draft | published | paused` (`workflow.ts:104`). Under code
  ownership nobody can pause anything, so "Churn Risk Alert (draft)" now means
  "a dev started this and never finished". Keep the type, but write list-page
  copy that reads as lifecycle state, not as an editor control staff are missing.
- `settings.allowMultipleEnrollment` / `stopOnReply` (`:115-118`) are read by
  nothing. **Display** them on the detail page as "how this behaves" copy rather
  than leaving them populated-but-unread.
- `WorkflowNode.stats` (`:90-91`, "fake run counters") is the dangerous one: once
  8b ships real runs, derive per-node stats from them or **delete the field**.
  Faked counters contradicting real run history on the same screen is exactly
  what makes a demo read as fake.

---

## Phase 8b — Requests + run history

### Entities (`src/types/workflow.ts`)

```ts
export type RunStatus = "completed" | "failed" | "active" | "dropped";
export interface WorkflowRunStep {
  nodeId: ID; at: ISODate;
  status: "ok" | "skipped" | "failed";
  detail?: string;                       // "SMS sent", "branch: replied"
}
export interface WorkflowRun {
  id: ID; workflowId: ID; contactId: ID; status: RunStatus;
  startedAt: ISODate; endedAt?: ISODate;
  steps: WorkflowRunStep[]; error?: string;
}

export type AutomationRequestStatus =
  | "requested" | "in_review" | "shipped" | "declined";
export interface AutomationRequest extends Audited {
  id: ID; title: string;
  problem: string; trigger: string; outcome: string;  // free text
  status: AutomationRequestStatus;
  priority: "low" | "normal" | "high";
  notes?: string;                    // the dev's reply
  shippedWorkflowId?: ID;            // closes the loop
}
```

`AutomationRequest` uses `Audited.createdBy` / `createdAt` (`common.ts:32`) —
do not add a duplicate `requestedBy` / `requestedAt`. Four statuses, not five:
`in_review` and `building` would have no distinct UI.

### Plumbing

- **New tables in `db-state.ts`; new seeders appended at the *end* of
  `buildDb()`**, per the `seed/index.ts:39-45` call-order rule.
- **The runs seeder imports the real registry** so run step logs reference node
  ids that actually exist in the rendered diagram.
- **`cascadeContactDelete` (`src/lib/mock/cascade.ts:36-73`) must sweep
  `workflowRuns`.** Phase 3 already ships bulk contact delete, and runs carry
  `contactId` — without this, deleting a contact orphans every run for them and
  the integrity report goes red. This is precisely the trap that function's own
  comment warns about. Denormalising a contact name onto the run to dodge it is
  worse: it kills click-through, which is the point of run history.
- **Adding `"automationRequests"` to `ResourceKey` means editing `cache.ts` in
  *two* places** — the union at `:8-25` *and* the hand-maintained literal list
  inside `invalidateAll()` at `:55-73`. Missing the second means "reseed does not
  refresh the requests list": silent and annoying to track down.
- New integrity checks: runs referencing a missing node id or a missing contact;
  requests with a dangling `shippedWorkflowId`.

### API and UI

`src/lib/api/workflows.ts` gains `listRuns(workflowId, query): Page<WorkflowRun>`
via `applyQuery`. Note `query-engine.ts:207-214` only slices when `pageSize` is
truthy and defaults it to `total` — omitting it returns everything with
`pageCount: 1`.

New `src/lib/api/automation-requests.ts`, shaped like `smart-lists.ts`:
`list(query)`, `get(id)`, `create(draft)`, `setStatus(id, status)`, `remove(id)`.
Mutations use a longer `ms`, may fail, and end with `invalidate(...)`.

UI: run history as a `DataTable` consumer on the detail page; a run detail sheet
reusing `automation-step-list` with statuses; the request form as RHF + zod
through the `Field*` components (`FieldError` takes RHF's errors array directly —
`<Form>` is not used in this project).

---

## A constraint to record now, before Phase 5

**`Message.sentByAutomation` and `Activity.workflowId` are populated from the code
registry, never from the store.** The natural move when building the Conversations
inbox (Phase 5) is to populate `sentByAutomation` from `Object.values(db.workflows)`
to get a "sent by automation" badge — but that table is being deleted. If it
lands, Phase 8 has to rewrite conversation seed data and the faker-stream
problem compounds. Same for Phase 7 and `appointment.source === "workflow"`.

Cheapest path: Phase 5 leaves both unset (they are optional), and Phase 8b's run
seeder backfills `sentByAutomation` on a handful of existing messages. That
backfill is optional polish — cut it first if scope hurts — but it buys a good
demo moment: run log step → open the actual SMS in the inbox.

Add this to PROGRESS.md (or CLAUDE.md's seam section) as part of this plan
change, not at Phase 8.

---

## Files

**New:** `src/lib/automations/{index,layout,*.ts}` ·
`src/components/modules/automation/*` · `src/app/(app)/automation/[id]/page.tsx` ·
`src/app/(app)/automation/requests/page.tsx` (8b) ·
`src/lib/api/automation-requests.ts` (8b) · `src/lib/mock/seed/{runs,requests}.ts` (8b)

**Rewritten:** `src/lib/api/workflows.ts` · `src/app/(app)/automation/page.tsx`

**Edited:** `src/types/workflow.ts` · `src/lib/mock/db-state.ts` (drop
`workflows`, `SEED_VERSION` → 2) · `src/lib/mock/seed/index.ts` (remove
`seedWorkflows` at position 9; append new seeders at the end) ·
`src/lib/api/settings.ts` (counts + integrity) · `src/lib/mock/cascade.ts` (8b) ·
`src/lib/api/cache.ts` (8b, two places) · `src/app/globals.css` (layered import +
prune bridge) · `CLAUDE.md` · `PROGRESS.md`

**Deleted:** `src/lib/mock/seed/workflows.ts` (transcribed into the registry).

---

## Verification

`npm run check` must be green (format:check → lint → typecheck → build) before
either phase is ticked off in `PROGRESS.md`. The build is itself a layout test —
module-scope layout evaluation plus `generateStaticParams()` means a malformed
definition fails `next build` rather than rendering wrong.

Then, via `preview_start` and the Browser pane:

1. `/automation` — 8 automations grouped into 5 folders, each with trigger
   summary and owner. Confirm with `read_page`, not a screenshot.
2. `/automation/wf_speed_to_lead` — the fork renders with both branch labels and
   no overlapping boxes; `end` pills at both branch tails (9 nodes).
3. **Scroll trap check** — with the cursor over the diagram, the page scrolls and
   the canvas does not zoom. This is the specific regression
   `preventScrolling={false}` guards.
4. `resize_window` to mobile (375×812) and reload — the step list renders and
   React Flow is not mounted.
5. `resize_window` with `colorScheme: "dark"` — nodes, edges and Controls follow
   the theme through the pruned bridge.
6. Settings → Demo Data — `automations: 8`, integrity report clean. Then reseed
   and confirm it stays clean (this is where stable-key → id resolution proves
   itself: tag and user references must survive new nanoids).
7. **8b:** delete a contact that has runs, then re-check the integrity report —
   it must stay clean, proving the `cascade.ts` sweep.

Per CLAUDE.md, the pane is often hidden, which freezes `requestAnimationFrame`
and the CSS animation timeline. Prefer `read_page` / `get_page_text` over
screenshots, and set `animated: false` on generated edges — animated edges are
exactly the thing that reads as broken in a hidden pane.
