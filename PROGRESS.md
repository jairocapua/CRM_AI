# Progress

Phases come from the approved build plan. A phase is done only when
`npm run check` is green and its manual checks pass.

- [x] **Phase 0 — Scaffold + toolchain** (2 pts)
      Next 16.3.4 / React 19 / Tailwind v4 / TS strict + `noUncheckedIndexedAccess`.
      shadcn `base-nova` + 55 components, lucide icons. TanStack Table pinned to
      8.21.3 with `overrides`. Prettier + ESLint (incl. API-seam import rules),
      `check` script, `.claude/launch.json`.
      Rewrote shadcn's `use-mobile` onto `useSyncExternalStore` — the generated
      version calls setState in an effect, which Next 16 lints as an error and
      which is not SSR-safe.

- [x] **Phase 1 — Design system + app shell** (4 pts)
      Validated 8-hue categorical palette replacing the preset's greyscale
      charts, plus brand/status tokens and the React Flow variable bridge.
      Theme provider with no flash of wrong theme. Collapsible icon sidebar,
      sub-account switcher, nav user, sticky header. Shared primitives
      (`PageHeader`, `EmptyState`, `Money`). All 7 routes render.
      Full domain model in `src/types/` landed early — everything depends on it.

- [x] **Phase 2 — Fixtures + API seam** (6 pts)
      Normalised zustand store with `skipHydration`, quota-safe storage and
      debounced persist writes. `applyQuery` filter/search/sort/paginate engine
      shared by tables, smart lists and workflow if/else. Deterministic faker
      seed anchored to a fixed reference date. 15 API modules behind
      `simulate()`, a revision-bus cache, and `useResource`/`useAction`.
      DbGate + `api.settings.bootstrap()` for hydration-safe startup.
      Verified: 240 contacts / 880 messages / 882 activities / 970 KB,
      referential integrity clean, and an edit plus a deletion both survived a
      reload (239 contacts, no spurious reseed).
- [x] **Phase 3 — Contacts** (7 pts)
      Server-paginated/sorted/filtered table (first `@tanstack/react-table`
      consumer, a generic `DataTable` chrome layer over the pinned 8.21.3 API)
      with search, status and tag filters, row selection and a bulk-action bar
      (tag, owner, delete). First real RHF + zod form in the app, with a
      dynamic schema built from live `CustomField` definitions and an inline
      "create tag" combobox. First dynamic route (`/contacts/[id]`) — a
      client-fetched detail view (fields, tags, custom fields, notes, tasks,
      activity timeline, a read-only opportunities teaser) since the mock DB
      only exists client-side, so 404s are handled as loaded state rather than
      via `notFound()`. CSV import/export and Smart Lists deliberately
      deferred (API already supports both). Caught and fixed a real bug in
      testing: Base UI's `SelectValue` shows the raw value unless given a
      label-mapping render function — every status/source/owner/custom-field
      select needed one.
- [x] **Phase 4 — Opportunities** (5 pts)
      Kanban board on `@dnd-kit` (first consumer) with per-stage rollups —
      count, total and the probability-weighted forecast from the existing
      `rollupByStage`. Pipeline switcher, debounced search, show-closed toggle.
      Drag commits through `api.opportunities.move`, which documents an
      optimistic-reorder contract: the board reorders locally first, tagging
      the override with the server array it came from, so a refetch drops it
      without an effect resetting state. The local splice deliberately mirrors
      the API's own (destination column with the dragged deal removed) or the
      two orderings disagree. Deal detail route, RHF + zod form sharing the
      contact form's dynamic custom-field machinery, and delete.
      Extracted along the way: `buildCustomFieldsSchema`/`toCustomFieldsPatch`/
      `fromCustomFieldsValue` into `validation/custom-fields.ts` and
      `CustomFieldsSection` into `components/common/`, now generic over the
      form's values — they were never contact-specific.
      Three real bugs caught in testing: currency custom fields were seeded as
      cents but written back raw by the shared converter (a deal would show
      $135 after an edit that meant $13,500); the detail page's relative times
      used the wall clock and disagreed with the board's demo-clock "Nd in
      stage"; and controlling the contact combobox's `inputValue` blanked the
      selected contact's name when editing.
      A two-axis review then found four more, all fixed and re-verified:
      - **Closed Won was permanently empty.** The toggle hid every non-open
        deal, but won deals *live* in the terminal stage, so the column the
        funnel aims at always read `0 · $0`. It is now "Show lost": won deals
        always show; only lost/abandoned ones (which sit mid-funnel) hide.
      - **The forecast counted dead deals** once they were shown. Rollups now
        read live deals only, whatever is displayed.
      - **Dragging a lost deal resurrected it.** `move()` derives status from
        the destination stage and no seeded stage is `isLost`, so every drop
        read "open". Dead deals are now pinned (`useSortable({ disabled })`).
      - **The form bypassed the API's bookkeeping.** Writing `stageId`/`status`
        through `update()` skipped `move()` (position, `stageEnteredAt`) and
        `setStatus()` (`closedAt`, the won/lost activity). Now routed through
        both, and `setStatus()` finally has a caller.
      Deliberately **not** built, and recorded below rather than cut silently:
      pipeline and stage management, and a sortable list view over
      `opportunities.list()`. The seeded workspace ships three pipelines.
- [x] **Phase 5 — Conversations** (7 pts)
      Three-pane inbox (list | thread | contact details) in the route's layout,
      so switching threads swaps only the middle pane. Pane sizes persist via
      `react-resizable-panels` v4 `useDefaultLayout` (safe to read
      localStorage in render because `DbGate` never server-renders the app);
      below `md` the route picks the single visible pane and details open in a
      sheet. First consumer of the shadcn chat primitives (`MessageScroller`,
      `Bubble`, `Message`, `Marker`): day separators, calls as markers,
      delivery status per outbound bubble. Composer with a channel switcher
      driven by one rule (`channelOptions`: phone/email on file, DND flags,
      social channels reply-only) that `send()` also enforces with a 422;
      templates and snippets merged through `api.templates.render()`, `/`
      shortcut + Tab expansion, hand-typed merge fields filled at send time
      and blocked if unfillable, SMS segment counter. "Message" on the contact
      page, "New" conversation dialog, unread badge in the sidebar.
      Step 0 fixed three existing defects Phase 5 would have exposed:
      - **The demo clock ran backwards.** 87/90 seeded threads ended up to 11h
        after the demo "now" (day-0 messages at 08:00–19:59 UTC against a
        09:00 anchor), and the clock restarted at the anchor on every reload.
        A reply sank its thread down the inbox. Seed now counts back from
        `REF_DATE` using the same draws (stream unchanged); the clock persists
        a high-water mark and is strictly monotonic. `SEED_VERSION` → 2.
      - **`useResource` blanked screens on every invalidation.** `isLoading`
        now means "no data for this query yet"; background refetches report
        `isRefreshing`. Also stops the kanban flashing after a drop.
      - **The send lifecycle did not exist.** `lib/mock/delivery.ts` is the
        fake carrier: queued → sending → sent → delivered on timers, the last
        hop failing at the Demo Data rate; resumed on boot after a refresh.
        `send()`/`retry()` go through `simulate()` and can fail; status writes
        are no longer exported to components.
      Verified in the browser: send walks to Delivered and the thread stays
      on top; a thrown send shows "Not sent · Retry / Discard"; Retry on a
      failed delivery re-delivers; reload mid-send resumes and the clock
      keeps moving forward; DND contact has SMS disabled with the reason;
      Unread keeps the open thread; pane layouts saved per pane combination.
      `sentByAutomation` / `Activity.workflowId` still unset (Phase 8a).
      Deferred: attachments, assign/close conversation (no API setters yet),
      a Demo Data link from `/settings`.
- [ ] **Phase 6 — Dashboard** (4 pts) ← next
      Phase 7 carries the Phase 8 trap noted before Phase 5:
      `appointment.source === "workflow"` is an enum value, not a foreign key
      — keep it that way.
- [ ] **Phase 7 — Calendars** (5 pts)
- [ ] **Phase 8a — Automation, read-only** (5 pts)
      *Direction changed 2026-09-24: no drag-and-drop builder.* Automations are
      custom-coded by a developer in `src/lib/automations/` and staff can only
      view them — the file is the permission boundary. Ownership splits three
      ways: definitions are code, runs are seeded data, requests are the only
      staff-writable surface (8b).
      Deletes the editor API surface (`create`/`update`/`duplicate`/`setStatus`/
      `remove`) and the `workflows` store table; `list`/`get` re-point at the
      registry behind the seam, so components still call `api.workflows.*`.
      Definitions carry no coordinates — a deterministic layout walks the
      authored step tree. Build the step list before the diagram: it is also
      the run-log renderer and the mobile/a11y rendering.
- [ ] **Phase 8b — Automation requests + run history** (4 pts)
      `WorkflowRun` and `AutomationRequest` entities, seeders appended at the
      end of `buildDb()`, the request form, and the run log. Purely additive.
      If scope hurts, cut run history, not the request flow.
- [ ] **Phase 9 — Settings** (4 pts)
- [ ] **Phase 10 — Polish** (5 pts)

Deferred, not yet assigned to a phase — each already has API support, so none
needs backend work:

- CSV import/export and Smart Lists (from Phase 3).
- Pipeline and stage management (from Phase 4) — `pipelines.ts` has create,
  rename, add/update/reorder/remove stage and delete. Note `removeStage` merges
  deals into a neighbouring stage without renumbering `position`, and
  `pipelines.remove` hard-deletes every deal with no activity sweep; both want
  handling before this ships. Settings (Phase 9) is the natural home.
- An opportunities list view (from Phase 4) — `opportunities.list()` is a
  paginated, sortable `applyQuery` feed whose search also covers `lostReason`,
  which the board's client-side search cannot reach.
