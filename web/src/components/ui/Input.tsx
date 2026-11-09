import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

const base =
  "h-12 rounded border bg-surface-overlay px-3 text-text-primary focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-50";

const normal = "border-border-subtle focus:border-volt focus-visible:outline-volt";
// DESIGN.md no define el foco con error: se propone rojo, como el Button destructive.
const invalid = "border-rpe-max focus:border-rpe-max focus-visible:outline-rpe-max";

export function Input({ className, ...props }: ComponentProps<"input">) {
  const isInvalid = props["aria-invalid"] === true || props["aria-invalid"] === "true";
  return <input className={cn(base, isInvalid ? invalid : normal, className)} {...props} />;
}
