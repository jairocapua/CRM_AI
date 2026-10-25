# Build progress

> **Source of truth for build status.** Agents change it only through `node scripts/progress.mjs` (`set` / `phase` / `add` / `sync`).
> Humans may edit it by hand: keep the table format, then run `node scripts/progress.mjs --check`.
>
> **Task status:** `todo` → `in-progress` → `review` (agent finished; awaiting your approval) → `done` · `blocked` (needs you; see Notes)
> **Phase status:** `todo` → `active` → `gate` (all tasks done; exit criteria being verified) → `done` (gate passed; merge the phase branch into `master`)
> **Depends:** task IDs, or a phase ID (meaning that phase's gate has passed). Task definitions live in `docs/phases/`.
> Phases 0–6 were built before this tracker existed; their notes are in `docs/history/phases-0-6.md`.

<!-- summary:start -->
**Overall:** 76/90 tasks done (84%) · **Current phase:** P8 · **Next agent task:** — · **Awaiting review:** none · **Blocked:** none · **Waiting on you:** none
<!-- summary:end -->

## P7 — Calendars
Status: done · Progress: 68/68 · Points: 7 (5 for Calendars + 2 for the test harness) · Branch: phase/p7-calendars · File: docs/phases/P7-calendars.md

| ID | Task | Owner | Status | Depends | Commit | Updated | Notes |
|---|---|---|---|---|---|---|---|
| P7-T01 | Vitest harness and first API tests | agent | done | — | 8a2e34d | 2026-10-21 | Vitest 4.1 harness + 77 API/mock tests; reconcile test fails 12-13 on Phase 6 revert; check green |
| P7-T02 | Playwright e2e harness | agent | done | — | d359deb | 2026-10-21 | Playwright e2e harness: next build+start on 3100, boot/console fixture, 15 tests green |
| P7-T03 | Calendar time model and slot engine (step 0) | agent | done | P7-T01 | 4fa791c | 2026-10-21 | Rework P7-H2: buffers symmetric (gap >= max(before,after)), order-independent; 1 seed appt moved; 172 tests green |
| P7-T04 | Calendars page: URL state, toolbar and calendar list | agent | done | P7-T02 | 3f81f6e | 2026-10-21 | /calendars URL state (view/date), toolbar, calendar list toggles, placeholder views; check+e2e green |
| P7-T05 | Month view | agent | done | P7-T03, P7-T04 | 5ed7061 | 2026-10-21 | Month grid with +N more, keeps old grid while loading, historyMethod none/replace/push; e2e 32/32 |
| P7-T06 | Week and day views | agent | done | P7-T03, P7-T04 | c949dab | 2026-10-21 | Approved in review: week/day time grid, packIntervals, now line, scroll-to-first, history replace; e2e 40/40 |
| P7-T07 | Appointment details, status and cancel | agent | done | P7-T05 | 8c3df91 | 2026-10-22 | Details dialog (contact link, two zones, location, status Select), cancel with Undo, live-first ordering; e2e green |
| P7-T08 | Booking dialog and the contact Appointments tab | agent | done | P7-T03, P7-T07 | f67ea9c | 2026-10-22 | Booking dialog (calendar>contact>day>slot, API error refetch) + contact Appointments tab; check and e2e green |
| P7-T09 | Availability editor | agent | done | P7-T03, P7-T04 | ab2fe4b | 2026-10-22 | Availability editor + zod schema (overlap/reversed), 15-min side-by-side packing fix, e2e slot removal; all green |
| P7-H1 | Update CLAUDE.md Commands for the new check pipeline | human | done | — |  | 2026-10-21 | Done by Claude in review: CLAUDE.md Commands now lists test and test:scripts |
| P7-T10 | Harness polish: browser install and smoke content checks | agent | done | — | cc010f3 | 2026-10-22 | e2e:install script; smoke tests assert each route's h1 (proven red on blank page); CLAUDE.md lists e2e commands |
| P7-T11 | Guard bookings: inactive calendars, unknown contacts, bad windows | agent | done | — | 7563e09 | 2026-10-23 | API guards: inactive calendar 409, unknown contact 404, strict startAt 422, update() validates settings 422; slot grid dedupes |
| P7-H2 | Decide symmetric buffer semantics | human | done | — |  | 2026-10-21 | Decided in review: symmetric buffers (order-independent); fixed in P7-T03 rework |
| P7-T12 | Merge duplicate day validators into a shared non-mock module | agent | done | — | 476ce90 | 2026-10-23 | One shared YYYY-MM-DD rule in src/lib/dates.ts; booking form, nav, slots and API agree; check + e2e green |
| P7-T13 | Calendars: error state and retry when appointments fail to load | agent | done | — | 7c57893 | 2026-10-23 | LoadError alert + Retry for calendars appointments, contact Appointments tab, availability list; 4 e2e specs |
| P7-T14 | Larger tap target for month chips on mobile | agent | done | — | 0ddd360 | 2026-10-23 | 24px month chip and +N more tap targets below sm; details close refocuses opener, restored chip or +N more |
| P7-T15 | Show end date when an appointment crosses midnight | agent | done | — | f1a32a6 | 2026-10-23 | Crossing-midnight end date in zonedTimes; focus fallback moved to appointment-focus.ts; phone chip gap-1. check + e2e 57 green |
| P7-H3 | Decide: can past appointments be cancelled or re-statused? | human | done | — |  | 2026-10-23 | Owner: past = Showed/No-show only; Cancel/Confirmed future only |
| P7-T16 | Check Base UI Select hidden input in the a11y tree | agent | done | — | a983ac9 | 2026-10-23 | Not a bug: Chromium ignores Base UI Select hidden inputs (ariaHiddenElement). New e2e/select-a11y.spec.ts; CLAUDE.md note. |
| P7-T17 | ContactPicker search: full-name match and no client re-filter | agent | done | — | 3a9c451 | 2026-10-23 | Full-name contact search via function search field; picker filter={null}, selected pinned only on empty/own-name term |
| P7-T18 | Booking dialog: slot-load error with Retry, ids from formId, fresh form per open | agent | done | — | af613bf | 2026-10-23 | LoadError+Retry for open times, useId-based ids, form keyed per open, 2-col phone grid; 4 new e2e tests |
| P7-T19 | Link-as-button semantics in modules | agent | done | — | db3906a | 2026-10-23 | 6 module links now <Link className={cn(buttonVariants())}>: no role=button, outline border restored; e2e/link-buttons.spec.ts (5) |
| P7-T20 | Availability editor: unsaved-changes guard and empty open day | agent | done | — | b6c460a | 2026-10-23 | Unsaved-changes guard on calendar select + Back link (ConfirmDialog); last window removal turns day off. e2e 5 new, 87/87 |
| P7-T21 | Raise timeout on long calendars-booking e2e flows | agent | done | — | 431dcd3 | 2026-10-23 | 60s suite timeout; test.slow() on 2 long booking flows; failReads/restoreReads docs; Kolkata find merged. e2e 87/87 |
| P7-T22 | Calendar update: reject explicit undefined keys and use a plain-language 422 message | agent | done | — | 6dcaa7a | 2026-10-23 | update() ignores undefined keys, null clears daily cap, 422 reads '<label>: <rule>' with path in ApiError.field |
| P7-T23 | Deal form Expected close uses shared isCalendarDay | agent | done | — | 01e71ed | 2026-10-23 | Deal form Expected close uses isCalendarDay/parseCalendarDay; schema refuses bad days with 'Enter a valid date.'; unit+e2e red-first. |
| P7-T24 | Calendars sidebar: error state and Retry when calendars.list fails | agent | done | — | 92adfbd | 2026-10-23 | Calendar column shows LoadError + Retry when calendars.list fails; view still draws; e2e 90/90 |
| P7-T25 | Contact detail: error state instead of endless skeleton on non-404 load failure | agent | done | — | 939c322 | 2026-10-23 | Contact page: LoadError + Retry on non-404 load failure; new by-key contact fault helpers; 2 e2e tests, 4 mutants red. |
| P7-T26 | Past appointments: only Showed/No-show; Cancel and Confirmed for future only (P7-H3) | agent | done | — | df315b9 | 2026-10-23 | Ended appts: only Showed/No Show; API 422 PAST_APPOINTMENT, dialog disables Confirmed/Cancelled and hides Cancel |
| P7-T27 | e2e: longer toHaveURL timeout for cross-route navigation | agent | done | — | 71b5627 | 2026-10-23 | Shared 15s NAVIGATION in e2e/fixtures.ts on every first cross-route wait; no worker cap; comments fixed. Gate + e2e green. |
| P7-T28 | Name the unlabelled Select triggers | agent | done | — | 354e04b | 2026-10-23 | Status/Pipeline/Assign owner Select labels, TagPicker named Tags via htmlFor; select-a11y spec pins names (12 tests) |
| P7-T29 | Fix ContactPicker selection race after a pick | agent | done | — | c39d93e | 2026-10-23 | Picked contact held locally via pickerValue(); race e2e on 3 surfaces with frozen timers; M1 red 60/60 |
| P7-T30 | Shared chooseContact e2e helper | agent | done | — | bed1313 | 2026-10-23 | Shared chooseContact/pauseTimers/uniquelyNamedContact in calendar-helpers; review notes folded; NAVIGATION frozen; e2e 103 |
| P7-T31 | LinkButton helper and nativeButton lint rule | agent | done | — | 263a3ac | 2026-10-23 | LinkButton in ui/button.tsx, 6 links migrated, PaginationLink plain <a>, lint bans nativeButton={false}/bare buttonVariants |
| P7-T32 | Link-button icon padding and link-buttons spec scoping | agent | done | P7-T31 | 8d186f2 | 2026-10-23 | data-icon on View contact/Open board; spec pins padding, scoped header lookup; lint trigger clause; inert length asserts removed |
| P7-T33 | App-wide unsaved-changes guard (sidebar links, reload, tab close) | agent | done | — | ab8154c | 2026-10-23 | UnsavedChangesProvider guards sidebar/user-menu/Back links + beforeunload; e2e T-A..T-E, mutants seen red |
| P7-T34 | Calendar update: validate or allow-list keys outside the settings schema | agent | done | — | 1278157 | 2026-10-23 | update() saves parsed allow-list; name/colour/team/active/description checked; null patch 422; +13 tests |
| P7-T35 | Validate expectedCloseAt in api.opportunities create/update | agent | done | — | 9a47e88 | 2026-10-23 | parseInstant shared in dates.ts; deal API 422s bad expectedCloseAt, stores UTC; +79 tests, +1 e2e |
| P7-T36 | Booking dialog: error state and Retry when calendars.list fails | agent | done | — | 3e7c603 | 2026-10-24 | Calendar field LoadError + busy Retry, disabled select; e2e red on 3 mutants; P7-T30 e2e cleanups |
| P7-T37 | Contacts list: error state instead of false 'No contacts found' on list failure | agent | done | — | 128a5a3 | 2026-10-24 | Contacts list shows LoadError+Retry on failed load/page change; new loadErrorOf helper replaces inline guards |
| P7-T38 | useResource unit test: failed refetch keeps data for same query | agent | done | — | b5b8fe1 | 2026-10-24 | useResource hook test (happy-dom): failed refetch keeps data, new failing query drops it; 4 mutants red |
| P7-H4 | Decide: should an ended, already-Cancelled appointment stay frozen? | human | done | — |  | 2026-10-24 | Owner: allow changes (not frozen); see DECISIONS 2026-10-24 [P7-H4] |
| P7-T39 | Name the remaining TagPickers and the contacts search box | agent | done | — | 1f06927 | 2026-10-24 | TagPicker aria-label prop; toolbar/bulk/deal TagPickers + contacts search named; 3 new e2e; P7-T28 doc fixes |
| P7-T40 | ContactPicker: hold fetched contact for outside-set values | agent | done | — | 6b06212 | 2026-10-24 | useHeldValue hook holds first fetched copy per id; 4 hook tests (mutant-checked); shared e2e pick helpers; check+e2e green |
| P7-T41 | Document the Base UI trigger exception in LinkButton JSDoc | agent | done | — | 3f4f697 | 2026-10-24 | LinkButton JSDoc names both nativeButton exceptions; lint-message clauses asserted once each; spec padding cause |
| P7-T42 | Team settings link: stop 404 prefetch until P9 | agent | done | — | f1e0eb7 | 2026-10-24 | Placeholder /settings/team page; editor e2e prefetch excuse removed; smoke test proves menu link opens cleanly |
| P7-T43 | Unsaved-changes guard: stable guardLeave, menu focus return, mobile Sheet | agent | done | — | bc9db75 | 2026-10-24 | Stable guardLeave (ref), onLeave/returnFocus options, phone Sheet closes on leave; 4 hook tests + 2 phone e2e |
| P7-T44 | book(): check the start's day in the calendar zone (422 INVALID_START, not RangeError) | agent | done | — | dd2b77d | 2026-10-24 | book() checks start day in calendar zone: 422 INVALID_START (new msg) not RangeError; string-date check removed; +10 tests |
| P7-T45 | Opportunities: null removes optional fields (expectedCloseAt, ownerId, lostReason) | agent | done | — | e6bab1a | 2026-10-24 | null removes expectedCloseAt/ownerId/lostReason on create/update; OpportunityPatch type; 9 new tests, mutants red |
| P7-T46 | Opportunities update(): allow-list the patch, 422 for non-object patch | agent | done | — | 3526e51 | 2026-10-24 | create/update allow-list via zod; 422 for bad types and non-object input; setStatus private writer; Vitest 676->730 |
| P7-T47 | Contacts: surface tags.list load failure (tag badges/filter silently empty) | agent | done | — | f6993d9 | 2026-10-24 | Contacts: tags load error + Retry (invalidate tags); TagPicker shows 'Could not load tags.'; 3 e2e tests |
| P7-T48 | Bump next to patch npm audit critical findings | agent | done | — | 126c13b | 2026-10-24 | next/eslint-config-next 16.4.3 + npm audit fix: 0 vulns; pins held; no src changes; gate + e2e green |
| P7-T49 | Shared userMenu(page) e2e helper | agent | done | — | a686dd7 | 2026-10-24 | userMenu(page) helper in e2e/fixtures.ts; specs import it; self-test in fixture.spec.ts; e2e 123 green |
| P7-T50 | Custom number fields: refuse non-finite values inline (Infinity, 1e400) | agent | done | — | a92f13a | 2026-10-24 | Number fields require finite values, currency checks finite cents; setStatus 404 test; applyPatch JSDoc fixed |
| P7-T51 | Contact detail + opportunity board/detail: surface tags.list load failure | agent | done | — | f2f0c34 | 2026-10-24 | Tags load errors with Retry on contacts table, contact panel, board, deal detail; TagPicker Retry; 5 new e2e |
| P7-T52 | Custom-field inputs set aria-invalid when invalid | agent | done | — | 662677d | 2026-10-24 | aria-invalid on all custom-field controls from one flag; e2e asserts true when invalid, absent when valid |
| P7-T53 | TagPicker: keyboard path to retry a failed tags read | agent | done | — | 9e38443 | 2026-10-24 | TagPicker shows inline LoadError with keyboard Retry; focus returns to input on success; toolbar opts out |
| P7-T54 | Custom fields: e2e for aria-invalid on select, multiselect, textarea, date | agent | done | — | 9aca3a8 | 2026-10-24 | e2e: required select/multiselect/textarea/date custom fields set aria-invalid when empty, none when filled |
| P7-T55 | TagPicker: tighten inline Retry focus-restore flag | agent | done | — | 082113c | 2026-10-24 | Retry focus flag set only in onRetry; any blur leaving wrapper clears it; e2e proves no focus steal |
| P7-T56 | Reword setStatus() 409 for an ended, cancelled appointment | agent | done | — | f6f8944 | 2026-10-24 | 409 for ended, cancelled, rebooked appt now says it cannot be marked Showed/No Show; Vitest + e2e red-capable |
| P7-T57 | Gate fix: smoke-test /settings/demo-data | agent | done | — | ad1f798 | 2026-10-24 | Smoke test for /settings/demo-data: title, no skeleton, h1; npm run e2e 140 passed |
| P7-T58 | Gate fix: update() pipelineId leaves orphan stageId | agent | done | — | 797a438 | 2026-10-24 | update() refuses a pipeline change without a matching stageId (422); valid move is one write + timeline entry |
| P7-T59 | Gate fix: create() accepts stageId outside its pipeline | agent | done | — | 22e9d60 | 2026-10-24 | create() refuses unknown pipelineId and stageId outside its pipeline (422); shared stageOf() helper with update() |
| P7-T60 | E2E: change a deal's pipeline in the Edit deal sheet | agent | done | — | 9e1fd90 | 2026-10-24 | E2E: Edit deal moves pipeline+stage with Lost status; won-stage defaults Won, explicit Open wins |
| P7-T61 | Gate fix: update() pipeline move into a won/lost stage derives status | agent | done | P7-T58 | 81ab530 | 2026-10-25 | update() pipeline move derives status/closedAt/activity from target stage via helpers shared with move() |
| P7-T62 | Gate fix: create() into a won/lost stage derives status | agent | done | P7-T61 | ff13a39 | 2026-10-25 | Autopilot: committed by reviewer after workflow blocked on DECISIONS.md line |
| P7-T63 | Deal form keeps a changed lost reason | agent | done | — | e28a474 | 2026-10-25 | Form sends lostReason in its one create()/update(); moveDropsReason gone; enterStage drops reason outside lost stages |
| P7-T64 | Lost entry text and same-stage move status | agent | done | — | 6933a1b | 2026-10-25 | Same-stage move() is a pure reorder (keeps status/closedAt/lostReason); lost-stage entry appends the reason |

## P8 — Automation
Status: active · Progress: 8/8 · Points: 9 (was 8a 5 + 8b 4) · Branch: phase/p8-automation · File: docs/phases/P8-automation.md

| ID | Task | Owner | Status | Depends | Commit | Updated | Notes |
|---|---|---|---|---|---|---|---|
| P8-T01 | Authored types and the automation registry | agent | done | P7 | fa0ff5e | 2026-10-25 | Verifier pass (check green, 824 Vitest; smoke e2e 10/10); reviewer approve, no must-fix. Users gained slug; 2 backlog rows. |
| P8-T02 | Deterministic layout | agent | done | P8-T01 | 11a7706 | 2026-10-25 | Verifier pass (check green, 858 Vitest; smoke e2e 10/10); reviewer approve, no must-fix. Branch-id uniqueness -> BACKLOG, fold into P8-T05. |
| P8-T03 | Automation list page | agent | done | P8-T01 | 01dad51 | 2026-10-25 | Review round 1: 2 must-fixes (404 request link -> placeholder page; one-alert Retry re-reads users/tags), fixed with red-proved e2e. Re-verify: check green (884 Vitest), 41 e2e passed. |
| P8-T04 | Detail page with the step list | agent | done | P8-T02, P8-T03 | 6456413 | 2026-10-25 | Review round 1: missing error-path e2e (added, red-proved) + unclamped summaries, nested-fork test, exhaustive stepSummary. Re-verify: check green (922 Vitest), 23 e2e passed. |
| P8-T05 | Read-only diagram | agent | done | P8-T04 | 6d49c64 | 2026-10-25 | Deep review round 1: disableKeyboardA11y must-fix (red-proved e2e), memoised names, phone-never-downloads check, skeleton height. Re-verify: check green (937 Vitest), 29 e2e, diagram spec x3 stable. |
| P8-T06 | Run history data | agent | done | P8-T01 | 97e70cd | 2026-10-25 | Run history data: types, workflowRuns table + seeder (97 runs), cascade, cache key, 3 integrity lines, listRuns; fake stats deleted. check green (962), 38 e2e. |
| P8-T07 | Run history UI | agent | done | P8-T04, P8-T06 | e8b8c0e | 2026-10-25 | Run history table + run sheet on /automation/[id]; contactName joined at read; one fix round (sort flip tested). check green (987), 46 e2e. |
| P8-T08 | Automation requests | agent | done | P8-T03 | f5bfd5f | 2026-10-25 | Automation requests: type, table, seeder (6), api.automationRequests, integrity line, /automation/requests list + form. check green (1030), 48 e2e. |

## P9 — Settings
Status: todo · Progress: 0/7 · Points: 4 · Branch: phase/p9-settings · File: docs/phases/P9-settings.md

| ID | Task | Owner | Status | Depends | Commit | Updated | Notes |
|---|---|---|---|---|---|---|---|
| P9-T01 | Settings API fixes (step 0) | agent | todo | P8 |  |  |  |
| P9-T02 | Settings shell, profile and business | agent | todo | P8 |  |  |  |
| P9-T03 | Team and invites | agent | todo | P9-T01, P9-T02 |  |  |  |
| P9-T04 | Custom fields manager | agent | todo | P9-T01, P9-T02 |  |  |  |
| P9-T05 | Pipelines and stages manager | agent | todo | P9-T01, P9-T02 |  |  |  |
| P9-T06 | Tags manager with merge | agent | todo | P9-T02 |  |  |  |
| P9-T07 | e2e: create required custom fields via settings UI | agent | todo | — |  |  |  |

## P10 — Polish
Status: todo · Progress: 0/7 · Points: 5 · Branch: phase/p10-polish · File: docs/phases/P10-polish.md

| ID | Task | Owner | Status | Depends | Commit | Updated | Notes |
|---|---|---|---|---|---|---|---|
| P10-T01 | Command palette (⌘K) | agent | todo | P9 |  |  |  |
| P10-T02 | Loading and error audit | agent | todo | P9 |  |  |  |
| P10-T03 | Responsive pass at 375px | agent | todo | P9 |  |  |  |
| P10-T04 | Keyboard and accessibility | agent | todo | P9 |  |  |  |
| P10-T05 | Cleanup from the Phase 5 review | agent | todo | P9 |  |  |  |
| P10-T06 | Load the seed lazily | agent | todo | P9 |  |  |  |
| P10-T07 | README and demo walkthrough | agent | todo | P10-T01, P10-T02, P10-T03, P10-T04 |  |  |  |
