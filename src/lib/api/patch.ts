import type { z } from "zod";

import { ApiError } from "./http";

/**
 * Helpers the API modules share for turning a caller's patch into a stored
 * record. Private to `src/lib/api/`: the barrel does not re-export them.
 */

/**
 * `value` without the keys whose value is `undefined`. JSON drops such keys
 * on the way to a server (`JSON.stringify({ timezone: undefined })` is "{}"),
 * so a `fetch()` client could never send them. `update()` runs this on the
 * parsed patch, so a spread can never write `undefined` over a stored value.
 */
export function withoutUndefined<T extends object>(
  value: T,
): { [K in keyof T]?: Exclude<T[K], undefined> } {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as { [K in keyof T]?: Exclude<T[K], undefined> };
}

/**
 * `patch` parsed by `schema`, or a 422 `code` about its first problem. The
 * error's `message` is the schema's own sentence for that field ("Enter a
 * first name."), and its `field` the key it is about. A problem that is
 * about no one field (a patch that is not an object) says `fallback`, with
 * `field` unset. zod's built-in wording for a wrong type never shows: a
 * per-parse error map ranks below every message the schema sets, so it
 * replaces only those with "Not a valid value.".
 */
export function parsePatch<S extends z.ZodType>(
  schema: S,
  patch: unknown,
  code: string,
  fallback: string,
): z.output<S> {
  const checked = schema.safeParse(patch, {
    error: () => "Not a valid value.",
  });
  if (checked.success) return checked.data;
  const [issue] = checked.error.issues;
  if (!issue || issue.path.length === 0) {
    throw new ApiError(fallback, 422, code);
  }
  throw new ApiError(issue.message, 422, code, issue.path.join("."));
}

/**
 * Removes each of `keys` whose value is the empty string from `record`, in
 * place, and returns it: how a form's emptied optional field ("no phone")
 * becomes an absent key rather than a stored "".
 */
export function withoutEmpty<T extends object>(
  record: T,
  keys: readonly (keyof T)[],
): T {
  for (const key of keys) {
    if (record[key] === "") delete record[key];
  }
  return record;
}
