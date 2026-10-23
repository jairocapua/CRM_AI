# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T34 in review.

## Last change
- P7-T34: `api.calendars.update()` saves `calendarSettingsSchema`'s parsed output (allow-list), not the raw patch; id/slug/type/timestamps/unknown keys ignored at every depth.
- Schema now checks name (trimmed, non-blank), description, color (tag palette), teamMemberIds, isActive; null removes description/cap; non-object patch is a 422.
- +13 Vitest cases, all seen red on HEAD; check green (560), e2e 109 passed.

## Next up
- **Agent:** P7-T35 Validate expectedCloseAt in api.opportunities create/update.

## Waiting on you
- Review of P7-T34 (Autopilot reviews it).
- P7-H4: should an ended, already-Cancelled appointment stay frozen? Not blocking.

## Open suggestions (non-blocking review notes)
- availability.ts:145 `CALENDAR_COLORS` could reuse `TAG_COLORS` from `@/lib/constants`.
- calendars.ts:196 `id` in the merge is now redundant; drop or comment.
- teamMemberIds not checked against users; `book()` uses `[0]` as assignee. Follow-up when settings UI sends it (backlog candidate).
- description accepts '' / untrimmed; product call whether blank = null.
- Re-save test could use `toEqual` instead of `toMatchObject` (A4 covers it).

## Blockers
- None.
