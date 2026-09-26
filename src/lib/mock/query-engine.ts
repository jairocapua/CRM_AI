import {
  isFilterGroup,
  type FilterCondition,
  type FilterGroup,
  type SortSpec,
} from "@/types";
import { apiNowMs } from "./clock";

/** Resolves "customFields.budget_range" against an object. */
export function getPath(obj: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (acc, key) =>
        acc && typeof acc === "object"
          ? (acc as Record<string, unknown>)[key]
          : undefined,
      obj,
    );
}

function asTime(value: unknown): number {
  if (typeof value === "string" || typeof value === "number") {
    const t = new Date(value).getTime();
    return Number.isNaN(t) ? Number.NaN : t;
  }
  return Number.NaN;
}

function asText(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) return value.join(" ");
  return String(value);
}

function isEmpty(value: unknown): boolean {
  if (value == null || value === "") return true;
  return Array.isArray(value) && value.length === 0;
}

export function evaluateCondition(
  item: unknown,
  condition: FilterCondition,
): boolean {
  const actual = getPath(item, condition.field);
  const expected = condition.value;

  switch (condition.operator) {
    case "eq":
      return Array.isArray(actual)
        ? actual.includes(expected as never)
        : actual === expected;
    case "neq":
      return Array.isArray(actual)
        ? !actual.includes(expected as never)
        : actual !== expected;
    case "contains":
      return asText(actual)
        .toLowerCase()
        .includes(asText(expected).toLowerCase());
    case "notContains":
      return !asText(actual)
        .toLowerCase()
        .includes(asText(expected).toLowerCase());
    case "startsWith":
      return asText(actual)
        .toLowerCase()
        .startsWith(asText(expected).toLowerCase());
    case "endsWith":
      return asText(actual)
        .toLowerCase()
        .endsWith(asText(expected).toLowerCase());
    /**
     * `in` means "the item's value is one of these". When the field is itself a
     * list (tagIds), it means "shares at least one" — which is what a tag
     * filter should do.
     */
    case "in": {
      const set = Array.isArray(expected) ? expected : [expected];
      return Array.isArray(actual)
        ? actual.some((v) => set.includes(v as never))
        : set.includes(actual as never);
    }
    case "notIn": {
      const set = Array.isArray(expected) ? expected : [expected];
      return Array.isArray(actual)
        ? !actual.some((v) => set.includes(v as never))
        : !set.includes(actual as never);
    }
    case "gt":
      return Number(actual) > Number(expected);
    case "gte":
      return Number(actual) >= Number(expected);
    case "lt":
      return Number(actual) < Number(expected);
    case "lte":
      return Number(actual) <= Number(expected);
    case "isEmpty":
      return isEmpty(actual);
    case "isNotEmpty":
      return !isEmpty(actual);
    case "before": {
      const a = asTime(actual);
      const b = asTime(expected);
      return !Number.isNaN(a) && !Number.isNaN(b) && a < b;
    }
    case "after": {
      const a = asTime(actual);
      const b = asTime(expected);
      return !Number.isNaN(a) && !Number.isNaN(b) && a > b;
    }
    case "inLastDays": {
      const a = asTime(actual);
      if (Number.isNaN(a)) return false;
      const days = Number(expected);
      // The demo clock, not the wall clock — a smart list filtering on
      // "added in the last 7 days" has to measure against the seeded world.
      return a >= apiNowMs() - days * 86_400_000;
    }
    default:
      return true;
  }
}

export function evaluateGroup(item: unknown, group: FilterGroup): boolean {
  if (group.conditions.length === 0) return true;
  const results = group.conditions.map((node) =>
    isFilterGroup(node)
      ? evaluateGroup(item, node)
      : evaluateCondition(item, node),
  );
  return group.combinator === "and"
    ? results.every(Boolean)
    : results.some(Boolean);
}

function compare(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return -1;
  if (b == null) return 1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean")
    return Number(a) - Number(b);
  const as = String(a);
  const bs = String(b);
  // ISO timestamps sort correctly as strings, so no date special-case needed.
  return as.localeCompare(bs, "en", { numeric: true, sensitivity: "base" });
}

export function sortRows<T>(rows: T[], sort: SortSpec[]): T[] {
  if (sort.length === 0) return rows;
  return [...rows].sort((a, b) => {
    for (const spec of sort) {
      const result = compare(getPath(a, spec.field), getPath(b, spec.field));
      if (result !== 0) return spec.desc ? -result : result;
    }
    return 0;
  });
}

export interface ListQuery {
  q?: string;
  filter?: FilterGroup;
  sort?: SortSpec[];
  /** 1-based. */
  page?: number;
  pageSize?: number;
  ids?: string[];
}

export interface Page<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export function applyQuery<T>(
  source: T[],
  query: ListQuery,
  opts: { searchFields?: string[]; defaultSort?: SortSpec[] } = {},
): Page<T> {
  let rows = source;

  if (query.ids) {
    const wanted = new Set(query.ids);
    rows = rows.filter((row) => wanted.has(getPath(row, "id") as string));
  }

  if (query.filter) {
    rows = rows.filter((row) => evaluateGroup(row, query.filter!));
  }

  const term = query.q?.trim().toLowerCase();
  if (term && opts.searchFields?.length) {
    rows = rows.filter((row) =>
      opts.searchFields!.some((field) =>
        asText(getPath(row, field)).toLowerCase().includes(term),
      ),
    );
  }

  rows = sortRows(rows, query.sort ?? opts.defaultSort ?? []);

  const total = rows.length;
  const pageSize = query.pageSize ?? total ?? 0;
  const pageCount = pageSize > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const page = Math.min(Math.max(1, query.page ?? 1), pageCount);

  if (query.pageSize) {
    const start = (page - 1) * pageSize;
    rows = rows.slice(start, start + pageSize);
  }

  return { rows, total, page, pageSize, pageCount };
}
