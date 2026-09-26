import type { ID } from "./common";

export type FilterOperator =
  | "eq"
  | "neq"
  | "contains"
  | "notContains"
  | "startsWith"
  | "endsWith"
  | "in"
  | "notIn"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "isEmpty"
  | "isNotEmpty"
  | "before"
  | "after"
  | "inLastDays";

export interface FilterCondition {
  id: ID;
  /** Dot path: "status" | "tagIds" | "customFields.budget_range" */
  field: string;
  operator: FilterOperator;
  value?: unknown;
}

export interface FilterGroup {
  id: ID;
  combinator: "and" | "or";
  conditions: (FilterCondition | FilterGroup)[];
}

export function isFilterGroup(
  node: FilterCondition | FilterGroup,
): node is FilterGroup {
  return "combinator" in node;
}

export interface SortSpec {
  field: string;
  desc: boolean;
}
