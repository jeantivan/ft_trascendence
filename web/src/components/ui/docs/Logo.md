# Logo

- **File:** `Logo.tsx`
- **Purpose:** StrideSync logo (inline SVG, with its own colors: it does not use tokens, on purpose).
- **Props:** `variant`: `full` (default, mark + text) or `mark` (only the square with the bolt, for the collapsed sidebar). The size comes from `className` (`h-8 w-auto`). Accepts the rest of the `<svg>` props.
- **Example:** `<Logo className="h-8 w-auto" />`, or `<Logo variant="mark" className="size-10" />` for the mark only.
