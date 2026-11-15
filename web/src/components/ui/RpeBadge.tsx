import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

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

// A union and not "number": a 0 or an 11 does not compile
export type RpeValue = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

// No children: the badge always shows its own value
type Props = Omit<ComponentProps<"span">, "children"> & {
  value: RpeValue;
  shape?: keyof typeof shapes;
};

function tierOf(value: RpeValue) {
  if (value <= 3) return tiers.low;
  if (value <= 6) return tiers.moderate;
  if (value <= 8) return tiers.hard;
  return tiers.max;
}

// Only paints the value it receives: RPE is health data, so no logs or effects here
export function RpeBadge({ value, shape = "circle", className, ...props }: Props) {
  return (
    <span
      aria-label={`RPE ${value}`}
      className={cn(base, shapes[shape], tierOf(value), className)}
      {...props}
    >
      {value}
    </span>
  );
}
