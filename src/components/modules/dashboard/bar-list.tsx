import { cn } from "@/lib/utils";

export interface BarListItem {
  key: string;
  label: React.ReactNode;
  /** Optional mark before the label, e.g. the stage's board colour. */
  leading?: React.ReactNode;
  /** 0–1, relative to the widest row. */
  fraction: number;
  /** Direct label: the row's figures, in text ink. */
  value: React.ReactNode;
}

/**
 * Horizontal magnitude bars in one hue, each directly labelled. One series
 * needs no legend, and the labels make the list its own table view.
 *
 * The bar sits under its label rather than beside it: in a third-width card a
 * three-column row left the bar column zero pixels wide.
 */
export function BarList({
  items,
  className,
}: {
  items: BarListItem[];
  className?: string;
}) {
  return (
    <ul className={cn("flex flex-col gap-3", className)}>
      {items.map((item) => (
        <li key={item.key} className="flex flex-col gap-1.5 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              {item.leading}
              <span className="truncate">{item.label}</span>
            </span>
            <span className="shrink-0 text-muted-foreground tabular-nums">
              {item.value}
            </span>
          </div>
          <span
            className="h-1.5 overflow-hidden rounded-full bg-muted"
            aria-hidden
          >
            <span
              className="block h-full rounded-full bg-chart-1"
              style={{ width: `${Math.max(0, item.fraction) * 100}%` }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}
