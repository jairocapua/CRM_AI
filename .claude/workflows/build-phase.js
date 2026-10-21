export const meta = {
  name: 'build-phase',
  description: 'Run one Nimbus CRM build task end to end (plan, implement, verify + review, fix, commit) or a phase gate, then stop for human review',
  whenToUse: 'The user says "run the build-phase workflow", "next task", "approve", "rework <ID>: <feedback>", "run task <ID>", "run task <ID> as is", "run the gate for P<n>" or "dry run". Pass args as an object: { phase?, task?, approve?, rework?, feedback?, gate?, dryRun?, allowLarge?, trailer? }',
  phases: [
    { title: 'Prepare', detail: 'select the task, switch to the phase branch, mark in-progress' },
    { title: 'Plan', detail: 'implementation plan + acceptance map' },
    { title: 'Implement', detail: 'code + tests until checks are green' },
    { title: 'Verify', detail: 'acceptance evidence and code review in parallel' },
    { title: 'Fix', detail: 'up to 2 fix rounds, each re-verified (and re-reviewed on deep tasks)' },
    { title: 'Record', detail: 'tracker, handoff, learnings, single commit' },
  ],
}

// One task per run (or one phase gate), then stop so the human reviews it.
// The script cannot touch files or read the clock: agents do all git/tracker work,
// and dates come from `date +%F` / scripts/progress.mjs.
// Worst case is 12 agents: a deep task that needs both fix rounds re-runs the reviewer each round.

// ---------------------------------------------------------------- args

let A = {}
if (args && typeof args === 'object' && !Array.isArray(args)) A = args
else if (typeof args === 'string' && args.trim()) {
  const s = args.trim()
  try {
    A = JSON.parse(s)
  } catch {
    if (/^P\d+-[TH]\d+$/.test(s)) A = { task: s }
    else if (/^P\d+$/.test(s)) A = { phase: s }
  }
}
const MAX_FIX_ROUNDS = 2
const TRAILER = A.trailer || 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'
const mode = A.dryRun ? 'dry-run' : A.gate ? 'gate' : A.rework ? 'rework' : A.task ? 'task' : A.approve ? 'approve+next' : 'next'

// Inline role text, used only if a custom agent type from .claude/agents/ is not registered in this session.
const ROLE = {
  planner:
    'ROLE: planner (read-only). Never create or edit files; use Bash only for read-only commands. Plan exactly one task: ordered steps, files, tests (unit = Vitest, e2e = Playwright, + purpose), an acceptanceMap (criterion -> proof), risks. Read node_modules/next/dist/docs/ before planning any Next.js API. blockingQuestions only for product decisions docs/spec.md and the phase file do not answer; needsHumanSetup only for manual steps you checked and found missing; proposedSplit when the task will not fit one sitting.',
  implementer:
    'ROLE: implementer. Implement exactly the given task/plan following the CLAUDE.md rules (API seam, ISODate, Cents, demo clock, useResource, Base UI render prop, TanStack 8.21.3 pin); tests first for logic; run `npm run format`, then `npm run check` (and `npm run e2e` once it exists and the task touches UI) until green, and report every command. Never git commit/push/merge/reset; never edit docs/PROGRESS.md or docs/memory/*. No secrets.',
  verifier:
    'ROLE: verifier (no file edits). Run every check that exists in check mode (`npm run check`; `npm run e2e` when the task touches UI and the script exists; `npm ls @tanstack/react-table` must print 8.21.3; `node scripts/progress.mjs --check`); map every acceptance/exit criterion to concrete evidence (test name + passing output, command output, or file:line); unprovable = not met; human-only criteria -> needsHuman. pass=true only if all checks pass and all non-human criteria are met.',
  reviewer:
    'ROLE: reviewer (read-only). Review the change for CLAUDE.md rule violations (components importing @/lib/mock, Date fields instead of ISODate, money not in Cents, new Date()/Date.now()/formatDistanceToNow instead of apiNow()/nowIso(), a read calling nowIso(), seed records after REF_DATE, reordered faker draws or a seed-shape change without a SEED_VERSION bump, UTC dates where the UI shows local ones, skeletons on isRefreshing, delivery status written from a component, a ResourceKey missing from one of cache.ts\'s two lists, asChild instead of render, bare DropdownMenuLabel, SelectValue without a label mapping, cycled chart palette slots, automations referencing tags/users by id, TanStack Table moving off 8.21.3), correctness bugs, tests that prove nothing, and scope creep; each must-fix needs file:line + why. Style preferences are suggestions only.',
  recorder:
    'ROLE: recorder. Bookkeeping only: git on the phase branch, tracker ONLY via `node scripts/progress.mjs`, memory files (rewrite HANDOFF.md; append to LEARNINGS.md/DECISIONS.md with `date +%F` dates). Never edit application code; never push/merge/reset/rebase/clean or `commit --amend` (a missed file goes in a follow-up commit); never stage .env*, playwright-report/ or test-results/.',
}

// ---------------------------------------------------------------- schemas

const STR = { type: 'string' }
const STRS = { type: 'array', items: { type: 'string' } }

const PREP_SCHEMA = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ['run', 'gate', 'stop'] },
    reason: { type: 'string', description: 'Why the run stops and what the human should do, or a one-line summary of the target' },
    taskId: STR,
    title: STR,
    phaseId: STR,
    branch: STR,
    branchCreated: { type: 'boolean' },
    taskSection: { type: 'string', description: 'Full output of `node scripts/progress.mjs show <ID or P#>`' },
    reworkFeedback: STR,
    approved: STRS,
    notes: STR,
  },
  required: ['action', 'reason'],
}

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    summary: STR,
    steps: STRS,
    files: STRS,
    tests: STRS,
    acceptanceMap: {
      type: 'array',
      items: { type: 'object', properties: { criterion: STR, proof: STR }, required: ['criterion', 'proof'] },
    },
    risks: STRS,
    blockingQuestions: { type: 'array', items: STR, description: 'Only product decisions the spec does not answer' },
    needsHumanSetup: { type: 'array', items: STR, description: 'Credentials, accounts or manual steps that a read-only check showed are missing now, each with the check and its output. Any entry stops the run.' },
    proposedSplit: {
      type: 'array',
      items: STR,
      description: 'Non-empty only if the task will not fit one sitting: one entry per smaller task, as "<title>: <scope>. Acceptance: <how to prove it>"',
    },
  },
  required: ['summary', 'steps', 'acceptanceMap', 'blockingQuestions'],
}

const IMPL_SCHEMA = {
  type: 'object',
  properties: {
    summary: STR,
    filesChanged: STRS,
    testsAdded: STRS,
    checks: {
      type: 'array',
      items: { type: 'object', properties: { command: STR, passed: { type: 'boolean' }, detail: STR }, required: ['command', 'passed'] },
    },
    learnings: STRS,
    decisions: STRS,
    openIssues: STRS,
    blocked: { type: 'string', description: 'Non-empty only if the task cannot be finished without the human' },
  },
  required: ['summary', 'filesChanged', 'checks'],
}

const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    pass: { type: 'boolean' },
    checks: {
      type: 'array',
      items: { type: 'object', properties: { command: STR, passed: { type: 'boolean' }, detail: STR }, required: ['command', 'passed'] },
    },
    criteria: {
      type: 'array',
      items: {
        type: 'object',
        properties: { criterion: STR, met: { type: 'boolean' }, needsHuman: { type: 'boolean' }, evidence: STR },
        required: ['criterion', 'met', 'evidence'],
      },
    },
    failures: STRS,
  },
  required: ['pass', 'criteria', 'failures'],
}

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    mustFix: {
      type: 'array',
      items: { type: 'object', properties: { where: STR, issue: STR, why: STR }, required: ['where', 'issue'] },
    },
    suggestions: STRS,
  },
  required: ['mustFix', 'suggestions'],
}

const RECORD_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['review', 'blocked', 'gate-passed', 'gate-failed'] },
    commit: STR,
    summary: STR,
    reviewChecklist: STRS,
    next: STR,
    addedTasks: STRS,
  },
  required: ['status', 'summary'],
}

// ---------------------------------------------------------------- helpers

async function run(role, prompt, opts) {
  try {
    return await agent(prompt, { ...opts, agentType: role })
  } catch (e) {
    log(`agent type "${role}" unavailable (${String((e && e.message) || e).slice(0, 100)}); using the default subagent`)
    return await agent(`${ROLE[role]}\n\n${prompt}`, opts)
  }
}

const numbered = (items) => items.map((x, i) => `${i + 1}. ${x}`).join('\n')

function taskBlock(prep) {
  const parts = [
    `TASK ${prep.taskId}: ${prep.title}\nPhase ${prep.phaseId} · branch ${prep.branch}`,
    `<<<TASK DEFINITION (docs/phases)\n${prep.taskSection || `(run: node scripts/progress.mjs show ${prep.taskId})`}\nTASK DEFINITION>>>`,
  ]
  if (prep.reworkFeedback) {
    parts.push(
      `HUMAN REWORK FEEDBACK (highest priority). The previous attempt is already committed on this branch (\`git log --grep "^${prep.taskId}:"\`):\n${prep.reworkFeedback}`,
    )
  }
  return parts.join('\n\n')
}

function collectProblems(ver, rev) {
  const out = []
  if (!ver) out.push('The verifier returned no result, so the task is unverified.')
  else {
    for (const f of ver.failures || []) out.push(f)
    for (const c of ver.criteria || []) if (!c.met && !c.needsHuman) out.push(`Acceptance not met: ${c.criterion}: ${c.evidence}`)
    if (!ver.pass && !out.length) out.push('The verifier reported a failure without details; re-run the checks and report specifics.')
  }
  if (rev) for (const m of rev.mustFix || []) out.push(`Review must-fix at ${m.where}: ${m.issue}${m.why ? ` (${m.why})` : ''}`)
  return [...new Set(out)]
}

const humanChecks = (ver) =>
  ver ? (ver.criteria || []).filter((c) => c.needsHuman).map((c) => `${c.criterion}: ${c.evidence}`) : []

// Review tier from the task's "- **Review:** deep|light" line. A task without the line is deep.
const tierOf = (prep) => (/\*\*Review:\*\*\s*light/i.test(prep.taskSection || '') ? 'light' : 'deep')

// ---------------------------------------------------------------- prompts

function preparePrompt() {
  const lines = [
    `BUILD-PHASE › PREPARE (mode: ${mode}). Args: ${JSON.stringify(A)}`,
    'Follow these steps in order. At the first stop condition, return action "stop" with a reason that tells the human exactly what to do next.',
    '1. Inspect: `node scripts/progress.mjs --json`, `git status --porcelain`, `git branch --show-current`, `git branch --list "phase/*"`.',
    `2. Working tree: if the ONLY changes are under docs/ (tracker/memory edits) and/or AGENTS.md (\`next dev\` rewrites it), commit them on the current branch: \`git add docs AGENTS.md && git commit -m "chore(progress): tracker and memory updates" -m "${TRAILER}"\`. If there are other changes: continue ONLY if args.task or args.rework names a task whose status is blocked (the partial work belongs to it); otherwise stop ("uncommitted changes in <files>: commit, stash or discard them first").`,
  ]
  if (A.approve) {
    lines.push(
      '3a. APPROVE: for every task with status "review": find its commit with `git log --grep "^<ID>:" --format=%h -1`, then run `node scripts/progress.mjs set <ID> done --commit <sha>`. Put the ids in `approved`. If none were in review, say so in notes.',
    )
  }
  if (A.rework) {
    lines.push(
      `3b. REWORK ${A.rework}: it must have status review or blocked (else stop). Run \`node scripts/progress.mjs set ${A.rework} in-progress --note "rework: <≤80 chars of the feedback>"\`. It is the target task. Copy this feedback verbatim into reworkFeedback: ${JSON.stringify(A.feedback || '')}`,
    )
  }
  if (A.gate) {
    lines.push(
      `3c. GATE ${A.gate}: every task of ${A.gate} must be done (else stop and list the unfinished ones). Switch to that phase's branch (\`git switch <branch>\`). Run \`node scripts/progress.mjs phase ${A.gate} gate\`, then return action "gate" with phaseId, branch, and taskSection = the full output of \`node scripts/progress.mjs show ${A.gate}\`.`,
    )
  } else {
    lines.push(
      '4. Stop rules: a task still in status "review" → stop ("<ID> awaits your review: say approve, or rework <ID>: <feedback>"). A task "in-progress" that is not the rework target → stop ("<ID> looks interrupted: say run task <ID> to retry it, or reset it with node scripts/progress.mjs set <ID> todo").',
    )
    const target = A.rework
      ? `the rework task ${A.rework}`
      : A.task
        ? `task ${A.task} (it must be todo or blocked with all dependencies done; otherwise stop and explain)`
        : `the output of \`node scripts/progress.mjs next${A.phase ? ` --phase ${A.phase}` : ''}\` (exit code 2 → stop with its message, e.g. waiting on a human task or ready for the phase gate)`
    lines.push(`5. Target: ${target}.`)
    lines.push(
      '6. Branch: the phase branch from the tracker JSON. If already on it, fine. If it exists, `git switch` to it. If it does not exist, it must start from master: when this is not the first phase, the previous phase must have status done and, if its branch exists, be merged (`git merge-base --is-ancestor <prev-branch> master`); otherwise stop ("merge <prev-branch> into master first: git switch master && git merge --no-ff <prev-branch>"). Then `git switch master && git switch -c <branch>` and set branchCreated=true.',
    )
    lines.push(
      '7. Unless this is a rework, run `node scripts/progress.mjs set <ID> in-progress`. If the target\'s phase has status todo, run `node scripts/progress.mjs phase <P#> active`. Do NOT commit these tracker changes; they go into the task commit.',
    )
    lines.push(
      '8. Return action "run" with taskId, title, phaseId, branch, branchCreated, approved, and taskSection = the full output of `node scripts/progress.mjs show <ID>`.',
    )
  }
  if (A.dryRun) {
    lines.push(
      'DRY RUN: run read-only commands only (steps 1, 4, 5 and a branch-existence check). Do NOT commit, switch or create branches, or change the tracker. Return action "stop" with reason "dry run: would run <ID> <title> on <branch> (exists | would be created from master)" or the reason nothing would run.',
    )
  }
  return lines.join('\n')
}

const planPrompt = (prep) =>
  [
    'BUILD-PHASE › PLAN',
    taskBlock(prep),
    'Read the docs/spec.md and docs/design/ sections the task references, the matching phase in docs/history/phases-0-6.md for bugs already met in that area, the last ~20 lines of docs/memory/LEARNINGS.md, and the code you will touch. Load the skills named on the task\'s Skills line. Produce the plan per your role, and map EVERY acceptance criterion to its proof.',
    A.allowLarge
      ? 'The human asked to run this task as one piece: leave proposedSplit empty.'
      : 'Size check first: if the task covers more than one concern, or its diff would be too large for a human to review in one pass, fill proposedSplit with the smaller tasks and keep the rest of the plan brief.',
  ].join('\n\n')

const implementPrompt = (prep, plan) =>
  [
    'BUILD-PHASE › IMPLEMENT',
    taskBlock(prep),
    `PLAN (from the planner):\n${JSON.stringify(plan, null, 2)}`,
    'Implement exactly this task on the current branch. Tests first for logic. Run the checks until green and report every command you ran with its result. Do not commit. Do not edit docs/PROGRESS.md or docs/memory/*; report learnings and decisions in your output instead.',
  ].join('\n\n')

const verifyPrompt = (prep, plan, impl) =>
  [
    'BUILD-PHASE › VERIFY (independent; do not edit files)',
    taskBlock(prep),
    `The implementer reports:\n${JSON.stringify({ summary: impl.summary, filesChanged: impl.filesChanged, testsAdded: impl.testsAdded, checks: impl.checks }, null, 2)}`,
    `The planner's acceptance map:\n${JSON.stringify(plan.acceptanceMap || [], null, 2)}`,
    "Don't trust these reports. Re-run the checks yourself, prove every acceptance criterion with evidence, and flag changes outside the task's scope. The task's changes are uncommitted: inspect them with `git status` and `git diff HEAD`.",
  ].join('\n\n')

const reviewPrompt = (prep, impl) =>
  [
    'BUILD-PHASE › REVIEW (read-only)',
    taskBlock(prep),
    `Files the implementer says it changed: ${(impl.filesChanged || []).join(', ') || '(see git status)'}`,
    "Review this task's uncommitted change: `git status`, `git diff HEAD`, and read new untracked files. Earlier commits on the branch were already reviewed. Must-fix only for real defects (see your role); everything else is a suggestion.",
  ].join('\n\n')

const fixPrompt = (prep, problems, round) =>
  [
    `BUILD-PHASE › FIX round ${round}/${MAX_FIX_ROUNDS}`,
    taskBlock(prep),
    `Problems found by the verifier and reviewer:\n${numbered(problems)}`,
    'Fix every problem with the smallest correct change, re-run the checks, and report. Do not commit; do not edit docs/PROGRESS.md or docs/memory/*.',
  ].join('\n\n')

const reverifyPrompt = (prep, problems, round) =>
  [
    `BUILD-PHASE › RE-VERIFY after fix round ${round} (do not edit files)`,
    taskBlock(prep),
    `Previously reported problems:\n${numbered(problems)}`,
    'Re-run all checks, re-prove every acceptance criterion, and confirm each previously reported problem is really resolved (read the code, not just the tests). List anything unresolved in failures.',
  ].join('\n\n')

const rereviewPrompt = (prep, problems, round) =>
  [
    `BUILD-PHASE › RE-REVIEW after fix round ${round} (read-only)`,
    taskBlock(prep),
    `Problems the fix was meant to resolve:\n${numbered(problems)}`,
    "Review this task's whole uncommitted change again (`git status`, `git diff HEAD`, new untracked files), starting with what the fix touched. Must-fix only for real defects that are still present or newly introduced.",
  ].join('\n\n')

function recordPassPrompt(prep, r) {
  const fixes = r.fixes || []
  const learnings = [...(r.impl.learnings || []), ...fixes.flatMap((f) => f.learnings || [])]
  const decisions = [...(r.impl.decisions || []), ...fixes.flatMap((f) => f.decisions || [])]
  const openIssues = [...(r.impl.openIssues || []), ...fixes.flatMap((f) => f.openIssues || [])]
  const evidence = (r.ver.criteria || [])
    .map((c) => `- ${c.met ? 'met' : c.needsHuman ? 'needs human' : 'NOT met'}: ${c.criterion}: ${c.evidence}`)
    .join('\n')
  return [
    `BUILD-PHASE › RECORD (task passed verification${r.rounds ? ` after ${r.rounds} fix round(s)` : ''})`,
    `Task ${prep.taskId}: ${prep.title} · phase ${prep.phaseId} · branch ${prep.branch}${prep.reworkFeedback ? ' · REWORK' : ''}`,
    `Implementation summary: ${r.impl.summary}`,
    `Acceptance evidence:\n${evidence}`,
    `Review suggestions (non-blocking): ${JSON.stringify((r.rev && r.rev.suggestions) || [])}`,
    `Learnings to append: ${JSON.stringify(learnings)}`,
    `Decisions to log: ${JSON.stringify(decisions)}`,
    `Follow-up work the implementer reported: ${JSON.stringify(openIssues)}. Add each genuinely needed item as a task with \`node scripts/progress.mjs add ${prep.phaseId} "<title>" --scope "<detail>"\`. Mention the rest in the handoff.`,
    'Steps:',
    `1. Append the learnings to docs/memory/LEARNINGS.md and the decisions to docs/memory/DECISIONS.md ("During the build"), dated with \`date +%F\`, tagged [${prep.taskId}], skipping duplicates.`,
    `2. \`node scripts/progress.mjs set ${prep.taskId} review --note "<≤120-char summary>"\`.`,
    '3. Rewrite docs/memory/HANDOFF.md, keeping its headings: Now (phase, branch, "<ID> in review"), Last change (2–4 bullets), Next up (the task `node scripts/progress.mjs next` would pick once this one is approved), Waiting on you (review of this task + pending human tasks), Open suggestions (review suggestions + follow-ups that did not become tasks), Blockers.',
    '4. `git add -A`, then `git diff --cached --name-only`, and unstage anything matching .env* (except .env.example), *.pem, *.key, playwright-report/ or test-results/.',
    `5. Commit once: \`git commit -m "${prep.taskId}: ${prep.title}${prep.reworkFeedback ? ' (rework)' : ''}" -m "<2–5 lines: what changed and the acceptance evidence>" -m "${TRAILER}"\`.`,
    tierOf(prep) === 'deep'
      ? '6. Return status "review", the short sha from `git rev-parse --short HEAD`, a 2–3 sentence summary, and next. This is a DEEP-review task: the reviewChecklist starts with "Read the full diff: git show <sha>", then names the 2–4 riskiest files to read first and why, then 1–2 things to run.'
      : '6. Return status "review", the short sha from `git rev-parse --short HEAD`, a 2–3 sentence summary, and next. This is a LIGHT-review task: the reviewChecklist is 3–6 concrete things to run or click (with commands); a full diff read is optional.',
  ].join('\n\n')
}

function recordBlockedPrompt(prep, r) {
  const learnings = [...((r.impl && r.impl.learnings) || [])]
  return [
    'BUILD-PHASE › RECORD (task blocked: needs the human)',
    `Task ${prep.taskId}: ${prep.title} · phase ${prep.phaseId} · branch ${prep.branch}`,
    `Why it is blocked:\n${numbered(r.blocked)}`,
    `Learnings so far: ${JSON.stringify(learnings)}`,
    'Steps:',
    `1. \`node scripts/progress.mjs set ${prep.taskId} blocked --note "<≤200 chars: what is needed from the human>"\`.`,
    '2. Append genuine learnings to docs/memory/LEARNINGS.md (dated with `date +%F`, tagged).',
    `3. Rewrite docs/memory/HANDOFF.md, keeping its headings: Now (${prep.taskId} blocked), what was attempted, the exact questions or failures, and what the human should do next (answer or fix, then say "run task ${prep.taskId}").`,
    `4. Commit ONLY the docs changes: \`git add docs && git commit -m "${prep.taskId}: blocked (tracker and handoff)" -m "${TRAILER}"\`. Leave any code changes uncommitted so the human can inspect them.`,
    '5. Return status "blocked", the short commit sha, a summary, and a reviewChecklist of what the human should do.',
  ].join('\n\n')
}

const gateVerifyPrompt = (prep) =>
  [
    `BUILD-PHASE › GATE VERIFY ${prep.phaseId} (do not edit files)`,
    `<<<PHASE\n${prep.taskSection}\nPHASE>>>`,
    'Run the full check set: `npm run check`, `npm run e2e`, `npm ls @tanstack/react-table` (must print 8.21.3) and `node scripts/progress.mjs --check`. Prove each exit criterion with evidence. Criteria that need a human (the owner looking at a screen, running the demo) → needsHuman, saying what to check.',
  ].join('\n\n')

const gateReviewPrompt = (prep) =>
  [
    `BUILD-PHASE › GATE REVIEW ${prep.phaseId} (read-only)`,
    `Review the whole phase: \`git diff master...${prep.branch}\`. Tasks were reviewed one by one, so focus on cross-task issues: invariants, security, consistency between modules, leftover TODOs or dead code, missing tests, and docs that drifted from the code.`,
  ].join('\n\n')

const gatePassPrompt = (prep, gv, gr) =>
  [
    `BUILD-PHASE › RECORD GATE PASS ${prep.phaseId}`,
    `Human checks still needed: ${JSON.stringify(humanChecks(gv))}`,
    `Suggestions: ${JSON.stringify((gr && gr.suggestions) || [])}`,
    `1. \`node scripts/progress.mjs phase ${prep.phaseId} done\`.`,
    `2. Rewrite docs/memory/HANDOFF.md: phase ${prep.phaseId} gate passed; list the human checks; next step is to merge (\`git switch master && git merge --no-ff ${prep.branch}\`), and then "run the build-phase workflow" starts the next phase.`,
    '3. Append gate learnings (if any) to docs/memory/LEARNINGS.md.',
    `4. \`git add docs && git commit -m "${prep.phaseId}: phase gate passed" -m "${TRAILER}"\`.`,
    '5. Return status "gate-passed", the short commit sha, a summary, and a reviewChecklist (the human checks + the merge command).',
  ].join('\n\n')

const gateFailPrompt = (prep, problems) =>
  [
    `BUILD-PHASE › RECORD GATE FAIL ${prep.phaseId}`,
    `Problems:\n${numbered(problems)}`,
    `1. Group the problems into a few fix tasks and add each with \`node scripts/progress.mjs add ${prep.phaseId} "Gate fix: <short title>" --scope "<details incl. file:line>" --acceptance "<how to prove it is fixed>"\`. Collect the new ids.`,
    `2. \`node scripts/progress.mjs phase ${prep.phaseId} active\`.`,
    '3. Rewrite docs/memory/HANDOFF.md: gate failed, the new tasks, and the next step ("run the build-phase workflow").',
    `4. \`git add docs && git commit -m "${prep.phaseId}: gate findings → fix tasks" -m "${TRAILER}"\`.`,
    '5. Return status "gate-failed", addedTasks, the short commit sha, and a summary.',
  ].join('\n\n')

// ---------------------------------------------------------------- flows

async function record(prep, r) {
  phase('Record')
  const blocked = Boolean(r.blocked && r.blocked.length)
  const rec = await run('recorder', blocked ? recordBlockedPrompt(prep, r) : recordPassPrompt(prep, r), {
    schema: RECORD_SCHEMA,
    effort: 'low',
    label: `record ${prep.taskId}`,
    phase: 'Record',
  })
  const status = rec ? rec.status : blocked ? 'blocked' : 'unrecorded'
  log(`${prep.taskId} → ${status}${rec && rec.commit ? ` (${rec.commit})` : ''}`)
  const tier = tierOf(prep)
  const continueHint =
    status === 'review'
      ? `${tier === 'deep' ? 'Deep review: read the full diff' : 'Light review: run the checklist and skim the diff'} with git show ${(rec && rec.commit) || 'HEAD'}. Then say "approve" (marks ${prep.taskId} done and runs the next task) or "rework ${prep.taskId}: <feedback>".`
      : status === 'blocked'
        ? `Resolve the blocker(s), then say "run task ${prep.taskId}". Partial code changes (if any) were left uncommitted for you to inspect (git status, git diff).`
        : 'The recorder did not finish. Check `git status` and `node scripts/progress.mjs`, then retry.'
  return {
    mode,
    task: prep.taskId,
    title: prep.title,
    phase: prep.phaseId,
    branch: prep.branch,
    approvedBeforeRun: prep.approved || [],
    status,
    reviewTier: tier,
    commit: (rec && rec.commit) || '',
    summary: (rec && rec.summary) || (r.impl && r.impl.summary) || '',
    blockedBecause: blocked ? r.blocked : [],
    acceptance: (r.ver && r.ver.criteria) || [],
    humanChecks: humanChecks(r.ver),
    suggestions: (r.rev && r.rev.suggestions) || [],
    reviewMissing: !r.rev && !blocked,
    fixRounds: r.rounds || 0,
    reviewChecklist: (rec && rec.reviewChecklist) || [],
    next: (rec && rec.next) || '',
    howToContinue: continueHint,
  }
}

async function runTask(prep) {
  const id = prep.taskId
  log(`${id}: ${prep.title} on ${prep.branch}${prep.branchCreated ? ' (new branch)' : ''}${prep.approved && prep.approved.length ? `; approved ${prep.approved.join(', ')}` : ''}`)

  phase('Plan')
  const plan = await run('planner', planPrompt(prep), { schema: PLAN_SCHEMA, label: `plan ${id}`, phase: 'Plan' })
  if (!plan) return record(prep, { blocked: [`The planner returned no result (agent error). Retry with "run task ${id}".`] })
  const humanNeeds = [...(plan.blockingQuestions || []), ...(plan.needsHumanSetup || [])]
  if (humanNeeds.length) {
    log(`${id}: planner needs the human (${humanNeeds.length} item(s))`)
    return record(prep, { blocked: humanNeeds, plan })
  }
  const split = A.allowLarge ? [] : plan.proposedSplit || []
  if (split.length) {
    log(`${id}: planner proposes a split into ${split.length} task(s)`)
    return record(prep, {
      blocked: [
        `The planner says ${id} will not fit one sitting and proposes this split:\n${numbered(split)}`,
        `To accept: narrow ${id}'s scope in its phase file to the first piece, add the others with \`node scripts/progress.mjs add ${prep.phaseId} "<title>" --scope "…" --acceptance "…" --depends ${id}\`, then run \`node scripts/progress.mjs set ${id} todo\` and "run the build-phase workflow". To run it as one piece instead, say "run task ${id} as is".`,
      ],
      plan,
    })
  }

  phase('Implement')
  const impl = await run('implementer', implementPrompt(prep, plan), { schema: IMPL_SCHEMA, label: `implement ${id}`, phase: 'Implement' })
  if (!impl) return record(prep, { blocked: ['The implementer returned no result (agent error); partial changes may be in the working tree.'], plan })
  if (impl.blocked) return record(prep, { blocked: [impl.blocked], plan, impl })

  phase('Verify')
  const [ver0, rev0] = await parallel([
    () => run('verifier', verifyPrompt(prep, plan, impl), { schema: VERIFY_SCHEMA, label: `verify ${id}`, phase: 'Verify' }),
    () => run('reviewer', reviewPrompt(prep, impl), { schema: REVIEW_SCHEMA, label: `review ${id}`, phase: 'Verify' }),
  ])
  let ver = ver0 || (await run('verifier', verifyPrompt(prep, plan, impl), { schema: VERIFY_SCHEMA, label: `verify ${id} (retry)`, phase: 'Verify' }))
  let rev = rev0 || (await run('reviewer', reviewPrompt(prep, impl), { schema: REVIEW_SCHEMA, label: `review ${id} (retry)`, phase: 'Verify' }))
  if (!rev) log(`${id}: reviewer unavailable; flagging for manual review`)

  // Deep tasks re-run the reviewer after every fix round, because a fix can introduce a new defect.
  const deep = tierOf(prep) === 'deep'
  let problems = collectProblems(ver, rev)
  let rounds = 0
  const fixes = []
  while (problems.length && rounds < MAX_FIX_ROUNDS) {
    rounds++
    log(`${id}: ${problems.length} problem(s) → fix round ${rounds}/${MAX_FIX_ROUNDS}`)
    phase('Fix')
    const fix = await run('implementer', fixPrompt(prep, problems, rounds), { schema: IMPL_SCHEMA, label: `fix ${id} #${rounds}`, phase: 'Fix' })
    if (fix) fixes.push(fix)
    const reverify = () => run('verifier', reverifyPrompt(prep, problems, rounds), { schema: VERIFY_SCHEMA, label: `re-verify ${id} #${rounds}`, phase: 'Fix' })
    if (!deep) {
      ver = await reverify()
      problems = collectProblems(ver, null)
      continue
    }
    const [ver2, rev2] = await parallel([
      reverify,
      () => run('reviewer', rereviewPrompt(prep, problems, rounds), { schema: REVIEW_SCHEMA, label: `re-review ${id} #${rounds}`, phase: 'Fix' }),
    ])
    ver = ver2
    if (rev2) {
      rev = { mustFix: rev2.mustFix || [], suggestions: [...new Set([...((rev && rev.suggestions) || []), ...(rev2.suggestions || [])])] }
    } else {
      log(`${id}: re-review #${rounds} returned no result; the verifier's result stands alone for this round`)
    }
    problems = collectProblems(ver, rev2)
  }
  if (problems.length) {
    return record(prep, { blocked: problems.map((p) => `Unresolved after ${rounds} fix round(s): ${p}`), plan, impl, ver, rev, rounds, fixes })
  }
  return record(prep, { plan, impl, ver, rev, rounds, fixes })
}

async function runGate(prep) {
  const pid = prep.phaseId
  log(`Phase gate ${pid} on ${prep.branch}`)
  phase('Verify')
  const [gv, gr] = await parallel([
    () => run('verifier', gateVerifyPrompt(prep), { schema: VERIFY_SCHEMA, label: `gate verify ${pid}`, phase: 'Verify' }),
    () => run('reviewer', gateReviewPrompt(prep), { schema: REVIEW_SCHEMA, label: `gate review ${pid}`, phase: 'Verify' }),
  ])
  const problems = collectProblems(gv, gr)
  phase('Record')
  const rec = await run('recorder', problems.length ? gateFailPrompt(prep, problems) : gatePassPrompt(prep, gv, gr), {
    schema: RECORD_SCHEMA,
    effort: 'low',
    label: `record gate ${pid}`,
    phase: 'Record',
  })
  const status = rec ? rec.status : problems.length ? 'gate-failed' : 'unrecorded'
  log(`gate ${pid} → ${status}`)
  return {
    mode: 'gate',
    phase: pid,
    branch: prep.branch,
    status,
    problems,
    addedTasks: (rec && rec.addedTasks) || [],
    humanChecks: humanChecks(gv),
    suggestions: (gr && gr.suggestions) || [],
    commit: (rec && rec.commit) || '',
    summary: (rec && rec.summary) || '',
    howToContinue: problems.length
      ? `Gate failed: fix tasks were added to ${pid}. Say "run the build-phase workflow" to work through them, then run the gate again.`
      : `Gate passed. Confirm the human checks, then merge: git switch master && git merge --no-ff ${prep.branch}. After that, "run the build-phase workflow" starts the next phase.`,
  }
}

// ---------------------------------------------------------------- main

phase('Prepare')
const prep = await run('recorder', preparePrompt(), { schema: PREP_SCHEMA, effort: 'low', label: 'prepare', phase: 'Prepare' })
if (!prep) {
  return { mode, status: 'error', message: 'The prepare agent returned no result. Check `git status` and `node scripts/progress.mjs`, then retry.' }
}
if (prep.action === 'stop') {
  log(`stopped: ${prep.reason}`)
  return { mode, status: 'stopped', reason: prep.reason, approved: prep.approved || [], notes: prep.notes || '' }
}
if (prep.action === 'gate') return await runGate(prep)
return await runTask(prep)
