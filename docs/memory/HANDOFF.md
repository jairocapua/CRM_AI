# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.
> Since 2026-10-25 the build may also run from Hermes Agent, which has no `Workflow` tool: the orchestrator follows `.claude/workflows/build-phase.js` step by step with helper agents (implementer, then verifier + reviewer in parallel, up to 2 fix rounds) and does the recorder steps itself.

## Now

- **Phase:** P9 Settings — active, 3/7 tasks done.
- **Branch:** `phase/p9-settings`, cut from `master` at `4d72e89`. Nothing pushed.
- **Status:** P9-T03 approved (pending sha); P9-T04 Custom fields manager is next. Start it in a fresh session.

## Last change

- P9-T03 Team and invites: `/settings/team` lists the team (role, Active/Pending, last seen; your row marked "You"). Invite dialog (duplicate emails refused, location time zone, no email promised). Role Select per teammate (not your own). Remove dialog previews what moves and to whom (you by default), or explains why the teammate can't be removed (named in an automation). `users.update` is now an allow-list (profile keys + role); `users.removalPreview` shares its rules with `users.remove`.
- One fix round: an e2e proves a removed row hides before the list reloads; the success toast names the new owner only when something moved; the invite dialog can't close mid-invite; extra focus and copy tests.
- `npm run check` green (1159 Vitest); settings, smoke, fixture, link-button and select e2e 82/82; react-table 8.21.3.

## Next up

- P9-T04 (deep, UI): Custom fields manager. Its phase-file scope carries the P9-T01 and P9-T03 review notes (duplicate key 409 with field marking; `update` ignores `key`/`objectType`; done flag proven by failing the refetch; no dialog close while pending).
- Then P9-T05 Pipelines and stages (scope also carries review notes), P9-T06 Tags, P9-T07 (depends on P9-T04).

## Waiting on you (owner)

- Nothing blocking.
- Optional, reversible: "Pending" means never signed in; you can't change your own role or remove yourself; demoting the last admin is not guarded yet (BACKLOG) ([P9-T03]). Currency/role read-only on the forms, no address/logo, location switcher does not switch ([P9-T02]). Teammates named in an automation can't be removed ([P9-T01]).
- Optional click-through: `npm run dev`, open http://localhost:3000/settings → Profile (change your first name, Save; the sidebar shows it) → Team (Invite teammate, see "Pending"; Remove on Priya explains the automation; Remove on your invitee removes them) → Demo data (no integrity problems).

## Open suggestions (non-blocking)

- `docs/BACKLOG.md` holds P8 leftovers and the P9-T01/T02/T03 review leftovers (business time zone not yet used for new contacts, last-admin guard, `scope="col"` on table headers).
- Calendar ids, pipeline/stage ids and `templateId` are still id-typed in authored configs; they need stable keys before any definition uses them.

## Blockers

- None.
