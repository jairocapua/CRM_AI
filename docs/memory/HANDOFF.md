# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.
> Since 2026-10-25 the build may also run from Hermes Agent, which has no `Workflow` tool: the orchestrator follows `.claude/workflows/build-phase.js` step by step with helper agents (implementer, then verifier + reviewer in parallel, up to 2 fix rounds) and does the recorder steps itself.

## Now

- **Phase:** P9 Settings — active, 4/7 tasks done.
- **Branch:** `phase/p9-settings`, cut from `master` at `4d72e89`. Nothing pushed.
- **Status:** P9-T04 approved (pending sha); P9-T05 Pipelines and stages manager is next.

## Last change

- P9-T04 Custom fields manager: `/settings/custom-fields` has Contacts and Deals tabs listing fields in form order, with Move up / Move down, Edit and Remove. One dialog adds or edits a field (label, type fixed after creation, required, placeholder, help text, dropdown options). Remove shows how many records hold a value and deletes those values. The contact and deal forms pick up every change with no edits to them.
- API: `customFields.create` validates with the dialog's schema and refuses a duplicate key per object type (409 on the label); `update` is an allow-list (key, object type and type never change); `reorder(objectType, ids)` refuses a stale list; `removalPreview` counts held values; removing a field renumbers the rest so a new field always goes last; a new option never takes over a removed option's stored values.
- One fix round (new field landing mid-list, a second edit reverting after a failed refetch, no e2e for a failed removal, option values reused across saves, plus small clean-ups).
- `npm run check` green (1239 Vitest); settings, smoke, deal-form, select, fixture, link-button and contact-picker e2e 120/120; custom-fields spec 45/45 over 3 repeats; react-table 8.21.3.

## Next up

- P9-T05 (deep, UI): Pipelines and stages manager. Its phase-file scope carries the P9-T01, P9-T03 and P9-T04 review notes.
- Then P9-T06 Tags, P9-T07 (deal-form e2e moves to the custom fields UI; acceptance now defined in the phase file).

## Waiting on you (owner)

- Nothing blocking.
- Optional, reversible ([P9-T04]): fields reorder with Move up/down buttons, not drag; a field's type can't change after it is added; removing a dropdown option keeps the values contacts already hold; a checkbox field can't be required. Earlier: "Pending" means never signed in, you can't change your own role or remove yourself, last-admin demotion not guarded yet ([P9-T03]); currency/role read-only, location switcher does not switch ([P9-T02]); teammates named in an automation can't be removed ([P9-T01]).
- Optional click-through: `npm run dev`, open http://localhost:3000/settings/custom-fields → Add field (e.g. "Referral Code", Text) → open any contact, Edit: the field is there; save a value → back in Custom fields, move it up and check the contact form order → Remove it (the dialog says 1 contact holds a value) → the contact's value is gone.

## Open suggestions (non-blocking)

- `docs/BACKLOG.md` holds P8 leftovers and the P9-T01..T04 review leftovers (select fields show raw option values on the contact/deal pages, business time zone not yet used for new contacts, last-admin guard, `scope="col"` on table headers).
- Calendar ids, pipeline/stage ids and `templateId` are still id-typed in authored configs; they need stable keys before any definition uses them.

## Blockers

- None.
