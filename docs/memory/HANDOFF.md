# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.
> Since 2026-10-25 the build may also run from Hermes Agent, which has no `Workflow` tool: the orchestrator follows `.claude/workflows/build-phase.js` step by step with helper agents (implementer, then verifier + reviewer in parallel, up to 2 fix rounds) and does the recorder steps itself.

## Now

- **Phase:** P9 Settings — active, 6/7 tasks done.
- **Branch:** `phase/p9-settings`, cut from `master` at `4d72e89`. Nothing pushed.
- **Status:** P9-T06 approved (`45ec20b`); P9-T07 is next.

## Last change

- P9-T06 Tags manager with merge: `/settings/tags` lists every tag with its contact count, with New tag, Edit (rename, recolour with `ColorSwatchPicker`), Merge (pick the tag to keep; the confirm says how many contacts and deals move and the kept tag's count after) and Remove (the confirm says how many contacts and deals lose it).
- API: `tagSchema` shared by the dialog and the API (name 1-40), names unique in any letter case, `update` an allow-list. A tag an automation names (Churn Risk, Demo Booked, Needs Follow Up, Newsletter, Proposal Sent) cannot be renamed, removed or merged away; recolouring and being merged into are fine. `remove`/`merge` now sweep deals as well as contacts (deals used to keep dangling tag ids); the integrity report checks both. Previews share their rules with the mutations.
- Tag picker: a refused new tag name toasts why and stays typed; the list stays open after a create.
- One fix round (same-record lost-update test, concurrent-create test, merge dialog hides its picker while its first check failed, tag picker toast e2e, copy).
- `npm run check` green (1372 Vitest); 16 related e2e specs 180/180; settings-tags 54/54 over 3 repeats; react-table 8.21.3.
- e2e ran on port 3102 through a scratch config: another project's server (sequoya-onboarding) held port 3100.

## Next up

- P9-T07: deal-form.spec.ts creates its required fields through the custom fields UI (acceptance in the phase file).
- Then the P9 phase gate. Gate reviewer: confirm the board copes with its selected pipeline being deleted (per-mount fallback), and grep for any new whole-table `Object.values` inside a write (it trips the e2e faults).

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
