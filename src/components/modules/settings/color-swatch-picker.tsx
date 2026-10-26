"use client";

import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { CheckIcon } from "lucide-react";

import type { TagColor } from "@/types";
import { TAG_COLOR_LABELS, TAG_COLORS, TAG_DOT_CLASSES } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * The chosen swatch's tick: dark on the light swatches, where white falls
 * under 3:1 (orange 2.9, amber 2.2, green 2.2, teal 2.4, sky 2.7; slate-950
 * gives 7 to 9.4), white on the rest (3.6 and up).
 */
const TICK_CLASSES: Record<TagColor, string> = {
  slate: "text-white",
  red: "text-white",
  orange: "text-slate-950",
  amber: "text-slate-950",
  green: "text-slate-950",
  teal: "text-slate-950",
  sky: "text-slate-950",
  indigo: "text-white",
  violet: "text-white",
  pink: "text-white",
};

/**
 * Picks one of the tag colours (`TAG_COLORS`) as a row of swatches: a radio
 * group, so Tab reaches it once and the arrow keys move between colours.
 * Each swatch is named after its colour (`TAG_COLOR_LABELS`, "Teal"); the
 * chosen one shows a ring and a tick. Name the group with `aria-labelledby`
 * (a legend's id). The stage dialog uses it, and the tags manager is meant
 * to.
 */
export function ColorSwatchPicker({
  value,
  onValueChange,
  onBlur,
  labelledBy,
  describedBy,
  invalid = false,
  disabled = false,
}: {
  value: TagColor;
  onValueChange: (color: TagColor) => void;
  onBlur?: () => void;
  labelledBy: string;
  describedBy?: string;
  invalid?: boolean;
  disabled?: boolean;
}) {
  return (
    <RadioGroup
      value={value}
      onValueChange={(next) => onValueChange(next as TagColor)}
      disabled={disabled}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      onBlur={onBlur}
      className="flex flex-wrap gap-2"
    >
      {TAG_COLORS.map((color) => (
        <Radio.Root
          key={color}
          value={color}
          aria-label={TAG_COLOR_LABELS[color]}
          className={cn(
            "relative grid size-8 place-items-center rounded-full outline-none",
            "ring-offset-2 ring-offset-background transition-shadow",
            "data-checked:ring-2 data-checked:ring-foreground",
            "focus-visible:ring-3 focus-visible:ring-ring/60",
            "data-disabled:cursor-not-allowed data-disabled:opacity-50",
          )}
        >
          <span
            aria-hidden
            className={cn("size-7 rounded-full", TAG_DOT_CLASSES[color])}
          />
          <Radio.Indicator className="absolute inset-0 grid place-items-center">
            <CheckIcon
              aria-hidden
              className={cn("size-4", TICK_CLASSES[color])}
            />
          </Radio.Indicator>
        </Radio.Root>
      ))}
    </RadioGroup>
  );
}
