import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";
import { rpeTierOf, type RpeValue } from "@/lib/training/rpe";

export type { RpeValue };

const base =
  "inline-flex items-center justify-center rounded-full border font-heading text-label-badge tabular-nums";

// Circle for a standalone number, pill when it sits next to text
const shapes = {
  circle: "size-7",
  pill: "w-10 py-1",
};

// Whole class names, not built with a template string: Tailwind only generates classes it can read
const tiers = {
  low: "border-rpe-low bg-rpe-low/12 text-rpe-low",
  moderate: "border-rpe-moderate bg-rpe-moderate/12 text-rpe-moderate",
  hard: "border-rpe-hard bg-rpe-hard/12 text-rpe-hard",
  max: "border-rpe-max bg-rpe-max/12 text-rpe-max",
};

// No children: the badge always shows its own value
type Props = Omit<ComponentProps<"span">, "children"> & {
  value: RpeValue;
  shape?: keyof typeof shapes;
};

// Only paints the value it receives: RPE is health data, so no logs or effects here
export function RpeBadge({ value, shape = "circle", className, ...props }: Props) {
  return (
    <span
      aria-label={`RPE ${value}`}
      className={cn(base, shapes[shape], tiers[rpeTierOf(value)], className)}
      {...props}
    >
      {value}
    </span>
  );
}
