# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.
> Since 2026-10-25 the build may also run from Hermes Agent, which has no `Workflow` tool: the orchestrator follows `.claude/workflows/build-phase.js` step by step with helper agents (implementer, then verifier + reviewer in parallel, up to 2 fix rounds) and does the recorder steps itself.

## Now

- **Phase:** P9 Settings — active, 2/7 tasks done.
- **Branch:** `phase/p9-settings`, cut from `master` at `4d72e89`. Nothing pushed.
- **Status:** P9-T02 approved (`5c8a9f9`); P9-T03 Team and invites is next.

## Last change

- P9-T02 Settings shell, profile and business: `/settings` is a section layout (nav "Settings sections": Profile, Business, Team, Custom fields, Pipelines, Tags, Demo data; a column on desktop, a scrolling row on phones) with an overview of section cards. Profile and Business forms (RHF + zod, server error kept, leave guard, load-error Retry); the API checks the same rules (422 `INVALID_PROFILE` / `INVALID_LOCATION`). The sidebar user menu and location switcher now read the API, so a saved name shows there at once. Placeholder pages for Custom fields, Pipelines and Tags.
- One fix round (done by the orchestrator): the Role field's Team link now asks before dropping unsaved edits; four help texts no longer promise things the app does not do; `users.update` ignores `undefined` values.
- `npm run check` green (1117 Vitest); settings, smoke, fixture, link-button and calendar load-error e2e 89/89; react-table 8.21.3.

## Next up

- P9-T03 (light, UI): Team list, invite, role change, remove with a reassign confirm. Its phase-file scope carries the P9-T01 and P9-T02 review notes (seeded teammates are all named in automations, so the reassign e2e invites one; `users.update` allow-list; page inside the settings layout).
- P9-T07 now depends on P9-T04 (it had no dependency, so the tracker offered it first).

## Waiting on you (owner)

- Nothing blocking.
- Optional, reversible: currency and role are read-only on the settings forms; address and logo are not editable yet; the location switcher shows real names but does not switch (DECISIONS [P9-T02]). Removing a teammate reassigns their records to you and is refused for teammates an automation names ([P9-T01]).

## Open suggestions (non-blocking)

- `docs/BACKLOG.md` holds P8 leftovers, P8 gate suggestions and the P9-T01/P9-T02 review leftovers (business time zone not yet used for new contacts, email uniqueness, dark-mode read-only fields).
- Calendar ids, pipeline/stage ids and `templateId` are still id-typed in authored configs; they need stable keys before any definition uses them.

## Blockers

- None.
