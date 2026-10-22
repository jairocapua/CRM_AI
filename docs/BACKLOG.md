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
