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
