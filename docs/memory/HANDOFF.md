# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.
> Since 2026-10-25 the build may also run from Hermes Agent, which has no `Workflow` tool: the orchestrator follows `.claude/workflows/build-phase.js` step by step with helper agents (implementer, then verifier + reviewer in parallel, up to 2 fix rounds) and does the recorder steps itself.

## Now

- **Phase:** P9 Settings — active, 5/7 tasks done.
- **Branch:** `phase/p9-settings`, cut from `master` at `4d72e89`. Nothing pushed.
- **Status:** P9-T05 approved (pending sha); P9-T06 Tags manager with merge is next. Start it in a fresh session.

## Last change

- P9-T05 Pipelines and stages manager: `/settings/pipelines` has a pipeline picker, New pipeline, Rename and Delete pipeline (the confirm says how many deals are deleted and which pipeline becomes the default), and a stage list you reorder by dragging (mouse or keyboard) with Add, Edit (name, colour, probability) and Remove stage (the confirm says how many deals move and to which stage; won deals stay won). The board follows every change.
- API: pipeline and stage writes are one simulated write each (proven by lost-update tests), allow-lists, duplicate names refused per pipeline (409 on the name field), `reorderStages` refuses a stale list, a new stage goes before Won, deals moved by a stage removal restart their days-in-stage. `removalPreview` / `stageRemovalPreview` share their rules with the removals. New reusable `ColorSwatchPicker` for P9-T06.
- One fix round (saved results kept across a pipeline switch, real one-write tests, delete-pipeline failure e2e, swatch tick contrast, an sr-only "Saving the new order..." status).
- `npm run check` green (1302 Vitest); 14 related e2e specs 170/170; pipelines spec 66/66 over 3 repeats; react-table 8.21.3.

## Next up

- P9-T06 (light, UI): Tags manager with merge. Its phase-file scope carries the P9-T04/T05 review notes (reuse `ColorSwatchPicker`, saved map, lost-update tests, failure-path e2e up front).
- P9-T07: deal-form.spec.ts creates its required fields through the custom fields UI (acceptance defined in the phase file).
- Then the P9 phase gate. Gate reviewer: confirm the board copes with its selected pipeline being deleted (per-mount fallback), and grep for any new whole-table `Object.values` inside a write (it trips the new opportunities/pipelines e2e faults).

## Waiting on you (owner)

- Nothing blocking.
- Optional, reversible ([P9-T05]): new stages go just before Won; won/lost stages can't be switched yet; no "set default pipeline" control; new pipelines are always USD. ([P9-T04]): fields reorder with Move up/down, a field's type is fixed once added, removing a dropdown option keeps stored values, checkbox fields can't be required. Earlier ones: see DECISIONS [P9-T01]..[P9-T03].
- Optional click-through: `npm run dev`, open http://localhost:3000/settings/pipelines → Add stage "Demo" to Sales Pipeline → open Opportunities: the Demo column sits before Closed Won → back in Pipelines, drag Demo to the top (or focus its handle, Space, Arrow Up, Space) → the board's columns follow → Remove a stage with deals: the dialog names the stage they move to.

## Open suggestions (non-blocking)

- `docs/BACKLOG.md` holds P8 leftovers and the P9-T01..T05 review leftovers (select fields show raw option values, no set-default pipeline, no stage-position integrity check, board skeleton forever on a pipelines read error, last-admin guard).
- Calendar ids, pipeline/stage ids and `templateId` are still id-typed in authored configs; they need stable keys before any definition uses them.

## Blockers

- None.
