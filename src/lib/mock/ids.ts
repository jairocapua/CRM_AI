import { customAlphabet } from "nanoid";

/** URL-safe, no lookalike characters — ids show up in the UI during demos. */
const nano = customAlphabet("0123456789abcdefghijkmnpqrstuvwxyz", 12);

export function newId(prefix: string): string {
  return `${prefix}_${nano()}`;
}
