# Backlog: unscheduled work

> Nothing here is scheduled. Scheduled work lives in `docs/phases/` and `docs/PROGRESS.md`.
> To schedule an item: add tasks with `node scripts/progress.mjs add <P#> "<title>" --scope "…" --acceptance "…"` (or write a phase file), and log the decision in `docs/memory/DECISIONS.md`.

| Item | Why it might be worth it | Notes |
|---|---|---|
| CSV import and export for contacts | The module a reviewer pokes first; the master plan had an import wizard | API already supports both (Phase 3) |
| Smart Lists UI (saved filter views + FilterBuilder) | Same `FilterGroup` engine as table filters and automation branches | API already supports it (Phase 3) |
| Opportunities list view | A sortable, paginated view; its search also covers `lostReason`, which the board's search cannot reach | `opportunities.list()` exists (Phase 4) |
| `sentByAutomation` backfill in the inbox | Demo moment: a run-log step opens the actual SMS | After P8; populate from the code registry, never the store |
| React view transitions | Smoother page and panel changes | `vercel-react-view-transitions` skill; overlaps `review-animations` |
| `impeccable` UI audit skill | Scores accessibility, performance, theming and responsiveness | Downloads and runs a binary on first use: ask the owner first (P10) |
| Next.js bundle optimizer skill | Bundle analysis beyond P10-T06's lazy seed | `vercel/next.js@next-bundle-optimizer` |
| CI job for `check` + `e2e` | Runs the gate on every push instead of only locally | From the P7-T10 review: on Linux, `e2e:install` needs `playwright install --with-deps chromium` (or a separate `install-deps` step) for Chromium's system libraries |
| Availability windows that run to midnight | A calendar open late loses its last slot: "24:00" is not a valid time, so a window stops at 23:59 and a 23:30 half-hour slot never fits | From the P7-T09 review; needs an "end of day" representation in `AvailabilityWindow` and the slot engine |
| Details-dialog focus when Escape beats the refetch | Escape after Cancel but before the refetch lands returns focus to the chip, which the refetch then moves behind "+N more": focus drops to `<body>` | From the P7-T14 review; re-check focus after the next appointments refetch, or close only once the mutation settles |
| 44px month chips on phones, `touch-action: manipulation` | 24px meets WCAG 2.2 AA (SC 2.5.8); 44px is the comfortable mobile size, and touch-action removes the double-tap-zoom delay | From the P7-T14 review; or open the day on tap below `sm` |
| Collapse inner whitespace in list search | applyQuery trims `q` but keeps inner spaces, so "ana  garcia" (two spaces) finds nothing | From the P7-T17 review; collapse runs of whitespace in the term (query-engine.ts) |
| Pending state in `ConfirmDialog` | A confirm that deletes through `api.*` needs a busy confirm button and the dialog kept open on an `ApiError`; today `onConfirm` is synchronous and closes at once | From the P7-T20 review; extend it when the first async caller arrives, not before |
