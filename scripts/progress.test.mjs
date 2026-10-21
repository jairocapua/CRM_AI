// Tests for scripts/progress.mjs. Run: node --test scripts/

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parseDeps, parsePhaseFile } from "./progress.mjs";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "progress.mjs");

const P0 = `# P0 — Foundations

**Phase:** P0 · **Points:** 5 ·**Branch:** \`phase/p0-foundations\` · **Increment:** I0

## Tasks

### P0-H1 — Create accounts
- **Owner:** human · **Depends:** —
- **Acceptance:**
  - [ ] keys exist

### P0-T01 — Scaffold
- **Owner:** agent · **Depends:** —
- **Acceptance:**
  - [ ] builds

### P0-T02 — Schema
- **Owner:** agent · **Depends:** P0-T01

### P0-T03 — Auth
- **Owner:** agent · **Depends:** P0-H1, P0-T02

## Exit criteria (phase gate)
- [ ] it works
`;

const P1 = `# P1 — Core

**Phase:** P1 · **Points:** 4 ·**Branch:** \`phase/p1-core\`

## Tasks

### P1-T01 — Tasks
- **Owner:** agent · **Depends:** P0

## Exit criteria (phase gate)
- [ ] tasks work
`;

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "progress-test-"));
  mkdirSync(join(root, "docs", "phases"), { recursive: true });
  mkdirSync(join(root, "docs", "memory"), { recursive: true });
  writeFileSync(join(root, "docs", "phases", "P0-foundations.md"), P0);
  writeFileSync(join(root, "docs", "phases", "P1-core.md"), P1);
  writeFileSync(
    join(root, "docs", "memory", "HANDOFF.md"),
    "# Handoff\n\n## Now\n- **Phase:** P0 on `master`\n\n## Next up\n- x\n",
  );
  return root;
}

function run(root, ...args) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args, "--root", root], {
    encoding: "utf8",
    env: { ...process.env, PROGRESS_TODAY: "2026-01-02" },
  });
  return { code: r.status, out: r.stdout.trim(), err: r.stderr.trim() };
}

const progress = (root) =>
  readFileSync(join(root, "docs", "PROGRESS.md"), "utf8");

test("parseDeps handles dashes, none and lists", () => {
  assert.deepEqual(parseDeps("—"), []);
  assert.deepEqual(parseDeps("none"), []);
  assert.deepEqual(parseDeps("P0-H1, P0-T02"), ["P0-H1", "P0-T02"]);
});

test("parsePhaseFile reads meta, tasks, owners, deps and exit criteria", () => {
  const p = parsePhaseFile(P0, "P0.md");
  assert.equal(p.id, "P0");
  assert.equal(p.branch, "phase/p0-foundations");
  assert.equal(p.points, "5");
  assert.deepEqual(
    p.tasks.map((t) => t.id),
    ["P0-H1", "P0-T01", "P0-T02", "P0-T03"],
  );
  assert.equal(p.tasks[0].owner, "human");
  assert.deepEqual(p.tasks[3].depends, ["P0-H1", "P0-T02"]);
  assert.match(p.exitCriteria, /it works/);
  assert.match(p.tasks[1].section, /builds/);
});

test("sync creates PROGRESS.md; first phase active; check passes", () => {
  const root = fixture();
  try {
    assert.equal(run(root, "sync").code, 0);
    const text = progress(root);
    assert.match(text, /## P0 — Foundations\nStatus: active/);
    assert.match(text, /## P1 — Core\nStatus: todo/);
    assert.match(text, /docs\/history\/phases-0-6\.md/);
    assert.match(text, /\| P0-T01 \| Scaffold \| agent \| todo \| — \|/);
    assert.equal(run(root, "--check").code, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("next follows dependencies, review blocks nothing but is reported", () => {
  const root = fixture();
  try {
    run(root, "sync");
    assert.equal(run(root, "next").out, "P0-T01");
    const s = run(
      root,
      "set",
      "P0-T01",
      "review",
      "--commit",
      "abc1234",
      "--note",
      "a | b",
    );
    assert.equal(s.code, 0);
    assert.match(
      progress(root),
      /\| P0-T01 \| Scaffold \| agent \| review \| — \| abc1234 \| 2026-01-02 \| a \/ b \|/,
    );
    const n = run(root, "next");
    assert.equal(n.code, 2);
    assert.match(n.out, /P0-T02 waits on P0-T01/);
    const j = JSON.parse(run(root, "--json").out);
    assert.deepEqual(
      j.review.map((t) => t.id),
      ["P0-T01"],
    );
    assert.deepEqual(
      j.waitingOnHuman.map((t) => t.id),
      ["P0-H1"],
    );
    run(root, "set", "P0-T01", "done");
    assert.equal(run(root, "next").out, "P0-T02");
    run(root, "set", "P0-T02", "done");
    assert.match(run(root, "next").out, /P0-T03 waits on P0-H1/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("phase gate: cannot mark done early; later phase waits on phase dependency", () => {
  const root = fixture();
  try {
    run(root, "sync");
    assert.equal(run(root, "phase", "P0", "done").code, 1);
    for (const id of ["P0-H1", "P0-T01", "P0-T02", "P0-T03"])
      run(root, "set", id, "done");
    const j = JSON.parse(run(root, "--json").out);
    assert.equal(j.gateReady, true);
    assert.match(run(root, "next", "--phase", "P1").out, /P1-T01 waits on P0/);
    assert.equal(run(root, "phase", "P0", "done").code, 0);
    assert.equal(run(root, "next").out, "P1-T01");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("add appends a section to the phase file and a row to the tracker", () => {
  const root = fixture();
  try {
    run(root, "sync");
    const r = run(
      root,
      "add",
      "P0",
      "Gate fix: flaky test",
      "--depends",
      "P0-T02",
    );
    assert.equal(r.out, "P0-T04");
    const phase = readFileSync(
      join(root, "docs", "phases", "P0-foundations.md"),
      "utf8",
    );
    assert.match(
      phase,
      /### P0-T04 — Gate fix: flaky test\n- \*\*Owner:\*\* agent · \*\*Depends:\*\* P0-T02/,
    );
    assert.ok(phase.indexOf("### P0-T04") < phase.indexOf("## Exit criteria"));
    assert.match(
      progress(root),
      /\| P0-T04 \| Gate fix: flaky test \| agent \| todo \| P0-T02 \|/,
    );
    assert.equal(
      run(root, "add", "P0", "Approve budget", "--owner", "human").out,
      "P0-H2",
    );
    assert.equal(run(root, "--check").code, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("check reports unknown deps, invalid statuses and orphan rows", () => {
  const root = fixture();
  try {
    run(root, "sync");
    const file = join(root, "docs", "PROGRESS.md");
    let text = readFileSync(file, "utf8");
    text = text.replace(
      "| P0-T02 | Schema | agent | todo |",
      "| P0-T02 | Schema | agent | finished |",
    );
    text += "| P0-T09 | Ghost | agent | todo | — | | | |\n";
    writeFileSync(file, text);
    writeFileSync(
      join(root, "docs", "phases", "P1-core.md"),
      P1.replace("**Depends:** P0", "**Depends:** P0-T77"),
    );
    const r = run(root, "--check");
    assert.equal(r.code, 1);
    assert.match(r.err, /P0-T02: invalid status "finished"/);
    assert.match(r.err, /P0-T09: row in PROGRESS.md has no/);
    assert.match(r.err, /P1-T01: unknown dependency "P0-T77"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("set rejects bad status and bad commit", () => {
  const root = fixture();
  try {
    run(root, "sync");
    assert.equal(run(root, "set", "P0-T01", "finished").code, 1);
    assert.equal(
      run(root, "set", "P0-T01", "review", "--commit", "not-a-sha").code,
      1,
    );
    assert.equal(run(root, "set", "P9-T01", "done").code, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("brief summary mentions next task, human tasks and handoff", () => {
  const root = fixture();
  try {
    run(root, "sync");
    const out = run(root, "--brief").out;
    assert.match(out, /Next agent task: P0-T01 Scaffold/);
    assert.match(out, /Waiting on you: P0-H1 Create accounts/);
    assert.match(
      out,
      /Handoff \(docs\/memory\/HANDOFF.md\): Phase: P0 on master$/m,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
