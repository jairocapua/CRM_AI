# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T17 in review.

## Last change
- P7-T17: contacts search `fullName` (new `SearchField<T>` function fields in applyQuery); list and exportCsv share it.
- ContactPicker `filter={null}`; selected contact pinned only for empty/own-name term.
- New e2e/contact-picker.spec.ts + contacts.test.ts; check (484) + e2e (72) green; SEED_VERSION 4.
- Added P7-T29 (picker selection race after a pick).

## Next up
- **Agent:** P7-T18 (next by tracker).

## Waiting on you
- Review of P7-T17 (deep review).

## Open suggestions (non-blocking review notes)
- new-conversation-dialog.tsx also uses ContactPicker; add it to SURFACES or name it in docs.
- pickContacts uniqueness check ignores phone/jobTitle the server searches.
- query-engine test: note the first assertion proves function support.
- Collapse inner whitespace in search term ("ana  garcia").
- Picker popup shows stale results ~250ms per keystroke; consider a "Searching..." state.
- Skills line for UI tasks should include vercel-react-best-practices / shadcn.
- Earlier: P7-T16 notes (Combobox wording, interaction-only Selects, P7-T27 flake).

## Blockers
- None.
