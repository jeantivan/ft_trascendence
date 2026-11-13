import { cn } from "@/lib/cn";

const base =
  "inline-flex w-10 items-center justify-center rounded-full border py-1 font-heading text-label-badge tabular-nums";

// Whole class names, not built with a template string: Tailwind only generates classes it can read
const tiers = {
  low: "border-rpe-low bg-rpe-low/12 text-rpe-low",
  moderate: "border-rpe-moderate bg-rpe-moderate/12 text-rpe-moderate",
  hard: "border-rpe-hard bg-rpe-hard/12 text-rpe-hard",
  max: "border-rpe-max bg-rpe-max/12 text-rpe-max",
};

// A union and not "number": a 0 or an 11 does not compile
export type RpeValue = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

type Props = {
  value: RpeValue;
  className?: string;
};

function tierOf(value: RpeValue) {
  if (value <= 3) return tiers.low;
  if (value <= 6) return tiers.moderate;
  if (value <= 8) return tiers.hard;
  return tiers.max;
}

// Only paints the value it receives: RPE is health data, so no logs or effects here
export function RpeBadge({ value, className }: Props) {
  return (
    <span aria-label={`RPE ${value}`} className={cn(base, tierOf(value), className)}>
      {value}
    </span>
  );
}
