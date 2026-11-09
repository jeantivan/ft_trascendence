import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

const variants = {
  primary: "bg-volt text-surface-base hover:scale-[1.01] hover:shadow-button-glow",
  ghost:
    "border border-border-strong text-text-primary hover:border-volt hover:bg-volt/5 hover:text-volt",
  destructive: "border border-rpe-max bg-surface-overlay text-rpe-max hover:shadow-error-glow",
};

const base =
  "inline-flex h-12 items-center justify-center rounded px-6 font-heading font-bold transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-volt disabled:pointer-events-none disabled:opacity-50";

type Variant = keyof typeof variants;
type LinkProps = ComponentProps<typeof Link> & { variant?: Variant };
type NativeProps = ComponentProps<"button"> & { variant?: Variant; href?: undefined };

export function Button({ variant = "primary", className, ...props }: LinkProps | NativeProps) {
  const classes = cn(base, variants[variant], className);

  if (props.href !== undefined) {
    return <Link {...props} className={classes} />;
  }
  return <button type="button" {...props} className={classes} />;
}
