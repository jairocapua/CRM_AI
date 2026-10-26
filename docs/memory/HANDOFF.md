# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.
> Since 2026-10-25 the build may also run from Hermes Agent, which has no `Workflow` tool: the orchestrator follows `.claude/workflows/build-phase.js` step by step with helper agents (implementer, then verifier + reviewer in parallel, up to 2 fix rounds) and does the recorder steps itself.

## Now

- **Phase:** P9 Settings — active, 7/7 tasks done; the phase gate is next.
- **Branch:** `phase/p9-settings`, cut from `master` at `4d72e89`. Nothing pushed.
- **Status:** P9-T07 approved (`662dd84`); the P9 phase gate is next.

## Last change

- P9-T07: `e2e/deal-form.spec.ts` creates its four required deal fields (Dropdown, Multi-select, Long text, Date) through /settings/custom-fields with the shared `addField` helper in `e2e/settings-helpers.ts` (tab, type, options, Required; it throws on a required Checkbox). The custom-field localStorage injection is gone; only the lost-stage injection stays, since no screen makes a lost stage.
- P9-T06 (`45ec20b`): `/settings/tags` tags manager with merge; remove/merge now sweep deals as well as contacts; automation-named tags can only be recoloured.
- `npm run check` green (1372 Vitest); deal-form, settings-custom-fields, settings-shell, smoke, fixture 60/60.
- e2e ran on port 3102 through a scratch config: another project's server (sequoya-onboarding) held port 3100.

## Next up

- The P9 phase gate (`progress.mjs phase P9 gate`; exit criteria at the end of `docs/phases/P9-settings.md`). Gate reviewer: confirm the board copes with its selected pipeline being deleted (per-mount fallback), and grep for any new whole-table `Object.values` inside a write (it trips the e2e faults).

## Waiting on you (owner)

- Nothing blocking.
- Port 3100 is used by the CRM's e2e tests. A `sequoya-onboarding` server was listening on it during this session; stop it before running `npm run e2e` in the CRM, or the run times out.
- Optional, reversible ([P9-T06]): tag names unique ignoring case, 40 characters max; automation-named tags can only be recoloured; smart-list tag filters are not rewritten on merge/remove (none exist yet). Earlier ones: see DECISIONS [P9-T01]..[P9-T05].
- Optional click-through: `npm run dev`, open http://localhost:3000/settings/tags → Merge on "Cold" → pick "Warm" → the dialog says how many contacts and deals move and Warm's new count → Merge tags → Cold is gone and Warm shows the new count → Edit "Newsletter": the name is locked with the reason.

## Open suggestions (non-blocking)

- `docs/BACKLOG.md` holds P8 leftovers and the P9-T01..T06 review leftovers (unknown tag ids accepted by contact/deal writes, smart-list filters not swept, select fields show raw option values, no set-default pipeline, last-admin guard).
- Calendar ids, pipeline/stage ids and `templateId` are still id-typed in authored configs; they need stable keys before any definition uses them.

## Blockers

- None.
