# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.
> Since 2026-10-25 the build may also run from Hermes Agent, which has no `Workflow` tool: the orchestrator follows `.claude/workflows/build-phase.js` step by step with helper agents (implementer, then verifier + reviewer in parallel, up to 2 fix rounds) and does the recorder steps itself.

## Now

- **Phase:** P9 Settings — gate passed, 8/8 tasks done. Waiting on the owner to merge.
- **Branch:** `phase/p9-settings`, cut from `master` at `4d72e89`. Pushed at `54c61e6`; PR #5 merged up to P9-T03, PR #6 (https://github.com/jairocapua/CRM_AI/pull/6) holds P9-T04..T08 and the gate.
- **Status:** P9 phase gate passed. Next: the owner pushes/merges, then P10 Polish starts on `phase/p10-polish` in a fresh session.

## Last change

- P9 gate: `npm run check` green (1379 Vitest); full e2e 281/282, the one failure a boot-wait load flake in `link-buttons.spec.ts` that passed 15/15 alone (BACKLOG); the six settings specs 249/249 over 3 repeats; react-table 8.21.3. The gate review found no blocking defects.
- Exit criteria: add a stage → board column (`e2e/settings-pipelines.spec.ts:246`); integrity report clean after every destructive settings action (unit tests in users/custom-fields/pipelines/tags tests, plus Demo Data e2e checks); check and e2e green.
- P9-T08 gate fix (`993f558`): `simulate()` lets a slowed demo (Demo Data latency above the default) slow calls that pin their own `ms`; the gate's full runs had failed once each on the tags merge and team invite "cannot close while saving" checks.
- P9-T07 (`662dd84`): deal-form e2e creates its required fields through Settings › Custom fields. P9-T06 (`45ec20b`): tags manager with merge.
- e2e ran on port 3102 through a scratch config: another project's server (sequoya-onboarding) held port 3100.

## Next up

- After the merge: `git switch master && git merge --ff-only origin/master && git switch -c phase/p10-polish`, `progress.mjs phase P10 active`, then P10-T01 Command palette (⌘K).

## Waiting on you (owner)

1. REQUIRED: merge PR #6 (https://github.com/jairocapua/CRM_AI/pull/6) into `master` on GitHub.
2. OPTIONAL: stop the `sequoya-onboarding` server on port 3100 before running `npm run e2e` in the CRM, or the run times out.
3. OPTIONAL human checks (every criterion is already proven by named tests): `npm run dev`, open http://localhost:3000, then
   - Settings › Pipelines → Add stage "Demo" to Sales Pipeline → Opportunities: a Demo column sits before Closed Won.
   - Settings › Tags → Merge on "Cold" → pick "Warm" → the dialog gives the counts → Merge tags → Cold is gone, Warm shows the new count; Edit "Newsletter": the name is locked with the reason.
   - Settings › Team → Invite a teammate → they show as Pending; Remove them → the dialog says where their records go.
   - After each, Settings › Demo data → the integrity report says everything is consistent.
4. OPTIONAL, reversible product choices: see DECISIONS [P9-T01]..[P9-T08] (e.g. tag names unique ignoring case, automation-named tags only recolourable, new stages go before Won, field types fixed once added).

## Open suggestions (non-blocking)

- `docs/BACKLOG.md` holds the P8 leftovers, the P9-T01..T06 review leftovers and the P9 gate suggestions (more integrity checks: one default pipeline, positions, unique tag names/slugs; unknown tag ids accepted by contact/deal writes; smart-list filters not swept).
- Calendar ids, pipeline/stage ids and `templateId` are still id-typed in authored configs; they need stable keys before any definition uses them.

## Blockers

- None.
