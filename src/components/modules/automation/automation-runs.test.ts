import { describe, expect, it } from "vitest";

import type { RunStatus, WorkflowRun } from "@/types";

import {
  formatSpan,
  keepSortMarked,
  runDuration,
  runStatusCopy,
  runStatuses,
  runStepNotes,
} from "./automation-runs";

/**
 * Run history on the detail page (`/automation/[id]`): the table's status
 * and duration copy, and the run sheet's per-step marks for
 * `AutomationStepList`. Pure functions over the `WorkflowRun` that
 * `api.workflows.listRuns` returns, pinned here.
 */

function run(overrides: Partial<WorkflowRun> = {}): WorkflowRun {
  return {
    id: "run_1",
    workflowId: "wf_speed_to_lead",
    contactId: "con_1",
    status: "failed",
    startedAt: "2026-09-01T10:00:00.000Z",
    endedAt: "2026-09-01T10:31:20.000Z",
    steps: [
      {
        nodeId: "trigger",
        at: "2026-09-01T10:00:00.000Z",
        status: "ok",
        detail: "Enrolled",
      },
      { nodeId: "wait_30m", at: "2026-09-01T10:00:40.000Z", status: "ok" },
      {
        nodeId: "send_sms",
        at: "2026-09-01T10:31:20.000Z",
        status: "failed",
        detail: "SMS not delivered",
      },
    ],
    error: "The carrier rejected the SMS.",
    ...overrides,
  };
}

describe("keepSortMarked", () => {
  it("flips newest first to oldest first when TanStack clears the sort", () => {
    expect(keepSortMarked([{ id: "startedAt", desc: true }], [])).toEqual([
      { id: "startedAt", desc: false },
    ]);
  });

  it("flips oldest first to newest first when TanStack clears the sort", () => {
    expect(keepSortMarked([{ id: "startedAt", desc: false }], [])).toEqual([
      { id: "startedAt", desc: true },
    ]);
  });

  it("passes any other sorting through unchanged", () => {
    const next = [{ id: "startedAt", desc: true }];
    expect(keepSortMarked([{ id: "startedAt", desc: false }], next)).toBe(next);
  });
});

describe("runStatusCopy", () => {
  it("names every run status in plain words, with a badge style", () => {
    const statuses: RunStatus[] = ["completed", "failed", "active", "dropped"];
    expect(statuses.map((s) => runStatusCopy(s))).toEqual([
      { label: "Completed", variant: "secondary" },
      { label: "Failed", variant: "destructive" },
      { label: "Running", variant: "outline" },
      { label: "Stopped", variant: "outline" },
    ]);
  });
});

describe("runStatuses", () => {
  it("maps each step the run reached to its status, and nothing else", () => {
    const statuses = runStatuses(run());
    expect([...statuses]).toEqual([
      ["trigger", "ok"],
      ["wait_30m", "ok"],
      ["send_sms", "failed"],
    ]);
    // A step the run never reached has no status at all.
    expect(statuses.has("end:send_sms")).toBe(false);
  });

  it("gives a run with only its trigger one status", () => {
    const only = run({ steps: [run().steps[0]!] });
    expect([...runStatuses(only)]).toEqual([["trigger", "ok"]]);
  });

  it("leaves the step a running run sits in unmarked: it is not done yet", () => {
    const steps = run().steps.slice(0, 2);
    steps[1] = { ...steps[1]!, detail: "Waiting" };
    const running = run({ status: "active", endedAt: undefined, steps });
    expect([...runStatuses(running)]).toEqual([["trigger", "ok"]]);
    // Its note still says where it is.
    expect(runStepNotes(running, () => "now").get("wait_30m")).toBe(
      "Waiting · now",
    );
  });
});

describe("runStepNotes", () => {
  const at = (iso: string) => `at ${iso.slice(11, 16)}`;

  it("gives each reached step its detail and time, or just the time", () => {
    expect([...runStepNotes(run(), at)]).toEqual([
      ["trigger", "Enrolled · at 10:00"],
      ["wait_30m", "at 10:00"],
      ["send_sms", "SMS not delivered · at 10:31"],
    ]);
  });

  it("leaves unreached steps out", () => {
    const notes = runStepNotes(run({ steps: [run().steps[0]!] }), at);
    expect([...notes.keys()]).toEqual(["trigger"]);
  });
});

describe("formatSpan", () => {
  it.each([
    [0, "0 sec"],
    [45_000, "45 sec"],
    [59_999, "59 sec"],
    [60_000, "1 min"],
    [31 * 60_000 + 20_000, "31 min"],
    [60 * 60_000, "1 hr"],
    [2 * 60 * 60_000 + 5 * 60_000, "2 hr 5 min"],
    [24 * 60 * 60_000, "1 day"],
    [2 * 24 * 60 * 60_000 + 3 * 60 * 60_000 + 59 * 60_000, "2 days 3 hr"],
    [5 * 24 * 60 * 60_000, "5 days"],
  ])("%i ms reads %s", (ms, text) => {
    expect(formatSpan(ms)).toBe(text);
  });

  it("never reads negative", () => {
    expect(formatSpan(-5_000)).toBe("0 sec");
  });
});

describe("runDuration", () => {
  it("measures a finished run from its start to its end", () => {
    expect(runDuration(run())).toBe("31 min");
  });

  it("says a run without an end is in progress", () => {
    expect(runDuration(run({ status: "active", endedAt: undefined }))).toBe(
      "In progress",
    );
  });
});
