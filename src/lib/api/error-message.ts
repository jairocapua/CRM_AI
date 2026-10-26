import { ApiError } from "./http";

/**
 * The sentence a failed call shows the user: the API's own message for an
 * `ApiError` (a 503 from the failure-rate slider, a 409 refusal, a 422 on a
 * field), else `fallback`. Anything else thrown is a bug, and its text is
 * not written for users, so it never reaches the screen.
 */
export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}
