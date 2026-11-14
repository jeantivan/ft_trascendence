import type { ComponentProps } from "react";
import type { SessionType } from "@/generated/prisma/client";
import { cn } from "@/lib/cn";

const base = "rounded-lg border border-border-subtle bg-surface-elevated p-6";

// Whole class names, not built with a template string: Tailwind only generates classes it can read
const accents: Record<SessionType, string> = {
  rodaje: "border-l-4 border-l-session-rodaje",
  intervalos: "border-l-4 border-l-session-intervalos",
  cuestas: "border-l-4 border-l-session-cuestas",
  tirada_larga: "border-l-4 border-l-session-tirada-larga",
  fartlek: "border-l-4 border-l-session-fartlek",
};

type Props = ComponentProps<"div"> & {
  as?: "div" | "section";
  accent?: SessionType;
};

export function Card({ as: Tag = "div", accent, className, ...props }: Props) {
  return <Tag className={cn(base, accent && accents[accent], className)} {...props} />;
}
