#!/usr/bin/env node
// Build tracker CLI for docs/PROGRESS.md. Zero dependencies (Node >= 20).
//
// Phase files (docs/phases/P<n>-*.md) define WHAT the tasks are; PROGRESS.md records their STATUS.
// Agents change status only through this script; humans may edit PROGRESS.md by hand (then run --check).
// Run `node scripts/progress.mjs help` for usage.

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const TASK_STATUSES = [
  "todo",
  "in-progress",
  "review",
  "done",
  "blocked",
];
export const PHASE_STATUSES = ["todo", "active", "gate", "done"];
const OWNERS = ["agent", "human"];
const NONE = "—";
const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const readText = (file) => readFileSync(file, "utf8").replace(/\r\n/g, "\n");
const phaseNum = (pid) => Number(pid.slice(1));
const isPhaseId = (s) => /^P\d+$/.test(s);
const cell = (s) =>
  String(s ?? "")
    .replace(/\|/g, "/")
    .replace(/\s*\n\s*/g, " ")
    .trim();

export function today() {
  // PROGRESS_TODAY is a test-only date override.
  if (process.env.PROGRESS_TODAY) return process.env.PROGRESS_TODAY;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function parseDeps(raw) {
  const s = String(raw ?? "").trim();
  if (!s || s === NONE || s === "-" || /^none$/i.test(s)) return [];
  return s
    .split(/[,\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------- phase files

export function parsePhaseFile(text, file) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const titleLine = lines.find((l) => /^# P\d+\s+[—–-]\s+/.test(l));
  const m = titleLine?.match(/^# (P\d+)\s+[—–-]\s+(.+?)\s*$/);
  if (!m) throw new Error(`${file}: missing "# P<n> — Title" heading`);
  const points =
    (text.match(/\*\*Points:\*\*\s*([^·\n]+)/) || [])[1]?.trim() ?? "";
  const branch =
    (text.match(/\*\*Branch:\*\*\s*`([^`]+)`/) || [])[1]?.trim() ?? "";

  const tasks = [];
  let cur = null;
  const flush = (end) => {
    if (!cur) return;
    cur.section = lines.slice(cur.start, end).join("\n").trimEnd();
    delete cur.start;
    tasks.push(cur);
    cur = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const h = line.match(/^### (P\d+-[TH]\d+)\s+[—–-]\s+(.+?)\s*$/);
    if (h) {
      flush(i);
      cur = { id: h[1], title: h[2], owner: null, depends: [], start: i };
      continue;
    }
    if (/^#{1,2} /.test(line)) {
      flush(i);
      continue;
    }
    if (cur && cur.owner === null) {
      const o = line.match(
        /\*\*Owner:\*\*\s*([a-z]+)\s*·\s*\*\*Depends:\*\*\s*(.*?)\s*$/,
      );
      if (o) {
        cur.owner = o[1];
        cur.depends = parseDeps(o[2]);
      }
    }
  }
  flush(lines.length);

  const tasksIdx = lines.findIndex((l) => /^## Tasks/.test(l));
  const header = lines
    .slice(0, tasksIdx >= 0 ? tasksIdx : Math.min(lines.length, 12))
    .join("\n")
    .trimEnd();
  const exitIdx = lines.findIndex((l) => /^## Exit criteria/.test(l));
  let exitCriteria = "";
  if (exitIdx >= 0) {
    let end = lines.findIndex((l, i) => i > exitIdx && /^## /.test(l));
    if (end < 0) end = lines.length;
    exitCriteria = lines.slice(exitIdx, end).join("\n").trimEnd();
  }
  return {
    id: m[1],
    title: m[2],
    points,
    branch,
    file,
    header,
    exitCriteria,
    tasks,
  };
}

export function loadPhases(root) {
  const dir = join(root, "docs", "phases");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^P\d+-.*\.md$/.test(f))
    .map((f) => parsePhaseFile(readText(join(dir, f)), `docs/phases/${f}`))
    .sort((a, b) => phaseNum(a.id) - phaseNum(b.id));
}

// ---------------------------------------------------------------- PROGRESS.md

export function parseProgress(text) {
  const phases = new Map();
  const tasks = new Map();
  let cur = null;
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const h = line.match(/^## (P\d+)\s+[—–-]\s+(.+?)\s*$/);
    if (h) {
      cur = h[1];
      phases.set(cur, { id: cur, title: h[2], status: "todo" });
      continue;
    }
    const s = cur && line.match(/^Status:\s*([a-z-]+)/);
    if (s) {
      phases.get(cur).status = s[1];
      continue;
    }
    const r = line.match(/^\|\s*(P\d+-[TH]\d+)\s*\|(.*)\|\s*$/);
    if (r) {
      const [
        title = "",
        owner = "",
        status = "",
        depends = "",
        commit = "",
        updated = "",
        notes = "",
      ] = r[2].split("|").map((c) => c.trim());
      tasks.set(r[1], {
        id: r[1],
        phase: cur,
        title,
        owner,
        status,
        depends: parseDeps(depends),
        commit,
        updated,
        notes,
      });
    }
  }
  return { phases, tasks };
}

export function buildModel(root) {
  const progPath = join(root, "docs", "PROGRESS.md");
  const prog = existsSync(progPath)
    ? parseProgress(readText(progPath))
    : { phases: new Map(), tasks: new Map() };
  const phases = loadPhases(root).map((p, idx) => ({
    id: p.id,
    title: p.title,
    points: p.points,
    branch: p.branch,
    file: p.file,
    header: p.header,
    exitCriteria: p.exitCriteria,
    status: prog.phases.get(p.id)?.status ?? (idx === 0 ? "active" : "todo"),
    tasks: p.tasks.map((t) => {
      const s = prog.tasks.get(t.id);
      return {
        id: t.id,
        phase: p.id,
        title: t.title,
        owner: t.owner ?? s?.owner ?? "",
        depends: t.depends,
        status: s?.status ?? "todo",
        commit: s?.commit ?? "",
        updated: s?.updated ?? "",
        notes: s?.notes ?? "",
        section: t.section,
        inPhaseFile: true,
        inProgressFile: Boolean(s),
      };
    }),
  }));
  // Rows that exist in PROGRESS.md but have no section in a phase file are kept (and flagged by --check).
  const known = new Set(phases.flatMap((p) => p.tasks.map((t) => t.id)));
  for (const o of prog.tasks.values()) {
    if (known.has(o.id)) continue;
    const ph = phases.find((p) => o.id.startsWith(`${p.id}-`));
    if (ph)
      ph.tasks.push({
        ...o,
        phase: ph.id,
        section: "",
        inPhaseFile: false,
        inProgressFile: true,
      });
  }
  return { root, progPath, phases };
}

// ---------------------------------------------------------------- status

export function computeStatus(model, opts = {}) {
  const all = model.phases.flatMap((p) => p.tasks);
  const byId = new Map(all.map((t) => [t.id, t]));
  const phaseById = new Map(model.phases.map((p) => [p.id, p]));
  const depDone = (d) =>
    isPhaseId(d)
      ? phaseById.get(d)?.status === "done"
      : byId.get(d)?.status === "done";

  const target = opts.phase
    ? phaseById.get(opts.phase)
    : model.phases.find((p) => p.status !== "done");
  let next = null;
  let nextReason = "";
  let waitingOnHuman = [];
  let gateReady = false;

  if (!target) {
    nextReason = opts.phase
      ? `unknown phase ${opts.phase}`
      : "all phases are done";
  } else {
    waitingOnHuman = target.tasks
      .filter((t) => t.owner === "human" && t.status !== "done")
      .map((t) => ({ id: t.id, title: t.title }));
    const candidates = target.tasks.filter(
      (t) => t.owner === "agent" && t.status === "todo",
    );
    const ready = candidates.find((t) => t.depends.every(depDone));
    if (ready) {
      next = {
        id: ready.id,
        title: ready.title,
        phase: target.id,
        phaseTitle: target.title,
        branch: target.branch,
        file: target.file,
        depends: ready.depends,
      };
    } else if (
      target.tasks.length &&
      target.tasks.every((t) => t.status === "done")
    ) {
      gateReady = target.status !== "done";
      nextReason = `all tasks in ${target.id} are done: run the phase gate`;
    } else if (candidates.length) {
      const c = candidates[0];
      nextReason = `${c.id} waits on ${c.depends.filter((d) => !depDone(d)).join(", ")}`;
    } else {
      nextReason = `no startable agent task in ${target.id} (check review / in-progress / blocked / human tasks)`;
    }
  }
  const total = all.length;
  const done = all.filter((t) => t.status === "done").length;
  return {
    activePhase: target?.id ?? null,
    next,
    nextReason,
    review: all
      .filter((t) => t.status === "review")
      .map((t) => ({ id: t.id, title: t.title, commit: t.commit })),
    inProgress: all
      .filter((t) => t.status === "in-progress")
      .map((t) => ({ id: t.id, title: t.title })),
    blocked: all
      .filter((t) => t.status === "blocked")
      .map((t) => ({ id: t.id, title: t.title, notes: t.notes })),
    waitingOnHuman,
    gateReady,
    overall: { total, done, pct: total ? Math.round((done / total) * 100) : 0 },
  };
}

// ---------------------------------------------------------------- render

const ids = (list) => (list.length ? list.map((x) => x.id).join(", ") : "none");

export function renderProgress(model) {
  const st = computeStatus(model);
  const out = [
    "# Build progress",
    "",
    "> **Source of truth for build status.** Agents change it only through `node scripts/progress.mjs` (`set` / `phase` / `add` / `sync`).",
    "> Humans may edit it by hand: keep the table format, then run `node scripts/progress.mjs --check`.",
    ">",
    "> **Task status:** `todo` → `in-progress` → `review` (agent finished; awaiting your approval) → `done` · `blocked` (needs you; see Notes)",
    "> **Phase status:** `todo` → `active` → `gate` (all tasks done; exit criteria being verified) → `done` (gate passed; merge the phase branch into `master`)",
    "> **Depends:** task IDs, or a phase ID (meaning that phase's gate has passed). Task definitions live in `docs/phases/`.",
    "> Phases 0–6 were built before this tracker existed; their notes are in `docs/history/phases-0-6.md`.",
    "",
    "<!-- summary:start -->",
    `**Overall:** ${st.overall.done}/${st.overall.total} tasks done (${st.overall.pct}%) · **Current phase:** ${st.activePhase ?? "—"} · **Next agent task:** ${st.next ? st.next.id : NONE} · **Awaiting review:** ${ids(st.review)} · **Blocked:** ${ids(st.blocked)} · **Waiting on you:** ${ids(st.waitingOnHuman)}`,
    "<!-- summary:end -->",
    "",
  ];
  for (const p of model.phases) {
    const done = p.tasks.filter((t) => t.status === "done").length;
    out.push(`## ${p.id} — ${p.title}`);
    out.push(
      `Status: ${p.status} · Progress: ${done}/${p.tasks.length} · Points: ${p.points || NONE} · Branch: ${p.branch || NONE} · File: ${p.file}`,
    );
    out.push("");
    out.push(
      "| ID | Task | Owner | Status | Depends | Commit | Updated | Notes |",
    );
    out.push("|---|---|---|---|---|---|---|---|");
    for (const t of p.tasks) {
      out.push(
        `| ${t.id} | ${cell(t.title)} | ${t.owner} | ${t.status} | ${t.depends.length ? t.depends.join(", ") : NONE} | ${cell(t.commit)} | ${cell(t.updated)} | ${cell(t.notes)} |`,
      );
    }
    out.push("");
  }
  return out.join("\n");
}

function save(model) {
  writeFileSync(model.progPath, `${renderProgress(model).trimEnd()}\n`);
}

// ---------------------------------------------------------------- check

export function check(model) {
  const errors = [];
  const warnings = [];
  const byId = new Map();
  const phaseIds = new Set(model.phases.map((p) => p.id));
  if (!model.phases.length) errors.push("no phase files found in docs/phases/");
  for (const p of model.phases) {
    if (!p.branch) errors.push(`${p.id}: phase file has no **Branch:**`);
    if (!p.points) warnings.push(`${p.id}: phase file has no **Points:**`);
    if (!p.exitCriteria)
      warnings.push(`${p.id}: phase file has no "## Exit criteria" section`);
    if (!PHASE_STATUSES.includes(p.status))
      errors.push(`${p.id}: invalid phase status "${p.status}"`);
    for (const t of p.tasks) {
      if (byId.has(t.id)) errors.push(`duplicate task id ${t.id}`);
      byId.set(t.id, t);
      if (!OWNERS.includes(t.owner))
        errors.push(`${t.id}: owner must be agent|human (got "${t.owner}")`);
      if (!TASK_STATUSES.includes(t.status))
        errors.push(`${t.id}: invalid status "${t.status}"`);
      if (!t.inPhaseFile)
        errors.push(
          `${t.id}: row in PROGRESS.md has no "### ${t.id}" section in ${p.file}`,
        );
      else if (!t.inProgressFile)
        warnings.push(
          `${t.id}: not in PROGRESS.md yet (run: node scripts/progress.mjs sync)`,
        );
      if (t.status === "blocked" && !t.notes)
        warnings.push(`${t.id}: blocked without a note explaining why`);
    }
  }
  for (const t of byId.values()) {
    for (const d of t.depends) {
      if (d === t.id) errors.push(`${t.id} depends on itself`);
      else if (isPhaseId(d)) {
        if (!phaseIds.has(d))
          errors.push(`${t.id}: unknown phase dependency "${d}"`);
        else if (phaseNum(d) >= phaseNum(t.phase))
          errors.push(
            `${t.id}: depends on phase ${d}, which is not an earlier phase`,
          );
      } else if (!byId.has(d))
        errors.push(`${t.id}: unknown dependency "${d}"`);
    }
  }
  // Task-level dependency cycles.
  const state = new Map();
  const visit = (id, path) => {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) {
      errors.push(`dependency cycle: ${[...path, id].join(" → ")}`);
      return;
    }
    state.set(id, 1);
    for (const d of byId.get(id)?.depends ?? [])
      if (byId.has(d)) visit(d, [...path, id]);
    state.set(id, 2);
  };
  for (const id of byId.keys()) visit(id, []);

  if (!existsSync(model.progPath))
    errors.push(
      "docs/PROGRESS.md is missing (run: node scripts/progress.mjs sync)",
    );
  for (const p of model.phases) {
    if (p.status === "done" && p.tasks.some((t) => t.status !== "done"))
      errors.push(`${p.id} is done but has unfinished tasks`);
  }
  const phaseDone = (d) =>
    model.phases.find((p) => p.id === d)?.status === "done";
  for (const t of byId.values()) {
    if (t.status !== "done") continue;
    const open = t.depends.filter((d) =>
      isPhaseId(d) ? !phaseDone(d) : byId.get(d)?.status !== "done",
    );
    if (open.length)
      warnings.push(
        `${t.id} is done but depends on unfinished ${open.join(", ")}`,
      );
  }
  const running = [...byId.values()].filter((t) => t.status === "in-progress");
  if (running.length > 1)
    warnings.push(
      `more than one task in progress: ${running.map((t) => t.id).join(", ")}`,
    );
  return { errors, warnings };
}

// ---------------------------------------------------------------- commands

function findTask(model, id) {
  for (const p of model.phases) {
    const t = p.tasks.find((x) => x.id === id);
    if (t) return t;
  }
  return null;
}

function fail(msg) {
  console.error(`progress: ${msg}`);
  process.exitCode = 1;
}

function cmdSet(model, id, status, flags) {
  const t = findTask(model, id);
  if (!t) return fail(`unknown task ${id}`);
  if (!TASK_STATUSES.includes(status))
    return fail(`status must be one of ${TASK_STATUSES.join(", ")}`);
  if (
    flags.commit !== undefined &&
    flags.commit !== "" &&
    !/^[0-9a-f]{7,40}$/i.test(flags.commit)
  ) {
    return fail(`--commit must be a git sha (got "${flags.commit}")`);
  }
  t.status = status;
  t.updated = today();
  if (flags.commit !== undefined) t.commit = flags.commit.slice(0, 12);
  if (flags.note !== undefined) t.notes = cell(flags.note).slice(0, 300);
  save(model);
  console.log(`${id} → ${status}${t.commit ? ` (${t.commit})` : ""}`);
}

function cmdPhase(model, pid, status) {
  const p = model.phases.find((x) => x.id === pid);
  if (!p) return fail(`unknown phase ${pid}`);
  if (!PHASE_STATUSES.includes(status))
    return fail(`phase status must be one of ${PHASE_STATUSES.join(", ")}`);
  if (status === "done" && p.tasks.some((t) => t.status !== "done")) {
    return fail(
      `${pid} still has unfinished tasks: ${p.tasks
        .filter((t) => t.status !== "done")
        .map((t) => t.id)
        .join(", ")}`,
    );
  }
  p.status = status;
  save(model);
  console.log(`${pid} → ${status}`);
}

function cmdAdd(model, pid, title, flags) {
  const p = model.phases.find((x) => x.id === pid);
  if (!p) return fail(`unknown phase ${pid}`);
  if (!title) return fail('add needs a title: add <P#> "<title>"');
  const owner = flags.owner ?? "agent";
  if (!OWNERS.includes(owner)) return fail("--owner must be agent|human");
  const kind = owner === "human" ? "H" : "T";
  const nums = p.tasks
    .filter((t) => t.id.startsWith(`${pid}-${kind}`))
    .map((t) => Number(t.id.split(kind)[1]));
  const n = (nums.length ? Math.max(...nums) : 0) + 1;
  const id = `${pid}-${kind}${kind === "T" ? String(n).padStart(2, "0") : n}`;
  const deps = parseDeps(flags.depends);
  const section = [
    `### ${id} — ${cell(title)}`,
    `- **Owner:** ${owner} · **Depends:** ${deps.length ? deps.join(", ") : NONE}`,
    `- **Scope:** ${flags.scope ? cell(flags.scope) : "(to be detailed by the planner before implementation)"}`,
    "- **Acceptance:**",
    `  - [ ] ${flags.acceptance ? cell(flags.acceptance) : "(define before starting)"}`,
    `- **Refs:** added by \`progress.mjs add\` on ${today()}`,
    "",
  ].join("\n");
  const file = join(model.root, p.file);
  const text = readText(file);
  const lines = text.split("\n");
  const exitIdx = lines.findIndex((l) => /^## Exit criteria/.test(l));
  const updated =
    exitIdx >= 0
      ? [
          ...lines.slice(0, exitIdx),
          ...section.split("\n"),
          ...lines.slice(exitIdx),
        ].join("\n")
      : `${text.trimEnd()}\n\n${section}`;
  writeFileSync(file, updated);
  save(buildModel(model.root));
  console.log(id);
}

function cmdShow(model, id) {
  if (isPhaseId(id)) {
    const p = model.phases.find((x) => x.id === id);
    if (!p) return fail(`unknown phase ${id}`);
    console.log(
      `${p.header}\n\nStatus: ${p.status}\n\n## Tasks\n${p.tasks.map((t) => `- ${t.id} [${t.owner}] ${t.status}: ${t.title}`).join("\n")}\n\n${p.exitCriteria}`,
    );
    return;
  }
  const t = findTask(model, id);
  if (!t) return fail(`unknown task ${id}`);
  const p = model.phases.find((x) => x.id === t.phase);
  console.log(
    `Phase: ${p.id} — ${p.title} · Branch: ${p.branch} · File: ${p.file}\nStatus: ${t.status}${t.commit ? ` · Commit: ${t.commit}` : ""}${t.notes ? ` · Notes: ${t.notes}` : ""}\n\n${t.section || "(no section in phase file)"}`,
  );
}

function handoffNow(root) {
  const file = join(root, "docs", "memory", "HANDOFF.md");
  if (!existsSync(file)) return [];
  const lines = readText(file).split("\n");
  const start = lines.findIndex((l) => /^## Now/.test(l));
  if (start < 0) return [];
  const out = [];
  for (let i = start + 1; i < lines.length && !/^## /.test(lines[i]); i++) {
    if (lines[i].trim())
      out.push(
        lines[i]
          .trim()
          .replace(/^[-*]\s*/, "")
          .replace(/\*\*|`/g, ""),
      );
  }
  return out.slice(0, 4);
}

function printSummary(model, brief) {
  const st = computeStatus(model);
  const p = model.phases.find((x) => x.id === st.activePhase);
  const inPhase = p
    ? `${p.tasks.filter((t) => t.status === "done").length}/${p.tasks.length}`
    : "";
  const lines = [];
  lines.push(
    `Nimbus CRM build · ${p ? `${p.id} ${p.title} (${p.status}, ${inPhase} done)` : "all phases done"} · overall ${st.overall.done}/${st.overall.total} (${st.overall.pct}%)`,
  );
  lines.push(
    st.next
      ? `Next agent task: ${st.next.id} ${st.next.title}. Say "run the build-phase workflow"`
      : `Next agent task: none (${st.nextReason})`,
  );
  if (st.review.length)
    lines.push(
      `Awaiting your review: ${st.review.map((t) => `${t.id}${t.commit ? ` (${t.commit})` : ""}`).join(", ")}. Say "approve" or "rework <ID>: <feedback>"`,
    );
  if (st.inProgress.length)
    lines.push(`In progress (an interrupted run?): ${ids(st.inProgress)}`);
  if (st.blocked.length)
    lines.push(
      `Blocked: ${st.blocked.map((t) => `${t.id}${t.notes ? ` (${t.notes})` : ""}`).join("; ")}`,
    );
  if (st.waitingOnHuman.length)
    lines.push(
      `Waiting on you: ${st.waitingOnHuman.map((t) => `${t.id} ${t.title}`).join("; ")}`,
    );
  if (st.gateReady)
    lines.push(
      `All ${st.activePhase} tasks done. Say "run the build-phase gate for ${st.activePhase}"`,
    );
  if (brief) {
    const h = handoffNow(model.root);
    if (h.length)
      lines.push(`Handoff (docs/memory/HANDOFF.md): ${h.join(" ")}`);
    console.log(lines.join("\n"));
    return;
  }
  console.log(lines.join("\n"));
  console.log("");
  for (const ph of model.phases) {
    const done = ph.tasks.filter((t) => t.status === "done").length;
    const width = 20;
    const fill = ph.tasks.length
      ? Math.round((done / ph.tasks.length) * width)
      : 0;
    console.log(
      `${ph.id.padEnd(3)} [${"#".repeat(fill)}${"-".repeat(width - fill)}] ${String(done).padStart(2)}/${String(ph.tasks.length).padEnd(2)} ${ph.status.padEnd(6)} ${ph.title}`,
    );
  }
}

function usage() {
  console.log(`Usage: node scripts/progress.mjs [command] [options]

  (no command)            Summary: phases, next task, review/blocked/waiting lists
  --brief                 Short summary + handoff (used by the SessionStart hook)
  --json                  Machine-readable status (used by the build-phase workflow)
  --check                 Validate phase files + PROGRESS.md; exit 1 on errors
  sync                    Create/refresh PROGRESS.md from docs/phases/*.md (keeps statuses)
  next [--phase P#]       Print the next startable agent task id (exit 2 if none)
  show <P#|ID>            Print a phase overview or a task's full section
  set <ID> <status> [--commit <sha>] [--note "…"]
                          Update a task (${TASK_STATUSES.join(" | ")}); stamps today's date
  phase <P#> <status>     Update a phase (${PHASE_STATUSES.join(" | ")})
  add <P#> "<title>" [--owner agent|human] [--depends A,B] [--scope "…"] [--acceptance "…"]
                          Append a task to the phase file and the tracker; prints the new id
  --root <dir>            Operate on another checkout (tests)`);
}

export function parseArgs(argv) {
  const pos = [];
  const flags = {};
  const valued = new Set([
    "commit",
    "note",
    "owner",
    "depends",
    "scope",
    "acceptance",
    "phase",
    "root",
  ]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      if (valued.has(key)) flags[key] = argv[++i] ?? "";
      else flags[key] = true;
    } else pos.push(a);
  }
  return { pos, flags };
}

export function main(argv = process.argv.slice(2)) {
  const { pos, flags } = parseArgs(argv);
  const root = flags.root ? resolve(flags.root) : DEFAULT_ROOT;
  const [cmd, a1, a2] = pos;
  if (flags.help || cmd === "help") return usage();
  const model = buildModel(root);

  if (flags.check || cmd === "check") {
    const { errors, warnings } = check(model);
    for (const w of warnings) console.log(`warning: ${w}`);
    for (const e of errors) console.error(`error: ${e}`);
    const n = model.phases.reduce((s, p) => s + p.tasks.length, 0);
    console.log(
      errors.length
        ? `✗ ${errors.length} error(s)`
        : `✓ tracker OK (${model.phases.length} phases, ${n} tasks, ${warnings.length} warning(s))`,
    );
    if (errors.length) process.exitCode = 1;
    return;
  }
  switch (cmd) {
    case "sync":
      save(model);
      return printSummary(buildModel(root), true);
    case "set":
      return cmdSet(model, a1, a2, flags);
    case "phase":
      return cmdPhase(model, a1, a2);
    case "add":
      return cmdAdd(model, a1, a2, flags);
    case "show":
      return cmdShow(model, a1);
    case "next": {
      const st = computeStatus(model, { phase: flags.phase });
      if (st.next) console.log(st.next.id);
      else {
        console.log(st.nextReason);
        process.exitCode = 2;
      }
      return;
    }
    case undefined:
      if (flags.json) {
        const st = computeStatus(model, { phase: flags.phase });
        // The destructured-but-unused names are what this output leaves out.
        /* eslint-disable @typescript-eslint/no-unused-vars */
        const phases = model.phases.map(
          ({ header, exitCriteria, tasks, ...p }) => ({
            ...p,
            counts: Object.fromEntries(
              TASK_STATUSES.map((s) => [
                s,
                tasks.filter((t) => t.status === s).length,
              ]),
            ),
            tasks: tasks.map(
              ({ section, inPhaseFile, inProgressFile, ...t }) => t,
            ),
          }),
        );
        /* eslint-enable @typescript-eslint/no-unused-vars */
        console.log(JSON.stringify({ ...st, phases }, null, 2));
        return;
      }
      return printSummary(model, Boolean(flags.brief));
    default:
      fail(`unknown command "${cmd}"`);
      usage();
  }
}

const invokedDirectly =
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) main();
