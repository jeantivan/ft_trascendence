# Card

- **File:** `Card.tsx`
- **Purpose:** elevated container (`surface-elevated`, `rounded-lg`, `border-subtle`, `p-6`) for forms, sections and session blocks.
- **Props:** accepts the `<div>` props and `className` (layout such as `flex flex-col gap-4` goes there). `as`: `div` (default) or `section`; a `section` should have `aria-labelledby`. `accent`: `rodaje`, `intervalos`, `cuestas`, `tirada_larga` or `fartlek` (the Prisma `SessionType`, so `session.type` can be passed as is) adds the 4px left bar in that session type's color (the Session Card of `DESIGN.md`).
- **Example:** `<Card as="section" aria-labelledby="title" className="flex flex-col gap-4">…</Card>`, or `<Card accent="intervalos">…</Card>` for a session.
