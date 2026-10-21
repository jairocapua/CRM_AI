# Nimbus CRM — master build plan

> **Status (2026-10-21):** the plan approved on 2026-09-08, copied into the repo so
> agents can cite it. Two things have changed since, and they win where this file
> disagrees:
> - **Automation is developer-owned and read-only for staff** (2026-09-24). There is
>   no drag-and-drop builder; the design is `docs/design/automation.md`. Phase 8
>   rows, risks and checks below that describe a canvas editor are superseded.
> - **Build status lives in `docs/PROGRESS.md`** and the task breakdown in
>   `docs/phases/`. Phases 0–6 are done; their notes are in
>   `docs/history/phases-0-6.md`.

## Context

You want a **GoHighLevel-style CRM as a front-end-only working concept** — no database, no backend, no auth. The point is a convincing, clickable product you can demo and later grow a real backend behind.

The target directory `C:\Dev-Projects\Full Stack CRM` is completely empty. This is a greenfield build.

**Decisions you made:**
- **Scope:** Core CRM — Dashboard, Conversations, Contacts, Opportunities, Calendars, Settings. You also chose the interactive workflow canvas, which isn't in that six, so **Automation is added as a 7th module** rather than dropping the canvas.
- **Builders:** Workflow builder is a real drag-and-drop node canvas. No funnel/page builder.
- **Icons:** Lucide (see below).
- **Data:** Persisted CRUD behind an API seam — creating a contact or dragging a deal actually saves and survives refresh.

**Why Lucide** (you asked me to pick): it's shadcn/ui's default, so every generated component already imports it — any other library means either rewriting generated components or running `shadcn migrate icons`. 1,500+ icons, one consistent outline weight, excellent tree-shaking. Its one gap is brand logos, which Lucide deliberately dropped; a CRM needs Meta/Messenger/Instagram/WhatsApp/Stripe/Google marks for the channel UI. Fill that with `@icons-pack/react-simple-icons` (React components, unlike raw `simple-icons` which is bare path data), imported per-icon and centralized in one `brand-icon.tsx` so only ~6 marks ship.

**The one architectural idea that matters:** every component calls `await api.contacts.update(...)` — never the store directly. Behind that seam sits a Zustand + localStorage mock DB with simulated latency. When a real backend lands, you delete `src/lib/mock/`, rewrite the bodies of `src/lib/api/*.ts` to use `fetch()`, and **zero component files change**. A lint rule enforces the seam so it stays real instead of aspirational.

---

## Stack

Versions verified against the npm registry today (2026-09-08).

| Package | Version | Note |
|---|---|---|
| `next` | 16.3.4 | App Router, `src/`, Turbopack |
| `react` | 19.x | CNA default |
| Tailwind CSS | v4 | CSS-first config, **no** `tailwind.config.ts` |
| shadcn/ui | CLI 4.21 | style `new-york` (only style now), baseColor `zinc` |
| `lucide-react` | via shadcn | `"iconLibrary": "lucide"` |
| `@icons-pack/react-simple-icons` | 13.15.1 | brand marks only |
| `@tanstack/react-table` | **pin 8.21.3** | ⚠️ latest is 9.2.4 — see Risks |
| `@dnd-kit/core` | 6.3.1 | peer `react >=16.8.0` → React 19 clean |
| `@xyflow/react` | 12.11.6 | React Flow, workflow canvas |
| `zustand` | 5.0.15 | `useShallow` now mandatory for object selectors |
| `recharts` | 3.10.1 | arrives via shadcn `chart` |
| `@faker-js/faker` | 10.6.0 | **devDependency**, seed-only |
| `next-themes` | 0.4.6 | light/dark |

Package manager **npm** (matches 17 of your 18 projects). Mirror `C:\Dev-Projects\OpsPilot` for tooling — copy its `.prettierrc.json` and `eslint.config.mjs` shape, and its gate script:

```json
"check": "npm run format:check && npm run lint && npm run typecheck && npm run build"
```

---

## Setup

```bash
npx create-next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --turbopack --use-npm --no-react-compiler --yes
```

```bash
npx shadcn@latest init --template next --base-color zinc --css-variables --yes
```

`components.json` must have `"tailwind": { "config": "" }` (Tailwind v4 has no config file), `"iconLibrary": "lucide"`, and `"hooks": "@/lib/hooks"`.

```bash
npx shadcn@latest add --yes accordion alert alert-dialog aspect-ratio avatar badge breadcrumb button button-group calendar card chart checkbox collapsible combobox command context-menu date-picker dialog drawer dropdown-menu empty field hover-card input input-group item kbd label native-select pagination popover progress radio-group resizable scroll-area select separator sheet sidebar skeleton slider sonner spinner switch table tabs textarea toggle toggle-group tooltip typography bubble message message-scroller attachment marker
```

Deliberately excluded: **`data-table`** (hand-roll it so nothing drags in TanStack v9), **`toast`** (superseded by `sonner`), **`form`** (verified: no longer ships — react-hook-form now integrates via `Field*`, where `FieldError` takes RHF's errors array directly. Do not write `<FormField render={...} />`).

Run the app-shell block on the fresh scaffold **before** authoring any routes, then move its nav components into `src/components/layout/` and delete the demo page it writes:

```bash
npx shadcn@latest add --yes sidebar-07
```

```bash
npm i zustand @xyflow/react "@tanstack/react-table@8.21.3" @dnd-kit/core @dnd-kit/sortable @dnd-kit/modifiers @dnd-kit/utilities date-fns react-hook-form zod @hookform/resolvers next-themes @icons-pack/react-simple-icons nanoid
```

```bash
npm i -D @faker-js/faker prettier eslint-config-prettier
```

Add `"overrides": { "@tanstack/react-table": "8.21.3" }` to `package.json` and verify with `npm ls @tanstack/react-table`. Let `recharts`, `cmdk`, `sonner`, `react-day-picker`, `vaul`, `react-resizable-panels`, `class-variance-authority`, `clsx`, `tailwind-merge` arrive transitively from shadcn — installing them by hand fights shadcn's pins.

Add `.claude/launch.json` with an `npm run dev` config on port 3000 so the Browser pane can drive the app.

---

## Structure

```
src/
├─ app/
│  ├─ layout.tsx              # <html suppressHydrationWarning>, fonts, <Providers>
│  ├─ globals.css             # Tailwind v4 + shadcn tokens + status tokens + React Flow bridge
│  ├─ page.tsx                # redirect("/dashboard")
│  └─ (app)/
│     ├─ layout.tsx           # SidebarProvider + AppSidebar + header
│     ├─ dashboard/
│     ├─ conversations/       # layout.tsx = 3-pane resizable shell; [conversationId]/
│     ├─ contacts/            # page + import/ + [contactId]/{layout,page,tasks,opportunities,appointments}
│     ├─ opportunities/       # ?pipeline=&view=board|list
│     ├─ calendars/           # ?view=month|week|day&date= + availability/
│     ├─ automation/          # list + [workflowId]/ (React Flow canvas)
│     └─ settings/            # profile, business, team, custom-fields, pipelines, tags, demo-data
├─ components/
│  ├─ ui/                     # shadcn primitives — generated, don't hand-edit
│  ├─ providers/              # theme-provider, db-gate, toaster
│  ├─ layout/                 # app-sidebar, nav-*, location-switcher, command-palette, mode-toggle
│  ├─ common/                 # data-table/, filter-builder/, stat-card, channel-icon, brand-icon,
│  │                          # tag-badge, money, relative-time, empty-state, confirm-dialog
│  └─ modules/                # dashboard/ conversations/ contacts/ opportunities/
│                             # calendars/ automation/ settings/
├─ lib/
│  ├─ api/                    # ◀ THE SEAM — only this folder touches lib/mock
│  │  ├─ http.ts              # ApiError, simulate(), ListQuery, Page
│  │  ├─ cache.ts             # revision bus for invalidation
│  │  ├─ use-resource.ts      # useResource / useAction hooks
│  │  └─ contacts.ts conversations.ts opportunities.ts pipelines.ts appointments.ts
│  │     calendars.ts workflows.ts tasks.ts activities.ts tags.ts custom-fields.ts
│  │     users.ts smart-lists.ts templates.ts settings.ts analytics.ts
│  ├─ mock/                   # ◀ deleted wholesale when a real backend lands
│  │  ├─ db.ts                # vanilla zustand store + persist
│  │  ├─ storage.ts           # quota-safe storage adapter
│  │  ├─ query-engine.ts      # applyQuery: filter → search → sort → paginate
│  │  ├─ rng.ts               # seeded faker singleton
│  │  └─ seed/                # per-entity fixture generators, fixed run order
│  ├─ prefs/store.ts          # UI prefs (sidebar, table cols, latency sliders)
│  ├─ hooks/ nav.ts constants.ts format.ts utils.ts
└─ types/                     # common contact conversation opportunity calendar
                              # workflow activity settings filter
```

**Enforce the seam with lint.** In `eslint.config.mjs`, `no-restricted-imports` blocking `@/lib/mock/*`, with an override exempting `src/lib/api/**`. Add a second rule restricting `@faker-js/faker` to `src/lib/mock/seed/**` so dev-only seeding can't leak into the shipped bundle.

---

## Domain model (`src/types/`)

The backbone — build this before any UI. Entities: **User, Location, Tag, CustomField, MessageTemplate, Snippet, Contact, Note, Task, SmartList, Conversation, Message, Attachment, Pipeline, PipelineStage, Opportunity, Calendar, AvailabilityRule, Appointment, Workflow, WorkflowNode, WorkflowEdge, Activity.**

Five decisions that prevent later rewrites:

1. **`type ISODate = string`** (branded). **No `Date` anywhere in `src/types/`.** `JSON.stringify` turns a `Date` into a string and `JSON.parse` never turns it back — so a `Date` field works in dev and crashes after refresh, and TypeScript won't catch it. Convert at the edges with date-fns `parseISO`.
2. **`type Cents = number`** — money is integer cents, never float.
3. **Normalized state** — `Record<ID, Entity>` per collection, with `messages` as its own record and `Conversation.messageIds` holding order. Keeps `applyQuery` simple and updates O(1).
4. **One `FilterGroup` engine** — a recursive `{ combinator: "and" | "or", conditions: (FilterCondition | FilterGroup)[] }`. This single type powers the contacts table filters, saved Smart Lists, the opportunity list view, **and** workflow if/else branches. Build the evaluator once in `query-engine.ts`.
5. **`WorkflowNodeConfig` is a discriminated union keyed on `kind`** — one member per node type. The config side panel switches on it, so adding a node type is one union member plus one panel case.

`WorkflowNode` also carries explicit `width`/`height` — React Flow only renders nodes it has dimensions for (see Risks).

---

## The API seam

**`http.ts`** — `simulate<T>(work, opts)` sleeps for a jittered latency, optionally throws a seeded `ApiError`, then runs the work. `ListQuery { q, filter, sort, page, pageSize }` in, `Page<T> { rows, total, page, pageSize, pageCount }` out. Latency and failure rate are module-level tuning read at call time, so the Settings → Demo Data sliders take effect live. **This file's body is the entire backend migration.**

**`cache.ts`** — a 30-line revision bus: `invalidate("contacts", "analytics")` bumps a counter and notifies subscribers. React Query in miniature.

**`contacts.ts`** is the reference implementation every other resource copies:

```ts
export async function list(query: ListQuery = {}): Promise<Page<Contact>> {
  return simulate(() =>
    applyQuery(Object.values(db.getState().contacts), query, {
      searchFields: ["firstName", "lastName", "email", "phone", "companyName"],
      defaultSort: [{ field: "updatedAt", desc: true }],
    }),
  );
}

export async function update(id: ID, patch: Partial<Contact>): Promise<Contact> {
  const contact = await simulate(() => { /* read, merge, setState */ });
  invalidate("contacts", "activities");
  return contact;
}
```

**`use-resource.ts`** — `useResource(key, fetcher, deps)` subscribes to the cache bus via `useSyncExternalStore` (its `getServerSnapshot` returns a constant, so it's SSR-safe), fetches in an effect, and returns `{ data, error, isLoading, refetch }`. `useAction(fn)` wraps mutations with a pending flag. Later these swap for TanStack Query's `useQuery`/`useMutation` with no call-site changes.

Mutations that change related data invalidate broadly — deleting a contact invalidates `contacts`, `opportunities`, `conversations`, `analytics`.

---

## Kanban drag-and-drop

**`@dnd-kit/core` 6.3.1 + `@dnd-kit/sortable` 10.** Verified peer range is `react >=16.8.0` — no React 19 conflict, no `--legacy-peer-deps`. Rejected: `@dnd-kit/react` 0.5.0 (0.x, churning API), `react-beautiful-dnd` (unmaintained, StrictMode breakage), Pragmatic DnD (headless, more code for the same result).

Implementation notes that save debugging time:
- `PointerSensor` with `activationConstraint: { distance: 8 }` — **essential**, or clicking a card's overflow menu starts a drag.
- Render the dragged card in a `<DragOverlay>` so it isn't clipped by the column's `overflow-y-auto`. If it sticks after drop under StrictMode, set `dropAnimation={null}` — don't disable StrictMode.
- `onDragOver` does optimistic cross-column reordering; `onDragEnd` commits via `api.opportunities.move(...)` and rolls back on `ApiError`.

**React Flow does not use dnd-kit.** It owns pointer handling inside its canvas. Dragging a node from the palette onto the canvas uses React Flow's own `onDrop`/`onDragOver` with native `dataTransfer`. A `DndContext` layered over the React Flow pane produces fighting pointer handlers.

---

## Theming

**baseColor `zinc`** — a CRM is dense chrome that must not compete with stage colors, tag colors, channel colors, and chart series. `zinc` is the coolest true-neutral available and its dark mode is a proper near-black. Avoid the tinted neutrals (`mauve`/`olive`/`mist`/`taupe`); they fight the tag color scale.

Three additions to `globals.css` beyond what shadcn generates:
1. `@custom-variant dark (&:is(.dark *));` — **Tailwind v4 has no `darkMode: "class"` option.** Miss this and every `dark:` utility silently does nothing.
2. Semantic status tokens (`--status-open`, `--status-won`, `--status-lost`, `--status-stale`) so status colors are theme-aware rather than hardcoded hex.
3. A React Flow variable bridge — remap `--xy-background-color`, `--xy-edge-stroke-default`, `--xy-node-border-default`, `--xy-handle-background-color-default`, `--xy-controls-button-*`, `--xy-minimap-*` to your shadcn tokens once, instead of overriding `.react-flow__*` classes piecemeal. Also pass `colorMode={resolvedTheme}` to `<ReactFlow>`.

**No flash of wrong theme** needs all three of: `suppressHydrationWarning` on `<html>` (next-themes writes the class in a pre-hydration inline script, so a mismatch is guaranteed without it); `ThemeProvider` with `attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange`; and a `mode-toggle` that renders a fixed-size skeleton until hydrated rather than branching on `resolvedTheme` during SSR.

---

## Build phases

Each phase ends green on `npm run check` and with something clickable. Effort in relative points.

| # | Phase | Pts | Ends with |
|---|---|---|---|
| 0 | **Scaffold + toolchain** — CNA, shadcn, deps, TanStack pin, Prettier/ESLint + seam lint rules, `check` script, launch.json, `CLAUDE.md`/`PROGRESS.md` | 2 | `npm run check` green |
| 1 | **Design system + app shell** — tokens, theme toggle, collapsible sidebar, `lib/nav.ts` as single nav source, shared primitives (`StatCard`, `Money`, `ChannelIcon`, `TagBadge`, `EmptyState`), all 7 routes as stubs | 4 | Click every nav item, toggle theme, no flash |
| 2 | **Domain model + fixtures + API seam** ← *the backbone* — all types, `db.ts`, `query-engine.ts`, seeded faker, all `seed/*`, all `api/*`, `DbGate`, Demo Data settings page | 6 | Reseed works; refresh preserves state |
| 3 | **Contacts** — generic data-table shell (sort, faceted filters, search, column visibility, bulk actions, pagination), Smart Lists + FilterBuilder, contact detail with activity timeline, create/edit sheet, import wizard, CSV export | 7 | The module a reviewer pokes first |
| 4 | **Opportunities** — kanban board, stage rollups + weighted forecast, pipeline switcher, list view reusing Phase 3's table, win/lose flow, "N days in stage" | 5 | Drag a deal → contact timeline updates |
| 5 | **Conversations** — 3-pane resizable shell, filter tabs, message thread via shadcn chat primitives, contact panel, composer with channel switcher + snippets + templates, optimistic send with `queued→sending→sent→delivered` transitions and a retry path | 7 | Highest-wow module |
| 6 | **Dashboard** — `api.analytics` computing real rollups (never hardcoded), KPI cards with sparklines, revenue area chart with 7/30/90 toggle, pipeline funnel, lead-source donut, activity feed, today's tasks | 4 | Numbers reconcile against other modules |
| 7 | **Calendars** — month/week/day views, `?view=`/`?date=` in URL, calendar list with color toggles, booking modal with slots computed from availability minus bookings minus buffers, availability editor | 5 | Book → appears in all views + timeline |
| 8 | **Automation (read-only)** — developer-authored automations in `src/lib/automations/`, list grouped by folder, detail with step list + read-only React Flow diagram, run history, staff request form. See `docs/design/automation.md` (was a canvas editor, 7 pts; re-scoped 2026-09-24) | 9 | Hard-refresh on `/automation/[id]` works |
| 9 | **Settings** — profile, business, team + invite, custom fields manager, pipelines manager, tags with merge, demo data | 4 | Add a stage → board shows the column |
| 10 | **Polish** — ⌘K palette, skeletons + empty states audited, error boundaries + `ApiError` toasts, responsive pass (sidebar→Sheet, panes stack, board scroll-snaps), keyboard shortcuts, a11y, README | 5 | Ship-ready |

**≈56 pts total.** Phases 2, 3, 5, 8 are load-bearing. **Do not compress Phase 2** — every other module is a projection of it.

**Seed volume target:** 6 users, 24 tags, 14 custom fields, 240 contacts, 90 conversations (~1,100 messages, capped ~20/thread), 3 pipelines × 6 stages, 85 opportunities, 4 calendars, 120 appointments spanning −45/+30 days, 8 workflows, 60 tasks, ~900 activities. Keep serialized size under ~2.5 MB.

---

## Verification

**The gate:** `npm run check` at the end of every phase; don't tick `PROGRESS.md` until green. Enable `noUncheckedIndexedAccess: true` alongside `strict` — normalized `Record<ID, T>` lookups return `T | undefined`, and this flag is what forces the 404 path to be handled everywhere.

**Three cheap standing assertions:**
- The `no-restricted-imports` seam rule — a lint failure is the seam's only real defense.
- `npm ls @tanstack/react-table` prints `8.21.3`, not 9.x.
- `rg "new Date\(" src/types src/lib/mock` is empty outside `seed/` and `.toISOString()` call sites.

**Per-phase manual checks** (the ones that actually catch bugs):
- **P1** — theme survives a hard refresh with no flash; DevTools → Rendering → emulate `prefers-color-scheme: dark` boots dark.
- **P2** — set failure rate to 1.0, confirm every screen shows an error state; set latency to 2000ms, confirm every screen shows a skeleton. This doubles as the loading/error audit for all later phases.
- **P3** — delete a contact, confirm its deals leave the board; save a Smart List, reload, same rows.
- **P4** — drag with the keyboard (Tab → Space → arrows → Space); rollups match visible cards; refresh preserves order.
- **P5** — force a send failure and retry; resize panes and refresh (sizes persist).
- **P7** — book an appointment, confirm it appears in month/week/day, the contact timeline, and the dashboard, and that the slot disappears from availability.
- **P8** — **hard-refresh directly on `/automation/[id]`** — this is where the SSR bugs surface. Then refresh again and confirm the graph is identical including viewport.
- **P10** — 375px pass on all 7 modules; tab through with no focus traps.

**Browser-pane loop:** `preview_start` with the `crm` launch config, then `read_console_messages({ onlyErrors: true })` after each phase. **Zero console errors and zero hydration warnings is the bar** — hydration warnings are the specific failure mode this stack invites, and they're silent unless you look.

---

## Risks and gotchas

These are the ones that will actually cost time. Each is pre-empted above; this is the rationale.

**1. Zustand `persist` hydration mismatch — this will definitely bite.** Server renders empty state, client reads localStorage and renders 240 contacts, React throws `Hydration failed` and may silently discard the client tree. Fix needs all three parts: `skipHydration: true` in the persist options; a `DbGate` provider that calls `db.persist.rehydrate()` in an effect, seeds on first run, and renders an identical boot skeleton on both server and first client render; and **never calling `db.getState()` during render** — all reads go through `useResource`, which fetches in an effect.

**2. Zustand v5 removed `equalityFn`.** Default comparison is `Object.is`, so an object-returning selector makes a new reference every render → infinite loop → React unmounts the component with a max-update-depth error. Use atomic selectors, and `useShallow` for genuine multi-value reads.

**3. TanStack Table v9 is latest and will silently break you.** `npm i @tanstack/react-table` installs 9.2.4 today. v9 replaces `useReactTable` with `useTable({ features })`, moves row models into feature slots, and renames sorting/pinning/sizing APIs. Every shadcn example and most training data is v8, and shadcn hasn't migrated. Pin 8.21.3 + `overrides`, and **don't run `shadcn add data-table`** — it can pull the unpinned dep back in.

**4. React Flow + App Router — the `ssr: false` trap.** `next/dynamic` with `{ ssr: false }` **throws in a Server Component**. Put the dynamic import in a thin `"use client"` module (`workflow-canvas.client.tsx`) and import that from the page. Also: `import "@xyflow/react/dist/style.css"` inside the canvas component (not globals.css); the parent needs an explicit height — a missing `min-h-0` on any flex ancestor silently collapses the canvas to 0px; wrap in `<ReactFlowProvider>` since the config panel will call `useReactFlow()` from outside `<ReactFlow>`; and **don't wire React Flow's node state into the persisted store** — keep `useNodesState` local and save via debounced `api.workflows.update`, or every drag frame serializes the whole DB to localStorage 60×/sec.

**5. Dates through `persist`.** Covered in the domain model — `ISODate` strings only, enforced by the grep gate.

**6. localStorage quota (~5MB).** `partialize` out derived data, cap seeded messages, debounce persist writes (~250ms trailing) **and** keep drag state local until drop, and wrap the storage adapter so `QuotaExceededError` degrades to in-memory + a Sonner warning instead of a white screen.

**7. Faker determinism needs two calls, not one.** `faker.seed(...)` alone still leaves `date.recent()`/`.soon()` relative to *now*, so "3 days in stage" becomes "94 days in stage" next quarter. Also set `faker.setDefaultRefDate(REF_DATE)` and anchor the world to that constant. Seed modules must run in a fixed order — changing the order shifts every downstream value.

**8. Tailwind v4 differences that look like bugs.** No config file. `@import "tailwindcss"` replaces the `@tailwind` directives. Dark mode needs `@custom-variant`. `tailwindcss-animate` → `tw-animate-css`. Renamed: `shadow-sm`→`shadow-xs`, `shadow`→`shadow-sm`, `rounded-sm`→`rounded-xs`, `outline-none`→`outline-hidden`, `ring` is now 1px. **Default border color changed from `gray-200` to `currentColor`** — a bare `border` paints the text color; shadcn's `@layer base { * { @apply border-border; } }` fixes it, don't delete that rule. `@apply` outside the entry CSS needs `@reference "../app/globals.css";`.

**9. Smaller ones.** `params` and `searchParams` are Promises in Next 15+ — `await` them. `ChartContainer` needs `min-h-*` or `aspect-*` or Recharts measures 0 and renders nothing. `useTheme()` isn't available in server components, so React Flow's `colorMode` must be read client-side. The conversations route-group `layout.tsx` holds the resizable shell so switching threads doesn't remount the list or lose scroll — it must be a client component, so keep it thin.

---

## Critical files

- `src/lib/mock/db.ts` — the persisted store; `skipHydration`, `SEED_VERSION`, quota-safe adapter. Risks 1, 6 are all decided here.
- `src/lib/api/http.ts` — `simulate()`, `ApiError`, `ListQuery`/`Page`. The one file rewritten when a real backend arrives; get its contract right in Phase 2 or every module inherits the wrong shape.
- `src/types/*.ts` — the domain model. Everything else is a projection of it.
- `src/lib/mock/query-engine.ts` — `applyQuery` + `FilterGroup` evaluation. One engine powers the contacts table, smart lists, opportunity list view, and workflow if/else.
- `src/app/globals.css` — Tailwind v4 config, shadcn tokens, status tokens, React Flow bridge.

Worth reading before Phase 0, in your existing projects: `C:\Dev-Projects\OpsPilot\package.json` (the `check` script and pinning style), its `eslint.config.mjs`, `.prettierrc.json`, and `CLAUDE.md` (the phase-workflow doc format to mirror in `PROGRESS.md`).
