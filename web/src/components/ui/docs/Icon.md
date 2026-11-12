# Icon

- **File:** `Icon.tsx`
- **Purpose:** StrideSync's own SVG icons (20, in `icons.ts`), painted with `currentColor`.
- **Props:** `name`: key of `icons.ts` (`dashboard`, `calendar`, `logout`...). `size` in px (24 by default). Without `title` it is decorative (`aria-hidden`); with `title` it is an image with that accessible name. Accepts the rest of the `<svg>` props.
- **Example:** `<Icon name="logout" className="text-text-secondary" />`, or `<Icon name="help" size={20} title="Help" />` if the icon stands alone, with no text next to it.
