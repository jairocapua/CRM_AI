# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T46 in review (deep review).

## Last changes (this session)
- P7-T46: `api.opportunities.create()/update()` validate input with one zod schema and save only the parsed result; API-owned/unknown keys ignored, wrong types a 422 INVALID_OPPORTUNITY ("<label>: <rule>", `field` = path), non-object input 422 "Deal: Not a valid value.".
- undefined/null on expectedCloseAt, ownerId, lostReason deletes the key; setStatus() writes via private writeStatus() (no own undefined keys left).
- `withoutUndefined` moved to `src/lib/api/patch.ts` (shared with calendars.ts). Vitest 676 -> 730; e2e 120 passed.

## Next up
- **Agent:** P7-T47 (once P7-T46 is approved).

## Waiting on you
- Review of P7-T46.
- P7-H4: should an ended appointment that is already Cancelled stay frozen? Not blocking.

## Open suggestions (non-blocking review notes)
- P7-T46: custom-fields form number check accepts "Infinity"/"1e400"; zod refuses -> toast 422. Use Number.isFinite in validation/custom-fields.ts:29,:68 (backlog).
- P7-T46: applyPatch "no cast" doc: withoutUndefined still casts inside; scope the claim.
- P7-T46: parse() reports only the first zod issue; consider all issues if calendars does.
- P7-T46: add a setStatus() unknown-id test (404, no activity written).
- P7-T46: BACKLOG calendars tidy-up row could note withoutUndefined now lives in patch.ts.
- Pre-existing React Compiler "incompatible library" lint warnings: data-table.tsx:55, contact-form-sheet.tsx:183, opportunity-form-sheet.tsx:145.
- P7-T44: year-0000 message pad; freeSlots 9999-12-31 edge. P7-T43: hook test U4, `leave` rename, console.error spy.

## Blockers
- None.
