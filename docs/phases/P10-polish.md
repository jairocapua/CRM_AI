# P10 — Polish

**Phase:** P10 · **Points:** 5 · **Branch:** `phase/p10-polish`

**Goal:** ship-ready. A command palette, every screen's loading and error
states audited, a 375px responsive pass, keyboard and accessibility, the
cleanups the reviews left behind, a lighter first load, and a README.

**Prerequisites:** P9 done and merged into `master`.

**Spec refs:** `docs/spec.md` row 10 and Verification "P2" (failure-rate and
latency audit) and "P10". `docs/history/phases-0-6.md` Phase 5 (code smells
left for a cleanup pass).

## Tasks

### P10-T01 — Command palette (⌘K)
- **Owner:** agent · **Depends:** P9
- **Review:** light
- **Skills:** `shadcn`, `vercel-react-best-practices`
- **Scope:** ⌘K / Ctrl+K opens a palette (`cmdk` via shadcn `command`):
  navigate to any module, search contacts and deals through `api.*`, and a
  few quick actions (new contact, book appointment).
- **Acceptance:**
  - [ ] e2e: Ctrl+K, type a contact's name, Enter → the contact page opens.
- **Refs:** `src/lib/nav.ts`

### P10-T02 — Loading and error audit
- **Owner:** agent · **Depends:** P9
- **Review:** deep
- **Skills:** `vercel-react-best-practices`, `playwright-cli`
- **Scope:** with failure rate 1.0, every screen shows an error state with a
  retry; with latency 2000 ms, every screen shows a skeleton (on `isLoading`,
  never `isRefreshing`). Route error boundaries; `ApiError` toasts on failed
  mutations. Reads keep `canFail: false` unless the audit shows a screen
  needs otherwise; record any change in DECISIONS.
- **Acceptance:**
  - [ ] e2e per module, using the tuning controls: error state at failure 1.0
        for mutations, skeleton at 2000 ms latency.
  - [ ] No screen goes blank on a background refetch.
- **Refs:** `src/lib/api/http.ts` (`setTuning`), `src/lib/api/use-resource.ts`

### P10-T03 — Responsive pass at 375px
- **Owner:** agent · **Depends:** P9
- **Review:** light
- **Skills:** `web-design-guidelines`, `playwright-cli`
- **Scope:** every module at 375×812: sidebar becomes a sheet, panes stack,
  the board scroll-snaps, tables scroll horizontally inside their card, no page
  scrolls sideways.
- **Acceptance:**
  - [ ] e2e at 375px for every route: no horizontal page scroll
        (`scrollWidth <= clientWidth`) and the main action on each screen is
        visible.
- **Refs:** `src/hooks/use-mobile.ts`

### P10-T04 — Keyboard and accessibility
- **Owner:** agent · **Depends:** P9
- **Review:** deep
- **Skills:** `web-design-guidelines`, `playwright-cli`
- **Scope:** add `@axe-core/playwright`; fix serious and critical issues on
  every route. Tab through each module with no focus traps; dialogs return
  focus; the board supports keyboard drag (Tab → Space → arrows → Space).
- **Acceptance:**
  - [ ] e2e: axe reports no serious or critical violations on any route, in
        light and dark mode.
  - [ ] e2e: keyboard drag moves a deal to another stage.
- **Refs:** `docs/spec.md` Verification "P4" and "P10"

### P10-T05 — Cleanup from the Phase 5 review
- **Owner:** agent · **Depends:** P9
- **Review:** light
- **Skills:** `vercel-composition-patterns`
- **Scope:** the smells the Phase 5 review left: duplicated star/archive
  setters, the contact fetch chain in two places, `CallRow`'s parallel
  cascades, and the unused `assigneeId` filter. Behaviour must not change.
- **Acceptance:**
  - [ ] Each smell is gone (the reviewer checks file by file).
  - [ ] The Conversations e2e tests pass unchanged.
- **Refs:** `docs/history/phases-0-6.md` Phase 5

### P10-T06 — Load the seed lazily
- **Owner:** agent · **Depends:** P9
- **Review:** light
- **Skills:** `vercel-react-best-practices`
- **Scope:** the seed (and faker with it) ships in the main client bundle,
  because `api/settings.ts` imports it statically. Load it with a dynamic
  `import()` on first run and on reseed only.
- **Acceptance:**
  - [ ] The build output shows the app's first-load JS for `/dashboard`
        smaller than before (numbers before/after in the task notes).
  - [ ] e2e: first run, reload and reseed still work.
- **Refs:** `src/lib/api/settings.ts`, `src/lib/mock/seed/index.ts`

### P10-T07 — README and demo walkthrough
- **Owner:** agent · **Depends:** P10-T01, P10-T02, P10-T03, P10-T04
- **Review:** light
- **Skills:** `writing-for-agents`
- **Scope:** README: what Nimbus is, how to run it, the API seam and the
  backend migration story, the demo data controls, and a 5-minute demo
  walkthrough (which screens to show, in what order).
- **Acceptance:**
  - [ ] Every command in the README runs as written.
- **Refs:** `CLAUDE.md`, `docs/spec.md`

## Exit criteria (phase gate)
- [ ] 375px pass, keyboard tab-through and axe checks are clean on every
      module (e2e).
- [ ] Zero console errors and hydration warnings across all routes.
- [ ] `npm run check` and `npm run e2e` are green.
- [ ] Human check: the owner runs the demo walkthrough once.
