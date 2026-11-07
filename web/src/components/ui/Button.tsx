import Link from "next/link";
import type { ComponentProps } from "react";
import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge does not know our text-* and shadow-* tokens from globals.css, so it
// would take text-body-sm for a text color and drop the variant's color. Registering
// them as font sizes and shadows keeps each in its own group
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "display-hero",
            "display-hero-mobile",
            "headline-lg",
            "headline-lg-mobile",
            "headline-md",
            "headline-sm",
            "metric-huge",
            "body-lg",
            "body-md",
            "body-sm",
            "label-caps",
            "label-badge",
          ],
        },
      ],
      shadow: [{ shadow: ["kinetic-glow", "button-glow", "error-glow"] }],
    },
  },
});

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
  const classes = twMerge(base, variants[variant], className);

  if (props.href !== undefined) {
    return <Link {...props} className={classes} />;
  }
  return <button type="button" {...props} className={classes} />;
}
