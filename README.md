# Nimbus CRM

Nimbus is a GoHighLevel-style CRM that runs entirely in the browser. It has a
dashboard, contacts, a conversations inbox, an opportunities board, calendars,
automations and settings, all filled with realistic demo data.

There is **no backend, no database and no login**. Every screen reads and
writes through a small API layer that, for now, talks to a mock database kept
in the browser's `localStorage`. So creating a contact or dragging a deal
really saves, and it survives a page refresh. The API layer is built so that a
real server can replace the mock later without changing any screen.

## Running it

You need [Node.js](https://nodejs.org) 20.9 or newer (`node --version`) and
npm, which comes with Node.

```bash
npm install          # once: installs the dependencies
npm run dev          # starts the app at http://localhost:3000
```

Open <http://localhost:3000>; it goes straight to the dashboard. The first
visit builds the demo workspace, which takes a moment; later visits load what
is already saved in your browser.

To run the production build instead of the dev server:

```bash
npm run build        # compiles the app into .next/
npm start            # serves that build at http://localhost:3000
```

### Tests and checks

```bash
npm test             # unit tests (Vitest), src/**/*.test.ts
npm run check        # the full gate: format, lint, types, unit tests, script tests, build
npm run e2e:install  # once per machine: downloads the browser Playwright drives
npm run e2e          # end-to-end tests (Playwright), e2e/*.spec.ts
```

`npm run e2e` makes its own production build and serves it at
`http://127.0.0.1:3100`, so port 3100 must be free. It and `npm run check` both
write to `.next/`, so run them one after the other, never at the same time. A
full e2e run takes ten minutes or more.

`npm run format` rewrites files to the project's Prettier style, and
`npm run lint` runs ESLint on its own.

## How it is built

- **Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4,
  shadcn/ui on Base UI, TanStack Table 8, dnd-kit (the deal board), React Flow
  (automation diagrams), Recharts, Zustand (the mock database) and faker (demo
  data only).
- `src/app/` holds the routes, `src/components/modules/<area>/` the screens,
  `src/lib/api/` the API layer and `src/lib/mock/` the mock database and its
  seed.

### The API seam

Components never touch the data store. They call functions such as
`await api.contacts.update(id, patch)`, exported from `src/lib/api/`, and get
back a promise, just as they would from a real server.

- Each function in `src/lib/api/*.ts` does its work against the mock database
  inside `simulate()` (in `src/lib/api/http.ts`), which adds network-like
  latency and can fail on purpose.
- Errors come back as `ApiError`, with a plain-sentence `message` that the
  screens show as it is.
- Screens read through the `useResource` hook, which tracks loading, error and
  refresh states; every save tells the matching reads to refresh.
- ESLint enforces the boundary: nothing outside `src/lib/api/` may import
  `@/lib/mock/*`, and faker is allowed only in the seed code.

### Moving to a real backend

Every screen already awaits API-shaped promises and handles `ApiError`, so the
migration stays inside `src/lib/api/`:

1. Rewrite the bodies of the resource functions (`contacts.ts`, `tags.ts`, …
   in `src/lib/api/`) to call the server with `fetch()`, keeping their names,
   arguments and return types.
2. Make failed responses throw `ApiError` with the server's message and status.
3. Move what the API layer still re-exports from the mock into `src/lib/api/`:
   the `ListQuery` and `Page` types (`src/lib/mock/query-engine.ts`) and the
   clock, `apiNow()` / `nowIso()` (`src/lib/mock/clock.ts`), now backed by the
   server's time. Then delete `src/lib/mock/` and `src/lib/api/delivery.ts`,
   which wire up the mock carrier (`src/lib/mock/delivery.ts`) that moves a
   sent message through sending, sent and delivered.

No component file changes. Two things stand in for server behaviour on
purpose: message delivery status is set only by that "server" side, and the
app's "now" is a demo clock (`apiNow()` / `nowIso()`) anchored to the seed's
reference date, so the demo data never looks stale. A backend supplies both.

### Automations

Automations are code, not data: each one is a typed module in
`src/lib/automations/`, listed in `src/lib/automations/index.ts`. A developer
adds or changes an automation by editing those files. Staff can view each one
(a diagram, its steps and a run history) and send a request for a new one, but
cannot edit them in the app. The design is in `docs/design/automation.md`.

## Demo data controls

Open **Settings → Demo data** (`/settings/demo-data`):

- **Workspace contents:** how many records of each kind exist, and roughly how
  much `localStorage` they use.
- **Referential integrity:** checks that every deal, thread, appointment and
  activity points at records that exist.
- **Simulated network:** a **Latency** slider (0–3000 ms) and a **Failure
  rate** slider (0–100%). Turn latency up to see the loading states; turn the
  failure rate up to see error messages. Reads never fail, so every screen
  still loads; saves, sends and deletes do. Both sliders go back to their
  defaults (220 ms, 0%) when the page reloads, so move between screens with
  the sidebar rather than the address bar while they are set.
- **Reset:** **Reseed workspace** throws away your changes and rebuilds the
  same demo world (fixed seed, fixed reference date). Record ids change, so
  old links to a contact or deal stop working. **Clear all data**
  empties the workspace; reload the page or reseed to get data back.

All demo data lives in your browser only. Another browser, or a private
window, gets its own copy.

## Five-minute demo walkthrough

Start from a fresh workspace: **Settings → Demo data → Reseed workspace**, and
leave latency at its default for the tour. At any point, **Ctrl K** (**⌘K** on
a Mac) opens the command palette to search contacts and deals or jump to a
screen, and **Ctrl B** (**⌘B**) collapses the sidebar.

1. **Dashboard** (`/dashboard`, ~30 s). Revenue chart, pipeline, lead sources,
   due tasks, upcoming appointments and the activity feed. Switch the date
   range (for example **7d** or **90d**) and show the key figures, revenue
   chart and lead sources update.
2. **Contacts** (`/contacts`, ~1 min). Search and sort the table, then tick a
   few rows to show the bulk actions (tags, owner, delete). Clear the search
   and sort, click **Add contact**, fill in a first and last name, save, and
   show the new row at the top of the table. Open a contact for its detail
   page: info, notes, tasks, deals, appointments and the activity timeline.
3. **Conversations** (`/conversations`, ~1 min). Open a thread from the inbox
   and send a reply: its status moves from sending to sent to delivered on its
   own. To show failures, set **Failure rate** to about 50% on the Demo data
   page, come back through the sidebar and send a few more: some sends are
   refused with an error message, and some fail on delivery and show the
   reason with a **Retry** button. Set the rate back to 0% afterwards.
4. **Opportunities** (`/opportunities`, ~1 min). Drag a deal card to another
   stage, refresh the page, and show it stayed there. Open a deal for its
   detail page, or click **New deal** to add one.
5. **Calendars** (`/calendars`, ~45 s). Switch between the month, week and day
   views. Click **Book**, pick a calendar, a contact and an open time, and show
   the new appointment. **Availability** (`/calendars/availability`) sets each
   calendar's working hours.
6. **Automation** (`/automation`, ~45 s). Open **Speed to Lead** to show its
   diagram, its steps and its run history. Explain that a developer writes
   automations, so staff view them and use **Request an automation** to ask
   for a new one.
7. **Settings** (`/settings`, ~30 s). Profile, business details, team (invite
   a teammate), pipelines and stages, custom fields, and tags (rename,
   recolour or merge). Finish on **Demo data**: set latency to 2000 ms, click
   through a few screens to show their loading states, then reseed so the demo
   is fresh for the next person.

The theme menu in the header switches between light, dark and the system
setting.

## Project notes

- `CLAUDE.md`: working rules for anyone, human or agent, changing the code.
- `docs/spec.md` and `docs/design/`: the plan and the automation design.
- `docs/PROGRESS.md` and `docs/phases/`: build status and the task breakdown.
  Status changes go through `node scripts/progress.mjs`; after any hand edit,
  run `node scripts/progress.mjs --check`.
- `docs/memory/`: hand-off notes, decisions and lessons from the build.
