# Handoff: current state

> Rewritten by the `recorder` agent at the end of every build-phase run. Humans and agents: read this first.

## Now
- **Phase:** P7 Calendars (`active`, gate failed on 2026-10-24; fix tasks in progress)
- **Branch:** `phase/p7-calendars`
- **Status:** P7-T62 **blocked** after 2 fix rounds. Code changes are uncommitted in the tree for inspection.

## Last change
- P7-T62 (uncommitted): create() now takes status, closedAt and the won/lost entry from its stage via `enterStage`/`stageEntryActivity`; doc comment updated; tests in opportunities.test.ts, deal-form e2e and form sheet touched.
- The only unmet item: `docs/memory/DECISIONS.md:334` still holds the P7-T59 line "create() still stores status 'open'...", now contradicting the code. No P7-T62 entry.

## Next up
- Fix: append under "During the build" a line like `- 2026-10-25 [P7-T62] Supersedes [P7-T59] "create() still stores status open...": create() now derives status, closedAt and the won/lost entry from its stage via enterStage/stageEntryActivity, shared with move().` Then say "run task P7-T62".
- Then P7-T63, then rerun the P7 gate.

## Waiting on you (owner)
- Add the DECISIONS line above (or tell Autopilot to), then "run task P7-T62".
- Before merging P7: open `/calendars?view=week&date=2026-09-08` in your timezone and check times, zone label, now line, overlaps.

## Open suggestions (non-blocking)
- P7-T61: `moveDropsReason` untested and logs a second Lost entry (P7-T63); `enterStage` keeps a stale `lostReason` on an open stage.
- P7-T60: statusBadge() locator is fragile; pickOpenSalesDeal should exclude isLost stages.
- P7-T59: test create() with a missing stageId; map a `pipelineId` 422 onto the Pipeline field.

## Blockers
- P7-T62: DECISIONS.md P7-T59 line not superseded (see Next up).
