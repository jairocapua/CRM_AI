import { afterEach, vi } from "vitest";

/**
 * Every test file runs in UTC unless a test sets its own zone with
 * `vi.stubEnv("TZ", ...)`. The zone is assigned at runtime because that is the
 * form Node honours everywhere: an inline `TZ=UTC vitest` in an npm script is
 * not valid under cmd.exe, which is what npm uses on Windows, and a shell `TZ`
 * does not always reach Node from Git Bash. This file must not import any app
 * module: `clock.ts` captures the time when it loads (see `mock/testing.ts`).
 */
process.env.TZ = "UTC";

// A fake clock left installed by one test must never leak into the next.
afterEach(() => {
  vi.useRealTimers();
});
