# P9 — Settings

**Phase:** P9 · **Points:** 4 · **Branch:** `phase/p9-settings`

**Goal:** the settings area: profile, business, team and invites, custom
fields, pipelines and stages, tags with merge, and the Demo Data page reachable
from `/settings`. Every destructive action keeps the integrity report clean.

**Prerequisites:** P8 done and merged into `master`.

**Spec refs:** `docs/spec.md` row 9 and its exit check ("Add a stage → board
shows the column"). `docs/history/phases-0-6.md` "Deferred" (pipeline and stage
management notes).

## Tasks

### P9-T01 — Settings API fixes (step 0)
- **Owner:** agent · **Depends:** P8
- **Review:** deep
- **Skills:** `tdd`, `vitest`
- **Scope:** fix the existing API before UI depends on it.
  - `pipelines.removeStage` (`src/lib/api/pipelines.ts:118-133`): it moves
    deals with a bare `db.setState` outside `simulate()`, and an unknown stage
    id makes the neighbour lookup read `stages[-2]`. Move the deal moves into
    the simulated mutation, and return a 404 for an unknown stage. (Stage
    `position` renumbering already works.)
  - `pipelines.remove` (`:153-165`) hard-deletes deals with no sweep. Route it
    through the existing `cascadeOpportunityDelete` (`src/lib/mock/cascade.ts:81-102`).
  - `users.remove` (`users.ts:73-82`): reassign the user's contacts, deals and
    calendar `teamMemberIds` (or refuse while they own records), so nothing
    dangles.
  - `customFields.remove` (`custom-fields.ts:70-80`): also clear the stored
    values on contacts and deals.
- **Acceptance:**
  - [ ] A test per fix, each starting from a fresh seed and ending with a clean
        integrity report.
  - [ ] Removing a stage with deals moves them to the neighbouring stage and
        fails cleanly for an unknown stage.
- **Refs:** `src/lib/api/settings.ts` `integrityReport()`

### P9-T02 — Settings shell, profile and business
- **Owner:** agent · **Depends:** P8
- **Review:** light
- **Skills:** `shadcn`, `vercel-react-best-practices`
- **Scope:** `/settings` becomes a section layout with real routes (like the
  existing `settings/demo-data`): Profile (`users.me`/`update`), Business
  (`settings.updateLocation`, including the location timezone), and links to
  Team, Custom fields, Pipelines, Tags and Demo Data. Forms: RHF + zod via
  `Field*`.
- **Acceptance:**
  - [ ] e2e: edit the profile name, reload, and it persists; the sidebar user
        shows the new name.
  - [ ] e2e: Demo Data is reachable from `/settings`.
- **Refs:** `src/app/(app)/settings/`, `src/lib/api/settings.ts`

### P9-T03 — Team and invites
- **Owner:** agent · **Depends:** P9-T01, P9-T02
- **Review:** light
- **Skills:** `shadcn`
- **Scope:** team list with roles; invite (`users.invite`) showing a pending
  member; role change (`users.update`); remove with a confirm that names what
  will be reassigned.
  - From the P9-T01 review: every seeded teammate but the current user is
    named in an automation, so `users.remove` refuses them (409
    `NAMED_IN_AUTOMATION`); the reassign e2e invites a member, gives them a
    contact (contact form Owner select), removes them, and checks the owner
    and the Demo Data report. Add an e2e for the refusal message on a seeded
    teammate. Pass `reassignTo` as `undefined`, never `""`. Define "pending"
    (no field yet). `users.update` ignores `id` and `slug` (role change only
    from the UI), with a test. `REASSIGN_TARGET_NOT_FOUND` text names no raw
    id. The confirm says follows are dropped and history keeps the name.
  - From the P9-T02 review: the page sits in the settings layout (return a
    fragment, keep the "Team settings" heading the shell and smoke e2e use);
    decide email uniqueness for invites; `invite` should take the location's
    time zone rather than a hard-coded one.
- **Acceptance:**
  - [ ] e2e: invite a member, then see them listed as pending.
  - [ ] e2e: removing a member who owns contacts reassigns them and the
        integrity report stays clean.
- **Refs:** `src/lib/api/users.ts`; replaces the P7-T42 placeholder at
  `src/app/(app)/settings/team/page.tsx`

### P9-T04 — Custom fields manager
- **Owner:** agent · **Depends:** P9-T01, P9-T02
- **Review:** deep
- **Skills:** `shadcn`, `vercel-react-best-practices`
- **Scope:** list fields per object type; create, edit, reorder and remove
  (`customFields.*`). The contact and deal forms build their schemas from these
  definitions (`validation/custom-fields.ts`, `CustomFieldsSection`), so a
  change must show up there with no other edits. Currency fields stay in
  cents (the Phase 4 bug).
  - From the P9-T03 review: the duplicate-key 409 carries `field: "key"` (or
    the label field it derives from) and is marked with `serverErrorField`;
    hide a removed field with a done flag before the refetch, proven by
    failing the list read after confirming; block dialog close while a
    mutation is pending.
  - From the P9-T01 review: `customFields.create` refuses a duplicate key
    for the same object type (409), and `update` ignores `key` and
    `objectType` (either change orphans stored values and turns the
    integrity report red), each with a test.
- **Acceptance:**
  - [ ] e2e: add a contact field, and the contact form shows it and saves a
        value; remove it, and the value is gone.
  - [ ] e2e: reordering changes the order in the contact form.
- **Refs:** `src/lib/validation/custom-fields.ts`, `src/components/common/custom-fields-section.tsx`

### P9-T05 — Pipelines and stages manager
- **Owner:** agent · **Depends:** P9-T01, P9-T02
- **Review:** deep
- **Skills:** `shadcn`, `vercel-react-best-practices`
- **Scope:** create and rename pipelines; add, rename, reorder (drag with
  `@dnd-kit`, as on the board) and remove stages; delete a pipeline with a
  confirm stating how many deals go with it. Uses `pipelines.*` only.
  - From the P9-T03 review: the delete-pipeline confirm copies the Team
    remove pattern: one `pipelineRemovalRefusal()` thrown by `remove()` and
    returned by a preview read whose deal count uses `cascadePipelineDelete`'s
    predicate, with a unit test comparing preview and actual deletion; done
    flag for removed stages/pipelines proven by failing the refetch; block
    dialog close while pending; `failReads(page, "opportunities")` fails a
    count preview in e2e.
  - From the P9-T01 review: `reorderStages` returns 422 unless the ids are
    exactly the pipeline's stages (a stale list drops a stage and orphans
    its deals); `addStage`/`updateStage`/`reorderStages` each become one
    `simulate()` write, and `update()` stops accepting `stages`. Moved deals
    from `removeStage` get `stageEnteredAt`/`updatedAt` reset from one
    `nowIso()` (days-in-stage), with a test. The board copes with its
    selected pipeline being deleted. The remove-stage confirm says won
    deals stay won.
  - From the P9-T04 review: a whole-table `Object.values` read inside a write (e.g. renumbering stages) trips e2e `failReads` for that table; if stages get keyboard Move up/down besides the drag, reuse the custom fields list's wait-for-refetch rule (a second optimistic move before the first refetch jumps back).
- **Acceptance:**
  - [ ] e2e (the phase exit check): add a stage, open the board, and the new
        column is there.
  - [ ] e2e: reorder stages, and the board columns follow.
  - [ ] The integrity report is clean after removing a stage and after
        deleting a pipeline.
- **Refs:** `src/components/modules/opportunities/board-dnd.ts`

### P9-T06 — Tags manager with merge
- **Owner:** agent · **Depends:** P9-T02
- **Review:** light
- **Skills:** `shadcn`
- **Scope:** tags with contact counts (`tags.list`); create, rename,
  recolour, remove; merge one tag into another with a confirm (`tags.merge`).
  - From the P9-T04/T05 reviews: reuse `ColorSwatchPicker` (settings/) and `TAG_COLOR_LABELS` (constants); put every mutation's returned record into a page-level saved map (newest `updatedAt` wins), not only a done flag; prove "one write" with a lost-update unit test (two at once), not a 100% failure-rate test; add the remove and merge FAILURE-path e2e (dialog stays open, confirm focused) up front; `tags.list` counts through contacts, so `failReads(page, "contacts")` fails the list.
- **Acceptance:**
  - [ ] e2e: merging tag A into B leaves B with the combined count and A gone.
- **Refs:** `src/lib/api/tags.ts`

### P9-T07 — e2e: create required custom fields via settings UI
- **Owner:** agent · **Depends:** P9-T04
- **Scope:** After P9-T04 lands, replace addRequiredCustomFields/DB_KEY in e2e/deal-form.spec.ts with the custom fields manager UI.
  - From the P9-T04 review: move the helpers in `e2e/settings-custom-fields.spec.ts` (`addField`, `choose`, `storedFieldLabels`, `formFieldLabels`) to a shared `e2e/settings-helpers.ts` and teach them Required and options (controls: checkbox "Required", combobox "Type", inputs "Option N", button "Add option"). A checkbox field cannot be required ([P9-T04]).
- **Acceptance:**
  - [ ] deal-form.spec.ts creates its required custom fields through /settings/custom-fields; `grep -n "addRequiredCustomFields\|DB_KEY" e2e/deal-form.spec.ts` finds no field injection left, and the spec stays green.
- **Refs:** added by `progress.mjs add` on 2026-10-24

### P9-T08 — Gate fix: tags.merge honours the Demo Data latency
- **Owner:** agent · **Depends:** P9-T06
- **Scope:** tags.merge pinned simulate({ ms: 400 }), which ignores the Demo Data latency slider, so the 'a failed merge keeps the dialog open' e2e had a ~0.2-0.6s pending window and failed once in the gate's full run (Cancel already re-enabled). Merge uses the shared latency like every other write; tidy the stale settings-sections.ts placeholder comment.
- **Acceptance:**
  - [ ] tags.merge has no fixed ms; tags unit tests green (merge+remove lost-update pair now overlaps); settings-tags.spec.ts green with --repeat-each=5; full npm run e2e green.
- **Refs:** added by `progress.mjs add` on 2026-10-26

## Exit criteria (phase gate)
- [ ] Add a stage → the board shows the column (e2e).
- [ ] The integrity report is clean after each destructive settings action.
- [ ] `npm run check` and `npm run e2e` are green.
