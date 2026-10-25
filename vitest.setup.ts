import { afterEach, vi } from "vitest";

/**
 * Loaded here, while `Date` is still the real one. `TZDate extends Date`
 * binds to whatever `Date` is global when the module first evaluates; under
 * `vi.useFakeTimers()` that is the fake clock's `Date`, whose constructor
 * returns a plain `Date`, so every `TZDate` would silently lose its zone and
 * read the runtime's local fields instead (right in UTC by coincidence, a day
 * off from Asia). The package is external to Vitest's module registry, so
 * `vi.resetModules()` keeps this copy.
 */
import "@date-fns/tz";

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
