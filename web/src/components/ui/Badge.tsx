import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

const base = "inline-flex items-center rounded-full border px-2 py-1 font-heading text-label-caps uppercase";

// Whole class names, not built with a template string: Tailwind only generates classes it can read
const variants = {
  rodaje: "border-session-rodaje bg-session-rodaje/12 text-session-rodaje",
  intervalos: "border-session-intervalos bg-session-intervalos/12 text-session-intervalos",
  cuestas: "border-session-cuestas bg-session-cuestas/12 text-session-cuestas",
  "tirada-larga": "border-session-tirada-larga bg-session-tirada-larga/12 text-session-tirada-larga",
  fartlek: "border-session-fartlek bg-session-fartlek/12 text-session-fartlek",
  warning: "border-volume-alert bg-volume-alert/12 text-volume-alert",
};

type Props = ComponentProps<"span"> & {
  variant: keyof typeof variants;
};

export function Badge({ variant, className, ...props }: Props) {
  return <span className={cn(base, variants[variant], className)} {...props} />;
}
