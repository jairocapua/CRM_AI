import type { Cents, CurrencyCode } from "@/types";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Tabular figures keep columns of money vertically aligned in tables and stage
 * rollups; proportional figures are fine for one-off headline numbers.
 */
export function Money({
  cents,
  currency = "USD",
  compact = false,
  tabular = true,
  className,
}: {
  cents: Cents;
  currency?: CurrencyCode;
  compact?: boolean;
  tabular?: boolean;
  className?: string;
}) {
  return (
    <span className={cn(tabular && "tabular-nums", className)}>
      {formatMoney(cents, currency, { compact })}
    </span>
  );
}
