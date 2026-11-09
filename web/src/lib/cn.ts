import { extendTailwindMerge } from "tailwind-merge";

// Joins class names and resolves conflicts: the last one of each kind wins, so a
// className passed to a component overrides the component's own classes.
// tailwind-merge does not know the tokens of globals.css, so each one is registered
// by the group it belongs to (px-margin next to px-6, text-body-sm next to text-volt).
// A new token in globals.css needs its name here; tests/unit/cn.test.ts reads the file
// and fails if one is missing
export const cn = extendTailwindMerge({
  extend: {
    theme: {
      // --spacing-*: gutter, margin and rail work in px-*, gap-*, w-*...
      spacing: [
        "gutter",
        "gutter-desktop",
        "margin",
        "margin-tablet",
        "margin-desktop",
        "rail",
        "rail-collapsed",
      ],
      // --text-*: the type scale (size). A text color is a different group
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
      // --shadow-*
      shadow: ["kinetic-glow", "button-glow", "error-glow"],
      // --container-*: max-w-content
      container: ["content"],
    },
  },
});
