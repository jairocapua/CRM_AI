# Learnings

> **Append-only**, one line per lesson, newest at the bottom: `- YYYY-MM-DD [TASK-ID] lesson (why it matters)`.
> Read the last ~20 entries before starting a task. Never delete entries. If one becomes obsolete, strike it through (`~~…~~`) and add a note.
> CLAUDE.md "Non-obvious constraints" holds the standing rules; this file holds lessons that are narrower or newer. Entries tagged `[P3]`…`[P6]` were carried over from `docs/history/phases-0-6.md` when the tracker started.

- 2026-09-26 [P3] Base UI's `SelectValue` shows the raw value unless given a label-mapping render function; every status/source/owner/custom-field select needs one.
- 2026-09-26 [P4] Currency custom fields are stored in cents; a shared converter that writes them back raw turns $13,500 into $135. Convert at the form edge only.
- 2026-09-26 [P4] Controlling a combobox's `inputValue` blanks the selected item's label on edit; leave it uncontrolled unless searching needs it.
- 2026-09-26 [P4] Won deals live in the terminal stage; any "hide closed" filter must keep them or Closed Won reads `0 · $0`. Forecasts read live deals only (`isDeadDeal` in the API).
- 2026-09-26 [P4] Writing `stageId`/`status` through `update()` skips `move()` (position, `stageEnteredAt`) and `setStatus()` (`closedAt`, activity). Route stage and status changes through those two.
- 2026-09-26 [P5] Seed day-0 hours must count back from `REF_DATE`; a clock-hour draw on day 0 lands after the anchor ("seed writes the future"). Reuse the same draws so the faker stream is unchanged.
- 2026-09-26 [P5] Faker is seeded once and consumed in call order (`seed/index.ts`): append new seeders at the end of `buildDb()`; inserting or removing one shifts every later draw.
- 2026-09-26 [P6] Cut and bucket time windows on the same calendar: local midnight with UTC-date buckets drops today's bucket east of UTC. Assert `sum(series) === value`.
- 2026-09-26 [P6] Every analytics window ends at the demo "now"; without an upper bound future appointments count as held.
- 2026-09-26 [P6] A read must never call `nowIso()`: it advances the persisted clock high-water mark. Reads use `apiNow()`.
- 2026-09-26 [P6] Date inputs must read and write the local date; reading the UTC date moved Expected close back a day on every save east of UTC.
- 2026-09-26 [P6] Adding a `ResourceKey` means editing `cache.ts` twice: the union and the literal list in `invalidateAll()`. Missing the second makes reseed leave that screen stale.
- 2026-10-21 [bootstrap] `node --test scripts/` (a folder) fails on Node 22 here; use the glob `node --test "scripts/*.test.mjs"`.
- 2026-10-21 [bootstrap] `core.autocrlf=true` rewrites files with CRLF on branch switches, which fails Prettier's `format:check`; `.gitattributes` pins LF.
